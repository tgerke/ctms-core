-- Return-for-correction (ADR-0015): a reviewer with approval authority can
-- send a pending_review version back with a documented reason. The reason is
-- an immutable, audited fact row; the document carries the lifecycle state
-- ('returned') like every other transition. A returned version can never be
-- approved — the fix is a corrected version (or, for per-visit records, a
-- corrected document), same fix-forward stance as "no delete button".
--
-- Enum comparisons in the views below are written against ::text because the
-- new enum value cannot be referenced in the transaction that adds it.
ALTER TYPE "public"."document_status" ADD VALUE 'returned';--> statement-breakpoint

CREATE TABLE "document_return" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"returned_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_return_reason_not_blank" CHECK (length(btrim("reason")) > 0)
);--> statement-breakpoint
ALTER TABLE "document_return" ADD CONSTRAINT "document_return_document_version_id_document_version_id_fk"
  FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_return" ADD CONSTRAINT "document_return_returned_by_person_id_fk"
  FOREIGN KEY ("returned_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Same treatment as signatures: append-only, audited.
CREATE TRIGGER document_return_immutable BEFORE UPDATE OR DELETE ON document_return
  FOR EACH ROW EXECUTE FUNCTION ctms_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER document_return_audit AFTER INSERT OR UPDATE OR DELETE ON document_return
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint

-- Rebuild the derived-status views to carry 'returned' through. Dropped and
-- recreated (not REPLACEd) because returned_count lands mid-column-list.
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
             (d.status::text = 'returned') DESC,
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
  round(100.0 * count(*) FILTER (WHERE s.status = 'current') / count(*), 1) AS pct_current
FROM v_expected_document_status s
WHERE s.study_site_id IS NOT NULL
GROUP BY s.study_id, s.study_site_id;
--> statement-breakpoint

-- A returned trip report puts the visit back at awaiting_report: the next
-- step is uploading a corrected report from the visit page.
CREATE OR REPLACE VIEW v_monitoring_visit_status AS
SELECT
  mv.id AS monitoring_visit_id,
  ss.study_id,
  mv.study_site_id,
  ss.site_number,
  si.name AS site_name,
  mv.visit_type,
  mv.scheduled_date,
  mv.visit_date,
  mv.monitor_person_id,
  mp.given_name AS monitor_given_name,
  mp.family_name AS monitor_family_name,
  mv.summary,
  tr.document_id AS trip_report_document_id,
  tr.status AS trip_report_status,
  coalesce(ai.open_count, 0)::int AS open_action_items,
  coalesce(ai.total_count, 0)::int AS total_action_items,
  CASE
    WHEN mv.visit_date IS NULL AND mv.scheduled_date >= CURRENT_DATE THEN 'scheduled'
    WHEN mv.visit_date IS NULL THEN 'overdue'
    WHEN tr.document_id IS NULL OR tr.status::text = 'returned' THEN 'awaiting_report'
    WHEN tr.status = 'pending_review' THEN 'report_pending_review'
    WHEN coalesce(ai.open_count, 0) > 0 THEN 'follow_up'
    ELSE 'complete'
  END AS stage
FROM monitoring_visit mv
JOIN study_site ss ON ss.id = mv.study_site_id
JOIN site si ON si.id = ss.site_id
LEFT JOIN person mp ON mp.id = mv.monitor_person_id
LEFT JOIN LATERAL (
  SELECT d.id AS document_id, d.status
  FROM monitoring_visit_document mvd
  JOIN document d ON d.id = mvd.document_id
  WHERE mvd.monitoring_visit_id = mv.id AND mvd.link_kind = 'trip_report'
  ORDER BY d.created_at DESC
  LIMIT 1
) tr ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE vai.resolved_at IS NULL) AS open_count,
         count(*) AS total_count
  FROM visit_action_item vai
  WHERE vai.monitoring_visit_id = mv.id
) ai ON true;
--> statement-breakpoint

-- DROP VIEW discarded the analyst role's grants (ctms_app is covered by the
-- default privileges from 0004). Re-grant where the role exists — the seed
-- creates it in dev; a deployment may not have it yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON v_expected_document_status, v_study_site_completeness,
                    document_return TO ctms_readonly;
  END IF;
END $$;
