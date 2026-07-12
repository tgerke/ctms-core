import type { Sql } from "@ctms/db";
import { expectedDocuments } from "./queries.js";

// TMF transfer / inspection export (ADR-0020): assemble everything a
// successor system, an archive, or an inspector needs, straight from the
// record. The package is verifiable with standard tooling (per-file sha256
// in the manifest and a shasum-format sidecar); the content-addressed store
// means every document version already carries the hash the receiving side
// checks. Deliberately NOT claimed as CDISC eTMF-EMS output: the EMS text
// is not in the verified source library, and per ADR-0012 its exchange.xml
// layout is not written from model memory — the manifest carries the fields
// a conformant serializer would map.

export interface TmfExportData {
  study: Record<string, unknown>;
  documents: Record<string, unknown>[];
  expected: Record<string, unknown>[];
  auditEvents: Record<string, unknown>[];
  chain: { events: number; valid: boolean; head_hash: string | null };
  /** Unique content hashes across all versions, with size and mime. */
  blobs: { sha256: string; size_bytes: number; mime_type: string }[];
}

export async function collectTmfExport(sql: Sql, studyId: string): Promise<TmfExportData> {
  const [study] = await sql`
    SELECT st.id, st.protocol_number, st.title, st.phase, st.status,
           o.name AS sponsor_name, st.created_at
    FROM study st JOIN organization o ON o.id = st.sponsor_org_id
    WHERE st.id = ${studyId}`;
  if (!study) throw new Error(`study ${studyId} not found`);

  const documents = await sql`
    SELECT d.id, d.title, d.status, d.effective_date, d.expires_at, d.created_at,
           ta.code AS artifact_code, ta.name AS artifact_name,
           tsec.code AS section_code, tz.number AS zone_number, tz.name AS zone_name,
           ss.site_number, si.name AS site_name,
           p.given_name AS person_given_name, p.family_name AS person_family_name,
           p.email AS person_email,
           coalesce(v.versions, '[]'::json) AS versions,
           coalesce(sg.signatures, '[]'::json) AS signatures,
           coalesce(r.returns, '[]'::json) AS returns
    FROM document d
    JOIN tmf_artifact ta ON ta.id = d.tmf_artifact_id
    JOIN tmf_section tsec ON tsec.id = ta.section_id
    JOIN tmf_zone tz ON tz.id = tsec.zone_id
    LEFT JOIN study_site ss ON ss.id = d.study_site_id
    LEFT JOIN site si ON si.id = ss.site_id
    LEFT JOIN person p ON p.id = d.person_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'version_number', dv.version_number, 'sha256', dv.sha256,
               'file_name', dv.file_name, 'mime_type', dv.mime_type,
               'size_bytes', dv.size_bytes, 'uploaded_at', dv.uploaded_at,
               'uploaded_by', up.given_name || ' ' || up.family_name,
               'source_system', dv.source_system, 'source_ref', dv.source_ref)
             ORDER BY dv.version_number) AS versions
      FROM document_version dv
      LEFT JOIN person up ON up.id = dv.uploaded_by
      WHERE dv.document_id = d.id
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'version_number', dv.version_number, 'meaning', sg.meaning,
               'signer', sp.given_name || ' ' || sp.family_name,
               'signer_email', sp.email,
               'signed_sha256', sg.signed_sha256, 'signed_at', sg.signed_at,
               'reauth_method', sg.reauth_method, 'reauth_at', sg.reauth_at)
             ORDER BY sg.signed_at) AS signatures
      FROM signature sg
      JOIN document_version dv ON dv.id = sg.document_version_id
      JOIN person sp ON sp.id = sg.signer_person_id
      WHERE dv.document_id = d.id
    ) sg ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'version_number', dv.version_number, 'reason', dr.reason,
               'returned_by', rp.given_name || ' ' || rp.family_name,
               'returned_at', dr.returned_at)
             ORDER BY dr.returned_at) AS returns
      FROM document_return dr
      JOIN document_version dv ON dv.id = dr.document_version_id
      JOIN person rp ON rp.id = dr.returned_by
      WHERE dv.document_id = d.id
    ) r ON true
    WHERE d.study_id = ${studyId}
    ORDER BY ta.code, ss.site_number NULLS FIRST, d.created_at`;

  const expected = await expectedDocuments(sql, { studyId });

  // The whole trail, not a per-study slice: the hash chain only verifies as
  // a whole, and pilots deploy single-tenant (docs/05-deployment.md). An
  // inspector receiving the package can walk the chain end to end.
  const auditEvents = await sql`
    SELECT id, occurred_at, actor_label, action, entity_type, entity_id,
           before, after, prev_hash, hash
    FROM audit_event ORDER BY id`;

  const problems = await sql`SELECT * FROM ctms_verify_audit_chain()`;
  const last = auditEvents[auditEvents.length - 1];

  const blobs = await sql`
    SELECT DISTINCT ON (dv.sha256) dv.sha256, dv.size_bytes, dv.mime_type
    FROM document_version dv
    JOIN document d ON d.id = dv.document_id
    WHERE d.study_id = ${studyId}
    ORDER BY dv.sha256`;

  return {
    study: study as Record<string, unknown>,
    documents: documents as unknown as Record<string, unknown>[],
    expected: expected as unknown as Record<string, unknown>[],
    auditEvents: auditEvents as unknown as Record<string, unknown>[],
    chain: {
      events: auditEvents.length,
      valid: problems.length === 0,
      head_hash: (last?.hash as string | undefined) ?? null,
    },
    blobs: blobs as unknown as TmfExportData["blobs"],
  };
}
