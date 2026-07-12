-- Site-seat log workflows (ADR-0023): delegation-of-authority and training
-- logs as dated fact rows with derived status, plus the site_staff access
-- role that makes the site seat a permission scope (ADR-0001/0008). The
-- signed DoA log document (artifact 05.03.01) stays the authoritative Part 11
-- record; these rows are the queryable operational layer beside it.

-- Postgres 16 allows ADD VALUE inside the migration transaction as long as
-- the value is not used before commit — the seed writes the first grant.
ALTER TYPE "public"."access_role" ADD VALUE IF NOT EXISTS 'site_staff';--> statement-breakpoint

CREATE TABLE "delegation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_site_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"delegated_tasks" text[] NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"authorized_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegation_tasks_not_empty" CHECK (cardinality("delegated_tasks") > 0),
	CONSTRAINT "delegation_dates_ordered" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
	-- A PI does not delegate to themselves; their authority is the 1572.
	CONSTRAINT "delegation_not_self" CHECK ("person_id" <> "authorized_by")
);--> statement-breakpoint
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_study_site_id_study_site_id_fk"
  FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_person_id_person_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_authorized_by_person_id_fk"
  FOREIGN KEY ("authorized_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delegation_site_idx" ON "delegation" ("study_site_id");--> statement-breakpoint
CREATE INDEX "delegation_person_idx" ON "delegation" ("person_id");--> statement-breakpoint

CREATE TABLE "training_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_site_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"trained_on" date NOT NULL,
	"expires_at" date,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_record_topic_not_blank" CHECK (length(btrim("topic")) > 0),
	CONSTRAINT "training_record_dates_ordered" CHECK ("expires_at" IS NULL OR "expires_at" > "trained_on")
);--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_study_site_id_study_site_id_fk"
  FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_person_id_person_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_document_id_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_record_site_idx" ON "training_record" ("study_site_id");--> statement-breakpoint
CREATE INDEX "training_record_person_idx" ON "training_record" ("person_id");--> statement-breakpoint

-- Audited like every other operational fact. Rows are never deleted; ending a
-- delegation is the one permitted mutation (setting end_date), itself audited
-- with before/after row images.
CREATE TRIGGER delegation_audit AFTER INSERT OR UPDATE OR DELETE ON delegation
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint
CREATE TRIGGER training_record_audit AFTER INSERT OR UPDATE OR DELETE ON training_record
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint

-- Delegation log with derived status and the cross-checks the oversight seat
-- wants: did the authorizer actually hold an active PI role at this site on
-- the delegation's start date, and does the delegate have open credential
-- items (expired license, missing GCP) in the document record next door.
CREATE VIEW v_delegation_log AS
SELECT
  d.id AS delegation_id,
  ss.study_id,
  d.study_site_id,
  ss.site_number,
  si.name AS site_name,
  d.person_id,
  p.given_name,
  p.family_name,
  p.credentials,
  d.delegated_tasks,
  d.start_date,
  d.end_date,
  d.authorized_by,
  ap.given_name AS authorizer_given_name,
  ap.family_name AS authorizer_family_name,
  EXISTS (
    SELECT 1 FROM study_site_role ssr
    WHERE ssr.study_site_id = d.study_site_id
      AND ssr.person_id = d.authorized_by
      AND ssr.role = 'principal_investigator'
      AND ssr.start_date <= d.start_date
      AND (ssr.end_date IS NULL OR ssr.end_date >= d.start_date)
  ) AS authorizer_was_pi,
  coalesce(ci.open_count, 0)::int AS credential_open_items,
  CASE
    WHEN d.end_date IS NOT NULL AND d.end_date < CURRENT_DATE THEN 'ended'
    ELSE 'active'
  END AS status
FROM delegation d
JOIN study_site ss ON ss.id = d.study_site_id
JOIN site si ON si.id = ss.site_id
JOIN person p ON p.id = d.person_id
JOIN person ap ON ap.id = d.authorized_by
LEFT JOIN LATERAL (
  SELECT count(*) AS open_count
  FROM v_expected_document_status v
  WHERE v.person_id = d.person_id
    AND v.study_site_id = d.study_site_id
    AND v.status NOT IN ('current', 'waived')
) ci ON true;--> statement-breakpoint

-- Training log with the same 60-day expiring_soon window the document views
-- use; a linked certificate document carries its own status along.
CREATE VIEW v_training_log AS
SELECT
  tr.id AS training_record_id,
  ss.study_id,
  tr.study_site_id,
  ss.site_number,
  si.name AS site_name,
  tr.person_id,
  p.given_name,
  p.family_name,
  p.credentials,
  tr.topic,
  tr.trained_on,
  tr.expires_at,
  tr.document_id,
  doc.status AS document_status,
  CASE
    WHEN tr.expires_at IS NOT NULL AND tr.expires_at < CURRENT_DATE THEN 'expired'
    WHEN tr.expires_at IS NOT NULL AND tr.expires_at < CURRENT_DATE + 60 THEN 'expiring_soon'
    ELSE 'current'
  END AS status
FROM training_record tr
JOIN study_site ss ON ss.id = tr.study_site_id
JOIN site si ON si.id = ss.site_id
JOIN person p ON p.id = tr.person_id
LEFT JOIN document doc ON doc.id = tr.document_id;--> statement-breakpoint

-- The analyst role reads the new views and tables like everything else; the
-- seed creates it in dev, a deployment may not have it yet (0008 pattern).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON delegation, training_record, v_delegation_log, v_training_log
      TO ctms_readonly;
  END IF;
END $$;
