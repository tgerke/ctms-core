-- Review assignments and the review queue (ADR-0018). An assignment is a
-- fact row: who should review this pending version, set by whom, due when.
-- Its lifecycle is never stored — an assignment is finished exactly when its
-- version stops being the actionable pending one (an approval signature or a
-- return exists), so the queue can never disagree with the documents.
-- Reassignment is a new row (the view reads the latest); nothing is deleted.

CREATE TABLE "review_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"assigned_to" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"due_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_document_version_id_document_version_id_fk"
  FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_assigned_to_person_id_fk"
  FOREIGN KEY ("assigned_to") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_assigned_by_person_id_fk"
  FOREIGN KEY ("assigned_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "review_assignment_version_idx" ON "review_assignment" ("document_version_id");--> statement-breakpoint
CREATE INDEX "review_assignment_assignee_idx" ON "review_assignment" ("assigned_to");--> statement-breakpoint

CREATE TRIGGER review_assignment_audit AFTER INSERT OR UPDATE OR DELETE ON review_assignment
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint

-- One row per document awaiting review: its latest version, that version's
-- latest assignment (if any), and a derived queue status. Approval and
-- return already move the document off 'pending_review', which is what
-- empties the queue — no completion flag exists to forget.
CREATE VIEW v_review_queue AS
SELECT
  d.study_id,
  d.id AS document_id,
  dv.id AS document_version_id,
  dv.version_number,
  d.title,
  d.study_site_id,
  ss.site_number,
  si.name AS site_name,
  ta.code AS artifact_code,
  ta.name AS artifact_name,
  dv.uploaded_at,
  up.given_name AS uploader_given_name,
  up.family_name AS uploader_family_name,
  ra.id AS assignment_id,
  ra.assigned_to,
  ap.given_name AS assignee_given_name,
  ap.family_name AS assignee_family_name,
  ra.assigned_by,
  bp.given_name AS assigner_given_name,
  bp.family_name AS assigner_family_name,
  ra.due_date,
  ra.created_at AS assigned_at,
  ra.note,
  CASE
    WHEN ra.id IS NULL THEN 'unassigned'
    WHEN ra.due_date IS NOT NULL AND ra.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'assigned'
  END AS queue_status
FROM document d
JOIN LATERAL (
  SELECT * FROM document_version dv
  WHERE dv.document_id = d.id
  ORDER BY dv.version_number DESC
  LIMIT 1
) dv ON true
JOIN tmf_artifact ta ON ta.id = d.tmf_artifact_id
LEFT JOIN study_site ss ON ss.id = d.study_site_id
LEFT JOIN site si ON si.id = ss.site_id
LEFT JOIN person up ON up.id = dv.uploaded_by
LEFT JOIN LATERAL (
  SELECT * FROM review_assignment ra
  WHERE ra.document_version_id = dv.id
  ORDER BY ra.created_at DESC, ra.id DESC
  LIMIT 1
) ra ON true
LEFT JOIN person ap ON ap.id = ra.assigned_to
LEFT JOIN person bp ON bp.id = ra.assigned_by
WHERE d.status = 'pending_review';
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON v_review_queue, review_assignment TO ctms_readonly;
  END IF;
END $$;
