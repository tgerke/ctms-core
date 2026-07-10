import { createDb } from "@ctms/db";
import { afterAll, describe, expect, it } from "vitest";
import { signDocumentVersion, uploadDocument } from "./documents.js";
import {
  createActionItem,
  createIssue,
  linkVisitDocument,
  reportEnrollment,
  resolveActionItem,
  resolveIssue,
  scheduleVisit,
  updateVisit,
} from "./operations.js";

const { sql, db } = createDb();

// Probe rows are cleaned up so repeated runs don't pile visits/issues onto the
// demo dashboard (deletes on these tables are allowed and audited). Probe trip
// report documents stay, like the existing upload-test probes: once unlinked
// they match no requirement rule and are invisible to the completeness views.
const probeVisitIds: string[] = [];
const probeIssueIds: string[] = [];
let probeEnrollmentKey: { studySiteId: string; asOfDate: string } | null = null;

afterAll(async () => {
  if (probeVisitIds.length > 0) {
    await sql`DELETE FROM visit_action_item WHERE monitoring_visit_id IN ${sql(probeVisitIds)}`;
    await sql`DELETE FROM monitoring_visit_document WHERE monitoring_visit_id IN ${sql(probeVisitIds)}`;
    await sql`DELETE FROM monitoring_visit WHERE id IN ${sql(probeVisitIds)}`;
  }
  if (probeIssueIds.length > 0) {
    await sql`DELETE FROM issue WHERE id IN ${sql(probeIssueIds)}`;
  }
  if (probeEnrollmentKey) {
    await sql`DELETE FROM enrollment_report
      WHERE study_site_id = ${probeEnrollmentKey.studySiteId}
        AND as_of_date = ${probeEnrollmentKey.asOfDate}`;
  }
  await sql.end();
});

async function ids() {
  const [study] = await sql`SELECT id FROM study LIMIT 1`;
  const [site] = await sql`SELECT id FROM study_site WHERE site_number = '001'`;
  const [person] = await sql`
    SELECT id FROM person WHERE email = 'nora.feld@corc.example'`;
  return { studyId: study!.id as string, studySiteId: site!.id as string, personId: person!.id as string };
}

async function stageOf(visitId: string): Promise<string> {
  const [row] = await sql`
    SELECT stage FROM v_monitoring_visit_status WHERE monitoring_visit_id = ${visitId}`;
  return row!.stage;
}

describe("monitoring visit lifecycle (derived, never stored)", () => {
  it("walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete", async () => {
    const { studyId, studySiteId, personId } = await ids();
    const actor = { personId, label: "vitest" };

    // Future visit: scheduled
    const visit = await scheduleVisit(db, actor, {
      studySiteId,
      visitType: "interim",
      scheduledDate: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10),
      monitorPersonId: personId,
    });
    probeVisitIds.push(visit.id);
    expect(await stageOf(visit.id)).toBe("scheduled");

    // Scheduled date slips into the past without being conducted: overdue
    await updateVisit(db, actor, {
      monitoringVisitId: visit.id,
      scheduledDate: new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10),
    });
    expect(await stageOf(visit.id)).toBe("overdue");

    // Conducted: awaiting_report
    await updateVisit(db, actor, {
      monitoringVisitId: visit.id,
      visitDate: new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10),
      summary: "Probe visit for lifecycle test",
    });
    expect(await stageOf(visit.id)).toBe("awaiting_report");

    // Trip report uploaded (fresh document per visit) and linked: pending review
    const [artifact] = await sql`SELECT id FROM tmf_artifact WHERE code = '01.03.01'`;
    const uploaded = await uploadDocument(db, actor, {
      tmfArtifactId: artifact!.id,
      studyId,
      studySiteId,
      title: "Trip Report Probe",
      fileName: "probe-trip-report.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode(`trip report ${Date.now()}`),
      forceNew: true,
    });
    await linkVisitDocument(db, actor, {
      monitoringVisitId: visit.id,
      documentId: uploaded.document.id,
      linkKind: "trip_report",
    });
    expect(await stageOf(visit.id)).toBe("report_pending_review");

    // Open action item + approved report: follow_up
    const item = await createActionItem(db, actor, {
      monitoringVisitId: visit.id,
      description: "Probe follow-up item",
      dueDate: new Date(Date.now() + 14 * 86400e3).toISOString().slice(0, 10),
    });
    await signDocumentVersion(db, actor, {
      documentVersionId: uploaded.version.id,
      signerPersonId: personId,
      meaning: "approval",
    });
    expect(await stageOf(visit.id)).toBe("follow_up");

    // Last action item resolved: complete
    await resolveActionItem(db, actor, {
      actionItemId: item.id,
      resolvedBy: personId,
      resolutionNote: "Done",
    });
    expect(await stageOf(visit.id)).toBe("complete");

    // The whole walk is on the hash-chained audit trail, attributed
    const events = await sql`
      SELECT count(*)::int AS n FROM audit_event
      WHERE entity_type = 'monitoring_visit' AND entity_id = ${visit.id}
        AND actor_label = 'vitest'`;
    expect(events[0]!.n).toBeGreaterThanOrEqual(3); // insert + 2 updates
    const problems = await sql`SELECT * FROM ctms_verify_audit_chain()`;
    expect(problems).toHaveLength(0);
  });

  it("approving one visit's trip report does not supersede another visit's report", async () => {
    const { studyId, studySiteId, personId } = await ids();
    const actor = { personId, label: "vitest" };
    const [artifact] = await sql`SELECT id FROM tmf_artifact WHERE code = '01.03.01'`;

    const seededEffective = await sql`
      SELECT d.id FROM document d
      JOIN monitoring_visit_document mvd ON mvd.document_id = d.id
      WHERE d.status = 'effective' AND d.study_site_id IS NOT NULL`;
    expect(seededEffective.length).toBeGreaterThan(0);

    const visit = await scheduleVisit(db, actor, {
      studySiteId,
      visitType: "interim",
      scheduledDate: new Date().toISOString().slice(0, 10),
    });
    probeVisitIds.push(visit.id);
    const uploaded = await uploadDocument(db, actor, {
      tmfArtifactId: artifact!.id,
      studyId,
      studySiteId,
      title: "Second Trip Report Probe",
      fileName: "probe-2.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode(`trip report 2 ${Date.now()}`),
      forceNew: true,
    });
    await linkVisitDocument(db, actor, {
      monitoringVisitId: visit.id,
      documentId: uploaded.document.id,
      linkKind: "trip_report",
    });
    await signDocumentVersion(db, actor, {
      documentVersionId: uploaded.version.id,
      signerPersonId: personId,
      meaning: "approval",
    });

    // Every previously-effective visit-linked report is still effective
    const stillEffective = await sql`
      SELECT count(*)::int AS n FROM document
      WHERE id IN ${sql(seededEffective.map((r) => r.id))} AND status = 'effective'`;
    expect(stillEffective[0]!.n).toBe(seededEffective.length);
  });
});

