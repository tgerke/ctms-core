import type { Sql } from "@ctms/db";

export type ExpectedStatus =
  | "missing"
  | "pending_review"
  | "returned"
  | "current"
  | "expiring_soon"
  | "expired"
  | "superseded"
  | "waived";

export interface ExpectedDocumentRow {
  expected_document_id: string;
  rule_id: string;
  rule_name: string;
  scope_level: "study" | "study_site" | "person_role";
  requires_signature: boolean;
  validity_months: number | null;
  study_id: string;
  study_site_id: string | null;
  person_id: string | null;
  tmf_artifact_id: number;
  artifact_code: string;
  artifact_name: string;
  section_code: string;
  zone_number: number;
  zone_name: string;
  document_id: string | null;
  document_title: string | null;
  document_status: string | null;
  effective_date: string | null;
  effective_expiry: string | null;
  waiver_id: string | null;
  waiver_reason: string | null;
  waived_at: string | null;
  waived_by: string | null;
  waived_by_given_name: string | null;
  waived_by_family_name: string | null;
  status: ExpectedStatus;
  site_number: string | null;
  site_name: string | null;
  person_given_name: string | null;
  person_family_name: string | null;
}

export async function listStudies(sql: Sql) {
  return sql`
    SELECT st.id, st.protocol_number, st.title, st.phase, st.status,
           o.name AS sponsor_name,
           (SELECT count(*)::int FROM study_site ss WHERE ss.study_id = st.id) AS site_count
    FROM study st JOIN organization o ON o.id = st.sponsor_org_id
    ORDER BY st.protocol_number`;
}

export async function studySites(sql: Sql, studyId: string) {
  return sql`
    SELECT ss.id AS study_site_id, ss.site_number, ss.status, ss.activated_at,
           si.name AS site_name, si.city, si.state,
           coalesce(c.total, 0)::int AS total,
           coalesce(c.current_count, 0)::int AS current_count,
           coalesce(c.expiring_soon_count, 0)::int AS expiring_soon_count,
           coalesce(c.pending_review_count, 0)::int AS pending_review_count,
           coalesce(c.returned_count, 0)::int AS returned_count,
           coalesce(c.expired_count, 0)::int AS expired_count,
           coalesce(c.missing_count, 0)::int AS missing_count,
           coalesce(c.waived_count, 0)::int AS waived_count,
           coalesce(c.pct_current, 0)::float AS pct_current
    FROM study_site ss
    JOIN site si ON si.id = ss.site_id
    LEFT JOIN v_study_site_completeness c ON c.study_site_id = ss.id
    WHERE ss.study_id = ${studyId}
    ORDER BY ss.site_number`;
}

export async function expectedDocuments(
  sql: Sql,
  filter: {
    studyId: string;
    studySiteId?: string;
    personId?: string;
    status?: ExpectedStatus;
  },
) {
  return sql<ExpectedDocumentRow[]>`
    SELECT v.*, ss.site_number, si.name AS site_name,
           p.given_name AS person_given_name, p.family_name AS person_family_name
    FROM v_expected_document_status v
    LEFT JOIN study_site ss ON ss.id = v.study_site_id
    LEFT JOIN site si ON si.id = ss.site_id
    LEFT JOIN person p ON p.id = v.person_id
    WHERE v.study_id = ${filter.studyId}
      AND (${filter.studySiteId ?? null}::uuid IS NULL OR v.study_site_id = ${filter.studySiteId ?? null})
      AND (${filter.personId ?? null}::uuid IS NULL OR v.person_id = ${filter.personId ?? null})
      AND (${filter.status ?? null}::text IS NULL OR v.status = ${filter.status ?? null})
    ORDER BY ss.site_number NULLS FIRST, v.artifact_code,
             p.family_name NULLS FIRST`;
}

export async function siteStaff(sql: Sql, studySiteId: string) {
  return sql`
    SELECT ssr.id AS role_id, ssr.role, ssr.start_date, ssr.end_date,
           p.id AS person_id, p.given_name, p.family_name, p.credentials, p.email,
           count(v.*) FILTER (WHERE v.status NOT IN ('current', 'waived'))::int AS open_items
    FROM study_site_role ssr
    JOIN person p ON p.id = ssr.person_id
    LEFT JOIN v_expected_document_status v
      ON v.person_id = p.id AND v.study_site_id = ssr.study_site_id
    WHERE ssr.study_site_id = ${studySiteId}
    GROUP BY ssr.id, ssr.role, ssr.start_date, ssr.end_date,
             p.id, p.given_name, p.family_name, p.credentials, p.email
    ORDER BY ssr.role, p.family_name`;
}

