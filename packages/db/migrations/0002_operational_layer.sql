CREATE TYPE "public"."issue_category" AS ENUM('protocol_deviation', 'monitoring_finding', 'safety', 'data_quality', 'other');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."visit_document_link" AS ENUM('trip_report', 'confirmation_letter', 'follow_up_letter');--> statement-breakpoint
CREATE TYPE "public"."visit_type" AS ENUM('pre_study', 'initiation', 'interim', 'close_out');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_site_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"screened" integer DEFAULT 0 NOT NULL,
	"enrolled" integer DEFAULT 0 NOT NULL,
	"withdrawn" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"reported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"study_site_id" uuid,
	"monitoring_visit_id" uuid,
	"category" "issue_category" NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"identified_date" date NOT NULL,
	"identified_by" uuid,
	"due_date" date,
	"resolved_at" date,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_site_id" uuid NOT NULL,
	"visit_type" "visit_type" NOT NULL,
	"scheduled_date" date NOT NULL,
	"visit_date" date,
	"monitor_person_id" uuid,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_visit_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitoring_visit_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"link_kind" "visit_document_link" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_milestone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"study_site_id" uuid,
	"name" text NOT NULL,
	"planned_date" date NOT NULL,
	"actual_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visit_action_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitoring_visit_id" uuid NOT NULL,
	"description" text NOT NULL,
	"due_date" date,
	"resolved_at" date,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_site" ADD COLUMN "target_enrollment" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_report" ADD CONSTRAINT "enrollment_report_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_report" ADD CONSTRAINT "enrollment_report_reported_by_person_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue" ADD CONSTRAINT "issue_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue" ADD CONSTRAINT "issue_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue" ADD CONSTRAINT "issue_monitoring_visit_id_monitoring_visit_id_fk" FOREIGN KEY ("monitoring_visit_id") REFERENCES "public"."monitoring_visit"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue" ADD CONSTRAINT "issue_identified_by_person_id_fk" FOREIGN KEY ("identified_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue" ADD CONSTRAINT "issue_resolved_by_person_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_visit" ADD CONSTRAINT "monitoring_visit_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_visit" ADD CONSTRAINT "monitoring_visit_monitor_person_id_person_id_fk" FOREIGN KEY ("monitor_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_visit_document" ADD CONSTRAINT "monitoring_visit_document_monitoring_visit_id_monitoring_visit_id_fk" FOREIGN KEY ("monitoring_visit_id") REFERENCES "public"."monitoring_visit"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitoring_visit_document" ADD CONSTRAINT "monitoring_visit_document_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_milestone" ADD CONSTRAINT "study_milestone_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_milestone" ADD CONSTRAINT "study_milestone_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_action_item" ADD CONSTRAINT "visit_action_item_monitoring_visit_id_monitoring_visit_id_fk" FOREIGN KEY ("monitoring_visit_id") REFERENCES "public"."monitoring_visit"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_action_item" ADD CONSTRAINT "visit_action_item_resolved_by_person_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "enrollment_report_site_date_idx" ON "enrollment_report" USING btree ("study_site_id","as_of_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_study_idx" ON "issue" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_site_idx" ON "issue" USING btree ("study_site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitoring_visit_site_idx" ON "monitoring_visit" USING btree ("study_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitoring_visit_document_idx" ON "monitoring_visit_document" USING btree ("monitoring_visit_id","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_milestone_study_idx" ON "study_milestone" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_action_item_visit_idx" ON "visit_action_item" USING btree ("monitoring_visit_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Custom DDL appended to the generated migration (ADR-0006): constraints
-- drizzle can't express, audit triggers for the new tables, and the derived
-- lifecycle views. Stages are never stored — these views are the only source.
-- ---------------------------------------------------------------------------

ALTER TABLE "enrollment_report" ADD CONSTRAINT enrollment_report_counts_check
  CHECK (screened >= 0 AND enrolled >= 0 AND withdrawn >= 0 AND completed >= 0
         AND enrolled >= withdrawn + completed);
--> statement-breakpoint

ALTER TABLE "study_milestone" ADD CONSTRAINT study_milestone_unique
  UNIQUE NULLS NOT DISTINCT (study_id, study_site_id, name);
--> statement-breakpoint

CREATE TRIGGER monitoring_visit_audit AFTER INSERT OR UPDATE OR DELETE ON monitoring_visit
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER monitoring_visit_document_audit AFTER INSERT OR UPDATE OR DELETE ON monitoring_visit_document
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER visit_action_item_audit AFTER INSERT OR UPDATE OR DELETE ON visit_action_item
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER issue_audit AFTER INSERT OR UPDATE OR DELETE ON issue
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER enrollment_report_audit AFTER INSERT OR UPDATE OR DELETE ON enrollment_report
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint
CREATE TRIGGER study_milestone_audit AFTER INSERT OR UPDATE OR DELETE ON study_milestone
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
--> statement-breakpoint

-- Visit lifecycle, derived from dated facts + the linked trip report's own
-- (also derived-adjacent) document status + open action items:
--   scheduled -> overdue -> awaiting_report -> report_pending_review
--   -> follow_up -> complete
CREATE VIEW v_monitoring_visit_status AS
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
    WHEN tr.document_id IS NULL THEN 'awaiting_report'
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

CREATE VIEW v_issue_status AS
SELECT
  i.*,
  ss.site_number,
  si.name AS site_name,
  CASE
    WHEN i.resolved_at IS NOT NULL THEN 'resolved'
    WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END AS status
FROM issue i
LEFT JOIN study_site ss ON ss.id = i.study_site_id
LEFT JOIN site si ON si.id = ss.site_id;
--> statement-breakpoint

-- Latest as-reported counts per site vs its target. Sites with no report yet
-- still appear (counts null) so gaps are visible, not hidden.
CREATE VIEW v_site_enrollment AS
SELECT
  ss.study_id,
  ss.id AS study_site_id,
  ss.site_number,
  si.name AS site_name,
  ss.target_enrollment,
  er.as_of_date,
  er.screened,
  er.enrolled,
  er.withdrawn,
  er.completed,
  CASE WHEN ss.target_enrollment > 0
    THEN round(100.0 * er.enrolled / ss.target_enrollment, 1)
  END AS pct_of_target
FROM study_site ss
JOIN site si ON si.id = ss.site_id
LEFT JOIN LATERAL (
  SELECT *
  FROM enrollment_report er
  WHERE er.study_site_id = ss.id
  ORDER BY er.as_of_date DESC
  LIMIT 1
) er ON true;
--> statement-breakpoint

CREATE VIEW v_milestone_status AS
SELECT
  sm.*,
  ss.site_number,
  CASE
    WHEN sm.actual_date IS NOT NULL THEN 'achieved'
    WHEN sm.planned_date < CURRENT_DATE THEN 'overdue'
    ELSE 'upcoming'
  END AS status
FROM study_milestone sm
LEFT JOIN study_site ss ON ss.id = sm.study_site_id;
