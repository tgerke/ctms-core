-- Screening log + entry-level e-signatures (ADR-0036). The screening log is
-- the site's operational record of its own screening activity: pseudonymous
-- site-assigned numbers and dated disposition facts, no clinical data — the
-- EDC boundary (ADR-0011) stands. log_signature carries §11.200-ceremonied
-- signatures on individual log entries (delegation, training, screening),
-- bound by hash to the entry's facts at signing.

CREATE TABLE "screening_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_site_id" uuid NOT NULL,
	"screening_number" text NOT NULL,
	"screened_on" date NOT NULL,
	"enrolled_on" date,
	"screen_failed_on" date,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_entry_number_not_blank" CHECK (length(btrim("screening_number")) > 0),
	-- At most one outcome, ever; recording it is the row's single permitted
	-- mutation (the delegation end_date pattern, ADR-0023).
	CONSTRAINT "screening_entry_one_outcome" CHECK ("enrolled_on" IS NULL OR "screen_failed_on" IS NULL),
	CONSTRAINT "screening_entry_dates_ordered" CHECK (
	  ("enrolled_on" IS NULL OR "enrolled_on" >= "screened_on")
	  AND ("screen_failed_on" IS NULL OR "screen_failed_on" >= "screened_on")),
	-- A screen failure carries its reason; nothing else does.
	CONSTRAINT "screening_entry_failure_reason" CHECK (
	  (("screen_failed_on" IS NULL) = ("failure_reason" IS NULL))
	  AND ("failure_reason" IS NULL OR length(btrim("failure_reason")) > 0))
);--> statement-breakpoint
ALTER TABLE "screening_entry" ADD CONSTRAINT "screening_entry_study_site_id_study_site_id_fk"
  FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "screening_entry_site_number_idx" ON "screening_entry" ("study_site_id","screening_number");--> statement-breakpoint

-- Entry-level e-signatures (ADR-0036): append-only beside the entry tables,
-- the same discipline as signature beside document_version. Exactly one
-- entry reference per row; reauth evidence is NOT NULL from birth — this
-- table needs none of 0003's retrofit exemption.
CREATE TABLE "log_signature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delegation_id" uuid,
	"training_record_id" uuid,
	"screening_entry_id" uuid,
	"signer_person_id" uuid NOT NULL,
	"meaning" "signature_meaning" NOT NULL,
	-- SHA-256 of the canonical serialization of the entry's fact columns at
	-- signing (logEntrySha256 in @ctms/db): the §11.70-style binding. A later
	-- permitted mutation (end date, outcome) is detectable as a derived
	-- facts_match = false at read time, never hidden.
	"signed_sha256" char(64) NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reauth_method" "reauth_method" NOT NULL,
	"reauth_at" timestamp with time zone NOT NULL,
	CONSTRAINT "log_signature_one_entry" CHECK (
	  num_nonnulls("delegation_id", "training_record_id", "screening_entry_id") = 1)
);--> statement-breakpoint
ALTER TABLE "log_signature" ADD CONSTRAINT "log_signature_delegation_id_delegation_id_fk"
  FOREIGN KEY ("delegation_id") REFERENCES "public"."delegation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_signature" ADD CONSTRAINT "log_signature_training_record_id_training_record_id_fk"
  FOREIGN KEY ("training_record_id") REFERENCES "public"."training_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_signature" ADD CONSTRAINT "log_signature_screening_entry_id_screening_entry_id_fk"
  FOREIGN KEY ("screening_entry_id") REFERENCES "public"."screening_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_signature" ADD CONSTRAINT "log_signature_signer_person_id_person_id_fk"
  FOREIGN KEY ("signer_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "log_signature_delegation_idx" ON "log_signature" ("delegation_id");--> statement-breakpoint
CREATE INDEX "log_signature_training_record_idx" ON "log_signature" ("training_record_id");--> statement-breakpoint
CREATE INDEX "log_signature_screening_entry_idx" ON "log_signature" ("screening_entry_id");--> statement-breakpoint

CREATE TRIGGER screening_entry_audit AFTER INSERT OR UPDATE OR DELETE ON screening_entry
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint
-- Signatures are immutable like signature rows (0001 pattern) and audited.
CREATE TRIGGER log_signature_immutable BEFORE UPDATE OR DELETE ON log_signature
  FOR EACH ROW EXECUTE FUNCTION ctms_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER log_signature_audit AFTER INSERT ON log_signature
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint

-- Screening log with derived disposition status — never stored (ADR-0006).
CREATE VIEW v_screening_log AS
SELECT
  se.id AS screening_entry_id,
  ss.study_id,
  se.study_site_id,
  ss.site_number,
  si.name AS site_name,
  se.screening_number,
  se.screened_on,
  se.enrolled_on,
  se.screen_failed_on,
  se.failure_reason,
  CASE
    WHEN se.enrolled_on IS NOT NULL THEN 'enrolled'
    WHEN se.screen_failed_on IS NOT NULL THEN 'screen_failed'
    ELSE 'in_screening'
  END AS status
FROM screening_entry se
JOIN study_site ss ON ss.id = se.study_site_id
JOIN site si ON si.id = ss.site_id;--> statement-breakpoint

-- The log's counts beside the site's latest as-reported aggregates
-- (enrollment_report, ADR-0011): the oversight cross-check. A site whose log
-- disagrees with its own report flags itself; the EDC boundary stands.
CREATE VIEW v_screening_summary AS
SELECT
  ss.study_id,
  ss.id AS study_site_id,
  ss.site_number,
  si.name AS site_name,
  coalesce(l.screened_total, 0)::int AS log_screened,
  coalesce(l.enrolled_total, 0)::int AS log_enrolled,
  coalesce(l.screen_failed_total, 0)::int AS log_screen_failed,
  coalesce(l.in_screening_total, 0)::int AS log_in_screening,
  er.as_of_date AS reported_as_of,
  er.screened AS reported_screened,
  er.enrolled AS reported_enrolled
FROM study_site ss
JOIN site si ON si.id = ss.site_id
LEFT JOIN LATERAL (
  SELECT
    count(*) AS screened_total,
    count(*) FILTER (WHERE se.enrolled_on IS NOT NULL) AS enrolled_total,
    count(*) FILTER (WHERE se.screen_failed_on IS NOT NULL) AS screen_failed_total,
    count(*) FILTER (WHERE se.enrolled_on IS NULL AND se.screen_failed_on IS NULL) AS in_screening_total
  FROM screening_entry se
  WHERE se.study_site_id = ss.id
) l ON true
LEFT JOIN LATERAL (
  SELECT er.as_of_date, er.screened, er.enrolled
  FROM enrollment_report er
  WHERE er.study_site_id = ss.id
  ORDER BY er.as_of_date DESC
  LIMIT 1
) er ON true;--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON screening_entry, log_signature, v_screening_log, v_screening_summary
      TO ctms_readonly;
  END IF;
END $$;
