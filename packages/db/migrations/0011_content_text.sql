-- Content full-text search (ADR-0022). Extracted text of each stored blob,
-- keyed by the same content hash as the blob store. Versions are immutable,
-- so extracted text of a sha256 can never go stale — which is why this table
-- is derived state deliberately outside the audited record: no audit
-- trigger, no immutability trigger. It can be deleted and rebuilt from the
-- bytes at any time (pnpm db:extract-text); the record is the blob and its
-- hash. Extraction failures are recorded as rows, not hidden.

CREATE TABLE "document_content_text" (
	"sha256" char(64) PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"content" text,
	"extractor" text,
	"char_count" integer,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_content_text_status_check"
	  CHECK (status IN ('extracted', 'unsupported', 'failed')),
	CONSTRAINT "document_content_text_content_check"
	  CHECK ((status = 'extracted') = (content IS NOT NULL))
);--> statement-breakpoint

-- v_document_search (ADR-0019) gains the extracted text of every version, so
-- "every token must match" can now be satisfied by what a document says, not
-- only what it is filed as. Same view, same substring semantics, wider
-- haystack; the metadata haystack stays separate so the API can tell a
-- content match from a metadata one.
CREATE OR REPLACE VIEW v_document_search AS
SELECT
  d.study_id,
  d.id AS document_id,
  d.title,
  d.status,
  d.effective_date,
  d.expires_at,
  d.created_at,
  ta.code AS artifact_code,
  ta.name AS artifact_name,
  tsec.name AS section_name,
  tz.number AS zone_number,
  tz.name AS zone_name,
  d.study_site_id,
  ss.site_number,
  si.name AS site_name,
  d.person_id,
  p.given_name AS person_given_name,
  p.family_name AS person_family_name,
  v.version_count,
  v.latest_version_id,
  v.latest_uploaded_at,
  v.uploader_given_name,
  v.uploader_family_name,
  lower(concat_ws(' ',
    d.title, ta.code, ta.name, tsec.name, tz.name,
    ss.site_number, si.name,
    p.given_name, p.family_name,
    v.uploader_given_name, v.uploader_family_name,
    v.file_names, v.source_systems, d.status::text
  )) AS haystack,
  v.content_text
FROM document d
JOIN tmf_artifact ta ON ta.id = d.tmf_artifact_id
JOIN tmf_section tsec ON tsec.id = ta.section_id
JOIN tmf_zone tz ON tz.id = tsec.zone_id
LEFT JOIN study_site ss ON ss.id = d.study_site_id
LEFT JOIN site si ON si.id = ss.site_id
LEFT JOIN person p ON p.id = d.person_id
LEFT JOIN LATERAL (
  SELECT count(*)::int AS version_count,
         (array_agg(dv.id ORDER BY dv.version_number DESC))[1] AS latest_version_id,
         max(dv.uploaded_at) AS latest_uploaded_at,
         (array_agg(up.given_name ORDER BY dv.version_number DESC))[1] AS uploader_given_name,
         (array_agg(up.family_name ORDER BY dv.version_number DESC))[1] AS uploader_family_name,
         string_agg(dv.file_name, ' ') AS file_names,
         string_agg(DISTINCT dv.source_system, ' ') AS source_systems,
         string_agg(ct.content, ' ' ORDER BY dv.version_number) AS content_text
  FROM document_version dv
  LEFT JOIN person up ON up.id = dv.uploaded_by
  LEFT JOIN document_content_text ct
    ON ct.sha256 = dv.sha256 AND ct.status = 'extracted'
  WHERE dv.document_id = d.id
) v ON true;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON document_content_text TO ctms_readonly;
  END IF;
END $$;
