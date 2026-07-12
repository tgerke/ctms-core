import type { Sql } from "@ctms/db";
import { verifyAuditChain } from "./queries.js";

// Digest notifications (ADR-0017). The digest is a pure function of the
// derived views at the moment it runs: no notification state, no read
// receipts, nothing to sync or drift. Scheduling belongs to the operator's
// scheduler; delivery belongs to the mail system.

export interface DigestDocumentRow {
  artifact_code: string;
  artifact_name: string;
  rule_name: string;
  site_number: string | null;
  person_given_name: string | null;
  person_family_name: string | null;
  effective_expiry: string | null;
  status: string;
}

export interface DigestVisitRow {
  site_number: string;
  visit_type: string;
  scheduled_date: string;
}

export interface DigestActionItemRow {
  site_number: string;
  description: string;
  due_date: string;
}

export interface DigestIssueRow {
  site_number: string | null;
  severity: string;
  title: string;
  due_date: string;
}

export interface DigestMilestoneRow {
  name: string;
  site_number: string | null;
  planned_date: string;
}

export interface DigestReviewRow {
  title: string;
  site_number: string | null;
  assignee_given_name: string;
  assignee_family_name: string;
  due_date: string;
}

export interface DigestData {
  study: { id: string; protocol_number: string; title: string };
  generatedOn: string;
  chain: { events: number; valid: boolean };
  expired: DigestDocumentRow[];
  expiringSoon: DigestDocumentRow[];
  counts: {
    total: number;
    missing: number;
    pending_review: number;
    returned: number;
    waived: number;
  };
  overdueVisits: DigestVisitRow[];
  overdueActionItems: DigestActionItemRow[];
  overdueIssues: DigestIssueRow[];
  overdueMilestones: DigestMilestoneRow[];
  overdueReviews: DigestReviewRow[];
}

