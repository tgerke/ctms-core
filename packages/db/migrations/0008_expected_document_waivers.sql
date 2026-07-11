-- Expected-document waivers (ADR-0016): an admin can record why an expected
-- document is not applicable ("central IRB — no local approval letter"), so
-- the absence itself is explained instead of showing as a permanent gap. A
-- waiver is a dated fact row the status views read (ADR-0006 resolve pattern,
-- like issue.resolved_at) — lifting one sets revoked_*, never deletes; the
-- audit trigger preserves the full history. A waiver only ever covers an
-- absence: any filed document (pending, current, expired, ...) wins over it.

CREATE TABLE "expected_document_waiver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expected_document_id" uuid NOT NULL,
	"waived_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"waived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	CONSTRAINT "expected_document_waiver_reason_not_blank" CHECK (length(btrim("reason")) > 0),
	-- Revocation is all-or-nothing: who, when, and why arrive together.
	CONSTRAINT "expected_document_waiver_revoke_complete" CHECK (
	  ("revoked_at" IS NULL AND "revoked_by" IS NULL AND "revoke_reason" IS NULL)
	  OR ("revoked_at" IS NOT NULL AND "revoked_by" IS NOT NULL
	      AND "revoke_reason" IS NOT NULL AND length(btrim("revoke_reason")) > 0)
	)
);--> statement-breakpoint
ALTER TABLE "expected_document_waiver" ADD CONSTRAINT "expected_document_waiver_expected_document_id_expected_document_id_fk"
  FOREIGN KEY ("expected_document_id") REFERENCES "public"."expected_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_document_waiver" ADD CONSTRAINT "expected_document_waiver_waived_by_person_id_fk"
  FOREIGN KEY ("waived_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_document_waiver" ADD CONSTRAINT "expected_document_waiver_revoked_by_person_id_fk"
  FOREIGN KEY ("revoked_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "expected_document_waiver_expected_idx"
  ON "expected_document_waiver" ("expected_document_id");--> statement-breakpoint
-- At most one active waiver per expected document; history accumulates as
-- revoked rows.
CREATE UNIQUE INDEX "expected_document_waiver_active_idx"
  ON "expected_document_waiver" ("expected_document_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint

-- Audited like every other admin fact; not immutable — the one permitted
-- mutation (setting the revoke fields once) is itself an audited fact, and
-- the CHECK above stops a revocation from being reworded after the fact.
CREATE TRIGGER expected_document_waiver_audit AFTER INSERT OR UPDATE OR DELETE ON expected_document_waiver
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint

-- Rebuild the derived-status views to carry 'waived' through. Dropped and
-- recreated (not REPLACEd) because the waiver columns land mid-column-list.
DROP VIEW v_study_site_completeness;--> statement-breakpoint
DROP VIEW v_expected_document_status;--> statement-breakpoint

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
    ) AS effective_expiry,
    w.id AS waiver_id,
    w.reason AS waiver_reason,
    w.waived_at,
    w.waived_by,
    wp.given_name AS waived_by_given_name,
    wp.family_name AS waived_by_family_name
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
             (d.status::text = 'returned') DESC,
             d.effective_date DESC NULLS LAST,
             d.created_at DESC
    LIMIT 1
  ) d ON true
  LEFT JOIN expected_document_waiver w
    ON w.expected_document_id = ed.id AND w.revoked_at IS NULL
  LEFT JOIN person wp ON wp.id = w.waived_by
)
SELECT
  m.*,
  CASE
    -- A waiver explains an absence; it never overrides a filed document.
    WHEN m.document_id IS NULL AND m.waiver_id IS NOT NULL THEN 'waived'
    WHEN m.document_id IS NULL THEN 'missing'
    WHEN m.document_status = 'pending_review' THEN 'pending_review'
    WHEN m.document_status::text = 'returned' THEN 'returned'
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
  count(*) FILTER (WHERE s.status = 'returned') AS returned_count,
  count(*) FILTER (WHERE s.status = 'expired') AS expired_count,
  count(*) FILTER (WHERE s.status = 'superseded') AS superseded_count,
  count(*) FILTER (WHERE s.status = 'missing') AS missing_count,
  count(*) FILTER (WHERE s.status = 'waived') AS waived_count,
  -- Waived requirements are satisfied-by-explanation: they leave the
  -- denominator rather than counting as gaps.
  round(100.0 * count(*) FILTER (WHERE s.status = 'current')
    / NULLIF(count(*) - count(*) FILTER (WHERE s.status = 'waived'), 0), 1) AS pct_current
FROM v_expected_document_status s
WHERE s.study_site_id IS NOT NULL
GROUP BY s.study_id, s.study_site_id;
--> statement-breakpoint

-- DROP VIEW discarded the analyst role's grants (ctms_app is covered by the
-- default privileges from 0004). Re-grant where the role exists — the seed
-- creates it in dev; a deployment may not have it yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON v_expected_document_status, v_study_site_completeness,
                    expected_document_waiver TO ctms_readonly;
  END IF;
END $$;
