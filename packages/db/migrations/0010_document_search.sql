-- Document search (ADR-0019): one row per document with everything a human
-- would search by — title, artifact taxonomy, site, person, uploader, file
-- names, filing source — flattened into a lowercase haystack. Search is a
-- query over this view (every token must match), so results can never
-- disagree with the record; there is no index to rebuild or drift. Content
-- full-text (inside the PDFs) is deliberately out of scope here.

CREATE VIEW v_document_search AS
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
  )) AS haystack
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
         string_agg(DISTINCT dv.source_system, ' ') AS source_systems
  FROM document_version dv
  LEFT JOIN person up ON up.id = dv.uploaded_by
  WHERE dv.document_id = d.id
) v ON true;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON v_document_search TO ctms_readonly;
  END IF;
END $$;