describe("issue lifecycle (derived)", () => {
  it("derives open, overdue, and resolved from dated facts", async () => {
    const { studyId, studySiteId, personId } = await ids();
    const actor = { personId, label: "vitest" };

    const created = await createIssue(db, actor, {
      studyId,
      studySiteId,
      category: "monitoring_finding",
      severity: "minor",
      title: "Probe issue",
      identifiedDate: new Date().toISOString().slice(0, 10),
      identifiedBy: personId,
      dueDate: new Date(Date.now() - 86400e3).toISOString().slice(0, 10), // past due
    });
    probeIssueIds.push(created.id);
    const [overdue] = await sql`
      SELECT status FROM v_issue_status WHERE id = ${created.id}`;
    expect(overdue!.status).toBe("overdue");

    await resolveIssue(db, actor, {
      issueId: created.id,
      resolvedBy: personId,
      resolutionNote: "Probe resolved",
    });
    const [resolved] = await sql`
      SELECT status FROM v_issue_status WHERE id = ${created.id}`;
    expect(resolved!.status).toBe("resolved");

    // Resolution is an audited UPDATE with before/after row images
    const [event] = await sql`
      SELECT before, after FROM audit_event
      WHERE entity_type = 'issue' AND entity_id = ${created.id}
        AND action = 'issue.update'
      ORDER BY id DESC LIMIT 1`;
    expect(event!.before.resolved_at).toBeNull();
    expect(event!.after.resolved_at).toBeTruthy();
  });
});

describe("enrollment reports", () => {
  it("latest as_of_date wins in v_site_enrollment; corrections are audited upserts", async () => {
    const { studySiteId, personId } = await ids();
    const actor = { personId, label: "vitest" };
    const today = new Date().toISOString().slice(0, 10);
    probeEnrollmentKey = { studySiteId, asOfDate: today };

    await reportEnrollment(db, actor, {
      studySiteId,
      asOfDate: today,
      screened: 20,
      enrolled: 12,
      withdrawn: 1,
      completed: 3,
      reportedBy: personId,
    });
    const [latest] = await sql`
      SELECT as_of_date, enrolled FROM v_site_enrollment
      WHERE study_site_id = ${studySiteId}`;
    expect(latest!.as_of_date).toBe(today);
    expect(latest!.enrolled).toBe(12);

    // Correcting the same as_of_date updates in place (audited), not duplicates
    await reportEnrollment(db, actor, {
      studySiteId,
      asOfDate: today,
      screened: 21,
      enrolled: 12,
      withdrawn: 1,
      completed: 3,
      reportedBy: personId,
    });
    const rows = await sql`
      SELECT count(*)::int AS n FROM enrollment_report
      WHERE study_site_id = ${studySiteId} AND as_of_date = ${today}`;
    expect(rows[0]!.n).toBe(1);

    // CHECK constraint: enrolled must cover withdrawn + completed
    await expect(
      reportEnrollment(db, actor, {
        studySiteId,
        asOfDate: today,
        screened: 5,
        enrolled: 2,
        withdrawn: 2,
        completed: 1,
      }),
    ).rejects.toThrow(/enrollment_report_counts_check/);
  });
});