// --- Review queue (ADR-0018) ------------------------------------------------

export type QueueStatus = "unassigned" | "assigned" | "overdue";

export async function reviewQueue(
  sql: Sql,
  filter: { studyId: string; assignedTo?: string; status?: QueueStatus },
) {
  return sql`
    SELECT q.*
    FROM v_review_queue q
    WHERE q.study_id = ${filter.studyId}
      AND (${filter.assignedTo ?? null}::uuid IS NULL OR q.assigned_to = ${filter.assignedTo ?? null})
      AND (${filter.status ?? null}::text IS NULL OR q.queue_status = ${filter.status ?? null})
    ORDER BY (q.queue_status = 'overdue') DESC, q.due_date NULLS LAST,
             q.uploaded_at`;
}

// --- Document search (ADR-0019) ---------------------------------------------

/**
 * Metadata search over v_document_search: every whitespace token must appear
 * somewhere in the document's haystack (title, artifact taxonomy, site,
 * person, uploader, file names, filing source, status). Predictable
 * substring semantics — "04.01" finds the IRB zone, "raman license" finds
 * Dr. Raman's license — with no index to drift from the record.
 */
export async function searchDocuments(
  sql: Sql,
  filter: { studyId: string; q: string; status?: string; limit?: number },
) {
  const tokens = filter.q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (tokens.length === 0) return [];
  const limit = Math.min(filter.limit ?? 50, 200);
  return sql`
    SELECT s.*
    FROM v_document_search s
    WHERE s.study_id = ${filter.studyId}
      AND s.haystack LIKE ALL(${tokens})
      AND (${filter.status ?? null}::text IS NULL OR s.status::text = ${filter.status ?? null})
    ORDER BY s.latest_uploaded_at DESC NULLS LAST, s.artifact_code
    LIMIT ${limit}`;
}

// --- Admin directory reads (ADR-0016) --------------------------------------

export async function listOrganizations(sql: Sql) {
  return sql`
    SELECT o.id, o.name, o.kind,
           (SELECT count(*)::int FROM site s WHERE s.organization_id = o.id) AS site_count
    FROM organization o
    ORDER BY o.name`;
}

export async function listSites(sql: Sql) {
  return sql`
    SELECT s.id, s.name, s.city, s.state, s.organization_id, o.name AS organization_name
    FROM site s JOIN organization o ON o.id = s.organization_id
    ORDER BY s.name`;
}

export async function listPeople(sql: Sql) {
  return sql`
    SELECT p.id, p.given_name, p.family_name, p.email, p.credentials,
           coalesce(g.grants, '[]'::json) AS grants
    FROM person p
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'grant_id', ag.id, 'role', ag.role,
               'study_id', ag.study_id, 'study_site_id', ag.study_site_id,
               'granted_at', ag.granted_at)
             ORDER BY ag.granted_at) AS grants
      FROM access_grant ag
      WHERE ag.person_id = p.id AND ag.revoked_at IS NULL
    ) g ON true
    ORDER BY p.family_name, p.given_name`;
}

export async function studyRequirementRules(sql: Sql, studyId: string) {
  return sql`
    SELECT rr.id, rr.study_id, rr.tmf_artifact_id, ta.code AS artifact_code,
           ta.name AS artifact_name, rr.scope_level, rr.applies_to_roles,
           rr.validity_months, rr.requires_signature, rr.name, rr.description,
           (SELECT count(*)::int FROM expected_document ed WHERE ed.rule_id = rr.id)
             AS expected_count
    FROM requirement_rule rr
    JOIN tmf_artifact ta ON ta.id = rr.tmf_artifact_id
    WHERE rr.study_id = ${studyId}
    ORDER BY ta.code, rr.name`;
}

export async function listTmfArtifacts(sql: Sql) {
  return sql`
    SELECT ta.id, ta.code, ta.name, tsec.name AS section_name, tz.name AS zone_name
    FROM tmf_artifact ta
    JOIN tmf_section tsec ON tsec.id = ta.section_id
    JOIN tmf_zone tz ON tz.id = tsec.zone_id
    ORDER BY ta.code`;
}

