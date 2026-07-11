import type { Sql } from "@ctms/db";

export type ExpectedStatus =
  | "missing"
  | "pending_review"
  | "current"
  | "expiring_soon"
  | "expired"
  | "superseded";

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
           coalesce(c.expired_count, 0)::int AS expired_count,
           coalesce(c.missing_count, 0)::int AS missing_count,
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
           count(v.*) FILTER (WHERE v.status NOT IN ('current'))::int AS open_items
    FROM study_site_role ssr
    JOIN person p ON p.id = ssr.person_id
    LEFT JOIN v_expected_document_status v
      ON v.person_id = p.id AND v.study_site_id = ssr.study_site_id
    WHERE ssr.study_site_id = ${studySiteId}
    GROUP BY ssr.id, ssr.role, ssr.start_date, ssr.end_date,
             p.id, p.given_name, p.family_name, p.credentials, p.email
    ORDER BY ssr.role, p.family_name`;
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
  return { document: docs[0], versions, signatures };
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