export async function collectDigest(sql: Sql, studyId: string): Promise<DigestData> {
  const [study] = await sql`
    SELECT id, protocol_number, title FROM study WHERE id = ${studyId}`;
  if (!study) throw new Error(`study ${studyId} not found`);

  const documents = (await sql`
    SELECT v.artifact_code, v.artifact_name, v.rule_name, ss.site_number,
           p.given_name AS person_given_name, p.family_name AS person_family_name,
           v.effective_expiry, v.status
    FROM v_expected_document_status v
    LEFT JOIN study_site ss ON ss.id = v.study_site_id
    LEFT JOIN person p ON p.id = v.person_id
    WHERE v.study_id = ${studyId} AND v.status IN ('expired', 'expiring_soon')
    ORDER BY v.effective_expiry NULLS LAST, ss.site_number NULLS FIRST,
             v.artifact_code`) as unknown as DigestDocumentRow[];

  const [counts] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'missing')::int AS missing,
           count(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
           count(*) FILTER (WHERE status = 'returned')::int AS returned,
           count(*) FILTER (WHERE status = 'waived')::int AS waived
    FROM v_expected_document_status WHERE study_id = ${studyId}`;

  const overdueVisits = (await sql`
    SELECT site_number, visit_type, scheduled_date
    FROM v_monitoring_visit_status
    WHERE study_id = ${studyId} AND stage = 'overdue'
    ORDER BY scheduled_date`) as unknown as DigestVisitRow[];

  const overdueActionItems = (await sql`
    SELECT ss.site_number, ai.description, ai.due_date
    FROM visit_action_item ai
    JOIN monitoring_visit mv ON mv.id = ai.monitoring_visit_id
    JOIN study_site ss ON ss.id = mv.study_site_id
    WHERE ss.study_id = ${studyId} AND ai.resolved_at IS NULL
      AND ai.due_date IS NOT NULL AND ai.due_date < CURRENT_DATE
    ORDER BY ai.due_date`) as unknown as DigestActionItemRow[];

  const overdueIssues = (await sql`
    SELECT site_number, severity, title, due_date
    FROM v_issue_status
    WHERE study_id = ${studyId} AND status = 'overdue'
    ORDER BY severity DESC, due_date`) as unknown as DigestIssueRow[];

  const overdueMilestones = (await sql`
    SELECT name, site_number, planned_date
    FROM v_milestone_status
    WHERE study_id = ${studyId} AND status = 'overdue'
    ORDER BY planned_date`) as unknown as DigestMilestoneRow[];

  const overdueReviews = (await sql`
    SELECT title, site_number, assignee_given_name, assignee_family_name, due_date
    FROM v_review_queue
    WHERE study_id = ${studyId} AND queue_status = 'overdue'
    ORDER BY due_date`) as unknown as DigestReviewRow[];

  const chainResult = await verifyAuditChain(sql);

  // Local date, not toISOString(): a digest cron runs in the team's evening
  // must not claim tomorrow's date (same rationale as the web app's
  // local-time 'today' defaults).
  const now = new Date();
  const generatedOn = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return {
    study: study as DigestData["study"],
    generatedOn,
    chain: { events: chainResult.events, valid: chainResult.problems.length === 0 },
    expired: documents.filter((d) => d.status === "expired"),
    expiringSoon: documents.filter((d) => d.status === "expiring_soon"),
    counts: counts as DigestData["counts"],
    overdueVisits,
    overdueActionItems,
    overdueIssues,
    overdueMilestones,
    overdueReviews,
  };
}

/** Everything the digest asks a human to act on (chain breakage counts once). */
export function attentionCount(d: DigestData): number {
  return (
    d.expired.length +
    d.expiringSoon.length +
    d.overdueVisits.length +
    d.overdueActionItems.length +
    d.overdueIssues.length +
    d.overdueMilestones.length +
    d.overdueReviews.length +
    (d.chain.valid ? 0 : 1)
  );
}

const who = (r: DigestDocumentRow) =>
  r.person_family_name
    ? `${r.person_given_name} ${r.person_family_name}`
    : r.site_number
      ? `Site ${r.site_number}`
      : "study-level";

export function renderDigest(d: DigestData): { subject: string; text: string } {
  const n = attentionCount(d);
  const subject = `[ctms-core] ${d.study.protocol_number} digest — ${
    n === 0 ? "all clear" : `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`
  } (${d.generatedOn})`;

  const lines: string[] = [];
  lines.push(`${d.study.protocol_number} — ${d.study.title}`);
  lines.push(`Oversight digest for ${d.generatedOn}. Statuses are derived from`);
  lines.push(`the live record at send time; the dashboard always has the current view.`);
  lines.push("");

  if (!d.chain.valid) {
    lines.push(`*** AUDIT CHAIN BROKEN — verification failed over ${d.chain.events} events.`);
    lines.push(`*** Investigate before anything else: this means the append-only record`);
    lines.push(`*** no longer verifies end to end.`);
    lines.push("");
  }

  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return;
    lines.push(`${title} (${rows.length})`);
    for (const r of rows) lines.push(`  - ${r}`);
    lines.push("");
  };

  section(
    "Expired documents",
    d.expired.map((r) => `${r.artifact_name} — ${who(r)} — expired ${r.effective_expiry}`),
  );
  section(
    "Expiring within 60 days",
    d.expiringSoon.map((r) => `${r.artifact_name} — ${who(r)} — expires ${r.effective_expiry}`),
  );
  section(
    "Overdue monitoring visits",
    d.overdueVisits.map(
      (r) => `Site ${r.site_number} — ${r.visit_type.replace(/_/g, " ")} visit scheduled ${r.scheduled_date}`,
    ),
  );
  section(
    "Overdue action items",
    d.overdueActionItems.map((r) => `Site ${r.site_number} — ${r.description} — due ${r.due_date}`),
  );
  section(
    "Overdue issues",
    d.overdueIssues.map(
      (r) => `${r.site_number ? `Site ${r.site_number}` : "Study-level"} — [${r.severity}] ${r.title} — due ${r.due_date}`,
    ),
  );
  section(
    "Overdue review assignments",
    d.overdueReviews.map(
      (r) =>
        `${r.title}${r.site_number ? ` (Site ${r.site_number})` : ""} — ` +
        `${r.assignee_given_name} ${r.assignee_family_name} — due ${r.due_date}`,
    ),
  );
  section(
    "Overdue milestones",
    d.overdueMilestones.map(
      (r) => `${r.name}${r.site_number ? ` (Site ${r.site_number})` : ""} — planned ${r.planned_date}`,
    ),
  );

  if (n === 0) {
    lines.push("Nothing needs attention today.");
    lines.push("");
  }

  const c = d.counts;
  lines.push(
    `Standing counts: ${c.total} expected documents · ${c.missing} missing · ` +
      `${c.pending_review} pending review · ${c.returned} returned · ${c.waived} waived.`,
  );
  lines.push(
    d.chain.valid
      ? `Audit chain verified: ${d.chain.events} events.`
      : `Audit chain: BROKEN (see above).`,
  );
  return { subject, text: lines.join("\n") };
}

/**
 * Who gets the digest: people holding an active admin or trial_ops grant that
 * covers the whole study (unscoped or study-scoped). Site-scoped grants are
 * deliberately excluded — the digest is the oversight seat's summary, and a
 * per-site digest is a different (smaller) report.
 */
export async function digestRecipients(sql: Sql, studyId: string) {
  return (await sql`
    SELECT DISTINCT p.email, p.given_name, p.family_name
    FROM access_grant ag
    JOIN person p ON p.id = ag.person_id
    WHERE ag.revoked_at IS NULL
      AND ag.role IN ('admin', 'trial_ops')
      AND ag.study_site_id IS NULL
      AND (ag.study_id IS NULL OR ag.study_id = ${studyId})
    ORDER BY p.email`) as unknown as {
    email: string;
    given_name: string;
    family_name: string;
  }[];
}