export async function documentDetail(sql: Sql, documentId: string) {
  const docs = await sql`
    SELECT d.*, ta.code AS artifact_code, ta.name AS artifact_name,
           ss.site_number, si.name AS site_name,
           p.given_name AS person_given_name, p.family_name AS person_family_name,
           EXISTS (SELECT 1 FROM monitoring_visit_document mvd
                   WHERE mvd.document_id = d.id) AS visit_linked
    FROM document d
    JOIN tmf_artifact ta ON ta.id = d.tmf_artifact_id
    LEFT JOIN study_site ss ON ss.id = d.study_site_id
    LEFT JOIN site si ON si.id = ss.site_id
    LEFT JOIN person p ON p.id = d.person_id
    WHERE d.id = ${documentId}`;
  if (docs.length === 0) return null;
  const versions = await sql`
    SELECT dv.*, up.given_name AS uploader_given_name,
           up.family_name AS uploader_family_name
    FROM document_version dv
    LEFT JOIN person up ON up.id = dv.uploaded_by
    WHERE dv.document_id = ${documentId}
    ORDER BY dv.version_number DESC`;
  const signatures = await sql`
    SELECT sg.*, p.given_name, p.family_name, p.credentials
    FROM signature sg
    JOIN document_version dv ON dv.id = sg.document_version_id
    JOIN person p ON p.id = sg.signer_person_id
    WHERE dv.document_id = ${documentId}
    ORDER BY sg.signed_at DESC`;
  const returns = await sql`
    SELECT dr.*, dv.version_number,
           p.given_name AS returned_by_given_name,
           p.family_name AS returned_by_family_name
    FROM document_return dr
    JOIN document_version dv ON dv.id = dr.document_version_id
    JOIN person p ON p.id = dr.returned_by
    WHERE dv.document_id = ${documentId}
    ORDER BY dr.returned_at DESC`;
  const assignments = await sql`
    SELECT ra.*, dv.version_number,
           ap.given_name AS assignee_given_name, ap.family_name AS assignee_family_name,
           bp.given_name AS assigner_given_name, bp.family_name AS assigner_family_name
    FROM review_assignment ra
    JOIN document_version dv ON dv.id = ra.document_version_id
    JOIN person ap ON ap.id = ra.assigned_to
    JOIN person bp ON bp.id = ra.assigned_by
    WHERE dv.document_id = ${documentId}
    ORDER BY ra.created_at DESC`;
  return { document: docs[0], versions, signatures, returns, assignments };
}

export async function auditEvents(
  sql: Sql,
  filter: { entityType?: string; entityId?: string; limit?: number },
) {
  const limit = Math.min(filter.limit ?? 100, 500);
  return sql`
    SELECT id, occurred_at, actor_id, actor_label, action, entity_type,
           entity_id, before, after, prev_hash, hash
    FROM audit_event
    WHERE (${filter.entityType ?? null}::text IS NULL OR entity_type = ${filter.entityType ?? null})
      AND (${filter.entityId ?? null}::text IS NULL OR entity_id = ${filter.entityId ?? null})
    ORDER BY id DESC
    LIMIT ${limit}`;
}

/** Audit events for a document plus its versions and signatures. */
export async function documentAuditTrail(sql: Sql, documentId: string) {
  return sql`
    SELECT ae.id, ae.occurred_at, ae.actor_label, ae.action, ae.entity_type,
           ae.entity_id, ae.before, ae.after, ae.prev_hash, ae.hash,
           p.given_name AS actor_given_name, p.family_name AS actor_family_name
    FROM audit_event ae
    LEFT JOIN person p ON p.id = ae.actor_id
    WHERE (ae.entity_type = 'document' AND ae.entity_id = ${documentId})
       OR (ae.entity_type = 'document_version' AND ae.entity_id IN (
            SELECT id::text FROM document_version WHERE document_id = ${documentId}))
       OR (ae.entity_type = 'signature' AND ae.entity_id IN (
            SELECT sg.id::text FROM signature sg
            JOIN document_version dv ON dv.id = sg.document_version_id
            WHERE dv.document_id = ${documentId}))
       OR (ae.entity_type = 'document_return' AND ae.entity_id IN (
            SELECT dr.id::text FROM document_return dr
            JOIN document_version dv ON dv.id = dr.document_version_id
            WHERE dv.document_id = ${documentId}))
    ORDER BY ae.id`;
}

export async function verifyAuditChain(sql: Sql) {
  const problems = await sql`SELECT * FROM ctms_verify_audit_chain()`;
  const [{ n }] = await sql<[{ n: number }]>`
    SELECT count(*)::int AS n FROM audit_event`;
  return { events: n, problems };
}

