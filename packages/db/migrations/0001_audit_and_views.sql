-- Custom migration: compliance machinery + requirement engine + derived views.
-- Everything here is deliberately in the database (see ADR-0003, ADR-0004):
-- audit and immutability hold for every write path, not just well-behaved app code.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Scope validity: person-scoped documents are filed per site.
ALTER TABLE "document" ADD CONSTRAINT document_scope_check
  CHECK (person_id IS NULL OR study_site_id IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "expected_document" ADD CONSTRAINT expected_document_scope_unique
  UNIQUE NULLS NOT DISTINCT (rule_id, study_site_id, person_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Immutability: document versions, signatures, and audit events can never be
-- updated or deleted, by any role. Part 11 §11.10(e): changes shall not
-- obscure previously recorded information.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ctms_forbid_mutation() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION '% rows are immutable (append-only): % rejected', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION ctms_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER document_version_immutable BEFORE UPDATE OR DELETE ON document_version
  FOR EACH ROW EXECUTE FUNCTION ctms_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER signature_immutable BEFORE UPDATE OR DELETE ON signature
  FOR EACH ROW EXECUTE FUNCTION ctms_forbid_mutation();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Audit trail: AFTER-triggers on every domain table write hash-chained events.
-- Actor identity comes from per-transaction settings established by the API
-- (set_config('ctms.actor_id' / 'ctms.actor_label', ..., true)); writes made
-- without them are attributed to 'system'.
--
-- Chain: hash = sha256(prev_hash || action || actor_id || actor_label ||
--                      entity_id || before || after || occurred_at)
-- computed from the stored columns, so ctms_verify_audit_chain() can replay
-- and detect any retroactive edit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ctms_audit() RETURNS trigger AS $fn$
DECLARE
  v_now timestamptz := now();
  v_actor uuid := nullif(current_setting('ctms.actor_id', true), '')::uuid;
  v_label text := coalesce(nullif(current_setting('ctms.actor_label', true), ''), 'system');
  v_prev char(64);
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
  v_action text := lower(TG_TABLE_NAME) || '.' || lower(TG_OP);
  v_hash char(64);
BEGIN
  -- Serialize chain appends; xact-scoped lock releases on commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext('ctms_audit_chain'));
  SELECT hash INTO v_prev FROM audit_event ORDER BY id DESC LIMIT 1;
  IF v_prev IS NULL THEN
    v_prev := repeat('0', 64);
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSE
    v_before := to_jsonb(OLD);
  END IF;
  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id');
  v_hash := encode(digest(
    v_prev || v_action || coalesce(v_actor::text, '') || v_label
      || coalesce(v_entity_id, '') || coalesce(v_before::text, '')
      || coalesce(v_after::text, '') || v_now::text,
    'sha256'), 'hex');
  INSERT INTO audit_event
    (occurred_at, actor_id, actor_label, action, entity_type, entity_id,
     before, after, prev_hash, hash)
  VALUES
    (v_now, v_actor, v_label, v_action, TG_TABLE_NAME, v_entity_id,
     v_before, v_after, v_prev, v_hash);
  RETURN coalesce(NEW, OLD);
END
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER organization_audit AFTER INSERT OR UPDATE OR DELETE ON organization
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER study_audit AFTER INSERT OR UPDATE OR DELETE ON study
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER protocol_version_audit AFTER INSERT OR UPDATE OR DELETE ON protocol_version
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER site_audit AFTER INSERT OR UPDATE OR DELETE ON site
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER study_site_audit AFTER INSERT OR UPDATE OR DELETE ON study_site
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER person_audit AFTER INSERT OR UPDATE OR DELETE ON person
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER study_site_role_audit AFTER INSERT OR UPDATE OR DELETE ON study_site_role
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER document_audit AFTER INSERT OR UPDATE OR DELETE ON document
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER document_version_audit AFTER INSERT ON document_version
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER signature_audit AFTER INSERT ON signature
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER requirement_rule_audit AFTER INSERT OR UPDATE OR DELETE ON requirement_rule
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ctms_verify_audit_chain()
RETURNS TABLE (event_id bigint, problem text) AS $fn$
DECLARE
  r record;
  v_prev char(64) := repeat('0', 64);
  v_expected char(64);
BEGIN
  FOR r IN SELECT * FROM audit_event ORDER BY id LOOP
    IF r.prev_hash <> v_prev THEN
      event_id := r.id; problem := 'prev_hash does not match preceding event';
      RETURN NEXT;
    END IF;
    v_expected := encode(digest(
      r.prev_hash || r.action || coalesce(r.actor_id::text, '') || r.actor_label
        || coalesce(r.entity_id, '') || coalesce(r.before::text, '')
        || coalesce(r.after::text, '') || r.occurred_at::text,
      'sha256'), 'hex');
    IF r.hash <> v_expected THEN
      event_id := r.id; problem := 'hash does not match recomputed value';
      RETURN NEXT;
    END IF;
    v_prev := r.hash;
  END LOOP;
END
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Requirement engine: materialize expected-document placeholders from rules.
-- Idempotent; call after rules, sites, or staff change.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ctms_sync_expected_documents(p_study uuid) RETURNS integer AS $fn$
DECLARE
  v_inserted integer := 0;
  v_count integer;
BEGIN
  INSERT INTO expected_document (rule_id, study_id)
  SELECT rr.id, rr.study_id
  FROM requirement_rule rr
  WHERE rr.study_id = p_study AND rr.scope_level = 'study'
  ON CONFLICT ON CONSTRAINT expected_document_scope_unique DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_inserted := v_inserted + v_count;

  INSERT INTO expected_document (rule_id, study_id, study_site_id)
  SELECT rr.id, rr.study_id, ss.id
  FROM requirement_rule rr
  JOIN study_site ss ON ss.study_id = rr.study_id
  WHERE rr.study_id = p_study
    AND rr.scope_level = 'study_site'
    AND ss.status IN ('pending', 'active')
  ON CONFLICT ON CONSTRAINT expected_document_scope_unique DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_inserted := v_inserted + v_count;

  INSERT INTO expected_document (rule_id, study_id, study_site_id, person_id)
  SELECT DISTINCT rr.id, rr.study_id, ssr.study_site_id, ssr.person_id
  FROM requirement_rule rr
  JOIN study_site ss ON ss.study_id = rr.study_id AND ss.status IN ('pending', 'active')
  JOIN study_site_role ssr ON ssr.study_site_id = ss.id
  WHERE rr.study_id = p_study
    AND rr.scope_level = 'person_role'
    AND (rr.applies_to_roles IS NULL OR ssr.role::text = ANY (rr.applies_to_roles))
    AND (ssr.end_date IS NULL OR ssr.end_date >= CURRENT_DATE)
  ON CONFLICT ON CONSTRAINT expected_document_scope_unique DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_inserted := v_inserted + v_count;

  -- Drop unfulfilled placeholders whose scope entity left (site closed, role
  -- ended). Fulfilled ones stay: they are historical record.
  DELETE FROM expected_document ed
  USING requirement_rule rr
  WHERE ed.rule_id = rr.id
    AND rr.study_id = p_study
    AND (
      (rr.scope_level = 'study_site' AND NOT EXISTS (
        SELECT 1 FROM study_site ss
        WHERE ss.id = ed.study_site_id AND ss.status IN ('pending', 'active')))
      OR
      (rr.scope_level = 'person_role' AND NOT EXISTS (
        SELECT 1 FROM study_site_role ssr
        WHERE ssr.study_site_id = ed.study_site_id
          AND ssr.person_id = ed.person_id
          AND (rr.applies_to_roles IS NULL OR ssr.role::text = ANY (rr.applies_to_roles))
          AND (ssr.end_date IS NULL OR ssr.end_date >= CURRENT_DATE)))
    )
    AND NOT EXISTS (
      SELECT 1 FROM document d
      WHERE d.tmf_artifact_id = rr.tmf_artifact_id
        AND d.study_id = ed.study_id
        AND d.study_site_id IS NOT DISTINCT FROM ed.study_site_id
        AND d.person_id IS NOT DISTINCT FROM ed.person_id
    );

  RETURN v_inserted;
END
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Derived status views (ADR-0004): no stored status anywhere; completeness is
-- always computed from document ground truth.
-- ---------------------------------------------------------------------------

CREATE VIEW v_expected_document_status AS
WITH matched AS (
  SELECT
    ed.id AS expected_document_id,
    ed.rule_id,
    rr.name AS rule_name,
    rr.scope_level,
    rr.requires_signature,
    rr.validity_months,
    ed.study_id,
    ed.study_site_id,
    ed.person_id,
    rr.tmf_artifact_id,
    ta.code AS artifact_code,
    ta.name AS artifact_name,
    tsec.code AS section_code,
    tz.number AS zone_number,
    tz.name AS zone_name,
    d.id AS document_id,
    d.title AS document_title,
    d.status AS document_status,
    d.effective_date,
    least(
      d.expires_at,
      CASE WHEN rr.validity_months IS NOT NULL AND d.effective_date IS NOT NULL
        THEN (d.effective_date + (rr.validity_months || ' months')::interval)::date
      END
    ) AS effective_expiry
  FROM expected_document ed
  JOIN requirement_rule rr ON rr.id = ed.rule_id
  JOIN tmf_artifact ta ON ta.id = rr.tmf_artifact_id
  JOIN tmf_section tsec ON tsec.id = ta.section_id
  JOIN tmf_zone tz ON tz.id = tsec.zone_id
  LEFT JOIN LATERAL (
    SELECT d.*
    FROM document d
    WHERE d.tmf_artifact_id = rr.tmf_artifact_id
      AND d.study_id = ed.study_id
      AND d.study_site_id IS NOT DISTINCT FROM ed.study_site_id
      AND d.person_id IS NOT DISTINCT FROM ed.person_id
    ORDER BY (d.status = 'effective') DESC,
             (d.status = 'pending_review') DESC,
             d.effective_date DESC NULLS LAST,
             d.created_at DESC
    LIMIT 1
  ) d ON true
)
SELECT
  m.*,
  CASE
    WHEN m.document_id IS NULL THEN 'missing'
    WHEN m.document_status = 'pending_review' THEN 'pending_review'
    WHEN m.document_status = 'superseded' THEN 'superseded'
    WHEN m.effective_expiry IS NOT NULL AND m.effective_expiry < CURRENT_DATE THEN 'expired'
    WHEN m.effective_expiry IS NOT NULL
      AND m.effective_expiry < CURRENT_DATE + 60 THEN 'expiring_soon'
    ELSE 'current'
  END AS status
FROM matched m;
--> statement-breakpoint

CREATE VIEW v_study_site_completeness AS
SELECT
  s.study_id,
  s.study_site_id,
  count(*) AS total,
  count(*) FILTER (WHERE s.status = 'current') AS current_count,
  count(*) FILTER (WHERE s.status = 'expiring_soon') AS expiring_soon_count,
  count(*) FILTER (WHERE s.status = 'pending_review') AS pending_review_count,
  count(*) FILTER (WHERE s.status = 'expired') AS expired_count,
  count(*) FILTER (WHERE s.status = 'superseded') AS superseded_count,
  count(*) FILTER (WHERE s.status = 'missing') AS missing_count,
  round(100.0 * count(*) FILTER (WHERE s.status = 'current') / count(*), 1) AS pct_current
FROM v_expected_document_status s
WHERE s.study_site_id IS NOT NULL
GROUP BY s.study_id, s.study_site_id;