// ---------------------------------------------------------------------------
// Operational layer (ADR-0006). All reads go through the v_* views so the API
// and a direct SQL connection can never disagree about a lifecycle stage.
// ---------------------------------------------------------------------------

export type VisitStage =
  | "scheduled"
  | "overdue"
  | "awaiting_report"
  | "report_pending_review"
  | "follow_up"
  | "complete";

export type IssueStatus = "open" | "overdue" | "resolved";

export async function studyVisits(
  sql: Sql,
  filter: { studyId: string; studySiteId?: string; stage?: VisitStage },
) {
  return sql`
    SELECT v.*
    FROM v_monitoring_visit_status v
    WHERE v.study_id = ${filter.studyId}
      AND (${filter.studySiteId ?? null}::uuid IS NULL OR v.study_site_id = ${filter.studySiteId ?? null})
      AND (${filter.stage ?? null}::text IS NULL OR v.stage = ${filter.stage ?? null})
    ORDER BY v.scheduled_date DESC, v.site_number`;
}

export async function visitDetail(sql: Sql, monitoringVisitId: string) {
  const visits = await sql`
    SELECT v.* FROM v_monitoring_visit_status v
    WHERE v.monitoring_visit_id = ${monitoringVisitId}`;
  if (visits.length === 0) return null;
  const documents = await sql`
    SELECT mvd.link_kind, d.id AS document_id, d.title, d.status, d.effective_date
    FROM monitoring_visit_document mvd
    JOIN document d ON d.id = mvd.document_id
    WHERE mvd.monitoring_visit_id = ${monitoringVisitId}
    ORDER BY mvd.created_at`;
  const actionItems = await sql`
    SELECT ai.*,
           p.given_name AS resolved_by_given_name,
           p.family_name AS resolved_by_family_name,
           CASE
             WHEN ai.resolved_at IS NOT NULL THEN 'resolved'
             WHEN ai.due_date IS NOT NULL AND ai.due_date < CURRENT_DATE THEN 'overdue'
             ELSE 'open'
           END AS status
    FROM visit_action_item ai
    LEFT JOIN person p ON p.id = ai.resolved_by
    WHERE ai.monitoring_visit_id = ${monitoringVisitId}
    ORDER BY ai.resolved_at NULLS FIRST, ai.due_date NULLS LAST, ai.created_at`;
  const issues = await sql`
    SELECT i.* FROM v_issue_status i
    WHERE i.monitoring_visit_id = ${monitoringVisitId}
    ORDER BY i.identified_date DESC`;
  return { visit: visits[0], documents, actionItems, issues };
}

export async function studyIssues(
  sql: Sql,
  filter: {
    studyId: string;
    studySiteId?: string;
    status?: IssueStatus;
    category?: string;
    severity?: string;
  },
) {
  return sql`
    SELECT i.*,
           p.given_name AS identified_by_given_name,
           p.family_name AS identified_by_family_name
    FROM v_issue_status i
    LEFT JOIN person p ON p.id = i.identified_by
    WHERE i.study_id = ${filter.studyId}
      AND (${filter.studySiteId ?? null}::uuid IS NULL OR i.study_site_id = ${filter.studySiteId ?? null})
      AND (${filter.status ?? null}::text IS NULL OR i.status = ${filter.status ?? null})
      AND (${filter.category ?? null}::text IS NULL OR i.category::text = ${filter.category ?? null})
      AND (${filter.severity ?? null}::text IS NULL OR i.severity::text = ${filter.severity ?? null})
    ORDER BY (i.status = 'overdue') DESC, i.severity DESC, i.identified_date DESC`;
}

export async function studyEnrollment(sql: Sql, studyId: string) {
  return sql`
    SELECT e.* FROM v_site_enrollment e
    WHERE e.study_id = ${studyId}
    ORDER BY e.site_number`;
}

export async function studyMilestones(sql: Sql, studyId: string) {
  return sql`
    SELECT m.* FROM v_milestone_status m
    WHERE m.study_id = ${studyId}
    ORDER BY m.planned_date, m.site_number NULLS FIRST`;
}

export async function syncExpectedDocuments(sql: Sql, studyId: string) {
  const [{ synced }] = await sql<[{ synced: number }]>`
    SELECT ctms_sync_expected_documents(${studyId}) AS synced`;
  return synced;
}
