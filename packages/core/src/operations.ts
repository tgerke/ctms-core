import {
  enrollmentReport,
  issue,
  monitoringVisit,
  monitoringVisitDocument,
  studyMilestone,
  visitActionItem,
  type Db,
} from "@ctms/db";
import { eq } from "drizzle-orm";
import { withActor, type Actor } from "./actor.js";

// Operational-layer mutations (ADR-0006). All writes go through withActor so
// the audit triggers attribute them; lifecycle stages are never written here —
// they are derived by the v_* views from the dated facts these functions set.

export type VisitType = "pre_study" | "initiation" | "interim" | "close_out";
export type VisitDocumentLink = "trip_report" | "confirmation_letter" | "follow_up_letter";
export type IssueCategory =
  | "protocol_deviation"
  | "monitoring_finding"
  | "safety"
  | "data_quality"
  | "other";
export type IssueSeverity = "minor" | "major" | "critical";

export async function scheduleVisit(
  db: Db,
  actor: Actor,
  input: {
    studySiteId: string;
    visitType: VisitType;
    scheduledDate: string;
    monitorPersonId?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(monitoringVisit)
      .values({
        studySiteId: input.studySiteId,
        visitType: input.visitType,
        scheduledDate: input.scheduledDate,
        monitorPersonId: input.monitorPersonId ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function updateVisit(
  db: Db,
  actor: Actor,
  input: {
    monitoringVisitId: string;
    scheduledDate?: string;
    visitDate?: string | null;
    monitorPersonId?: string | null;
    summary?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(monitoringVisit)
      .set({
        ...(input.scheduledDate !== undefined ? { scheduledDate: input.scheduledDate } : {}),
        ...(input.visitDate !== undefined ? { visitDate: input.visitDate } : {}),
        ...(input.monitorPersonId !== undefined
          ? { monitorPersonId: input.monitorPersonId }
          : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
      })
      .where(eq(monitoringVisit.id, input.monitoringVisitId))
      .returning();
    if (!rows[0]) throw new Error("monitoring visit not found");
    return rows[0];
  });
}

export async function linkVisitDocument(
  db: Db,
  actor: Actor,
  input: { monitoringVisitId: string; documentId: string; linkKind: VisitDocumentLink },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(monitoringVisitDocument)
      .values({
        monitoringVisitId: input.monitoringVisitId,
        documentId: input.documentId,
        linkKind: input.linkKind,
      })
      .returning();
    return rows[0]!;
  });
}

export async function createActionItem(
  db: Db,
  actor: Actor,
  input: { monitoringVisitId: string; description: string; dueDate?: string | null },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(visitActionItem)
      .values({
        monitoringVisitId: input.monitoringVisitId,
        description: input.description,
        dueDate: input.dueDate ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function resolveActionItem(
  db: Db,
  actor: Actor,
  input: {
    actionItemId: string;
    resolvedBy: string;
    resolvedAt?: string;
    resolutionNote?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(visitActionItem)
      .set({
        resolvedAt: input.resolvedAt ?? new Date().toISOString().slice(0, 10),
        resolvedBy: input.resolvedBy,
        resolutionNote: input.resolutionNote ?? null,
      })
      .where(eq(visitActionItem.id, input.actionItemId))
      .returning();
    if (!rows[0]) throw new Error("action item not found");
    return rows[0];
  });
}

export async function createIssue(
  db: Db,
  actor: Actor,
  input: {
    studyId: string;
    studySiteId?: string | null;
    monitoringVisitId?: string | null;
    category: IssueCategory;
    severity: IssueSeverity;
    title: string;
    description?: string | null;
    identifiedDate: string;
    identifiedBy?: string | null;
    dueDate?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(issue)
      .values({
        studyId: input.studyId,
        studySiteId: input.studySiteId ?? null,
        monitoringVisitId: input.monitoringVisitId ?? null,
        category: input.category,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
        identifiedDate: input.identifiedDate,
        identifiedBy: input.identifiedBy ?? null,
        dueDate: input.dueDate ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function resolveIssue(
  db: Db,
  actor: Actor,
  input: {
    issueId: string;
    resolvedBy: string;
    resolvedAt?: string;
    resolutionNote?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(issue)
      .set({
        resolvedAt: input.resolvedAt ?? new Date().toISOString().slice(0, 10),
        resolvedBy: input.resolvedBy,
        resolutionNote: input.resolutionNote ?? null,
      })
      .where(eq(issue.id, input.issueId))
      .returning();
    if (!rows[0]) throw new Error("issue not found");
    return rows[0];
  });
}

/** Upsert the as-reported counts for a (site, as_of_date). Corrections to an
 *  existing report are audited UPDATEs with full before/after row images. */
export async function reportEnrollment(
  db: Db,
  actor: Actor,
  input: {
    studySiteId: string;
    asOfDate: string;
    screened: number;
    enrolled: number;
    withdrawn: number;
    completed: number;
    reportedBy?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(enrollmentReport)
      .values({
        studySiteId: input.studySiteId,
        asOfDate: input.asOfDate,
        screened: input.screened,
        enrolled: input.enrolled,
        withdrawn: input.withdrawn,
        completed: input.completed,
        reportedBy: input.reportedBy ?? null,
      })
      .onConflictDoUpdate({
        target: [enrollmentReport.studySiteId, enrollmentReport.asOfDate],
        set: {
          screened: input.screened,
          enrolled: input.enrolled,
          withdrawn: input.withdrawn,
          completed: input.completed,
          reportedBy: input.reportedBy ?? null,
        },
      })
      .returning();
    return rows[0]!;
  });
}

export async function createMilestone(
  db: Db,
  actor: Actor,
  input: {
    studyId: string;
    studySiteId?: string | null;
    name: string;
    plannedDate: string;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(studyMilestone)
      .values({
        studyId: input.studyId,
        studySiteId: input.studySiteId ?? null,
        name: input.name,
        plannedDate: input.plannedDate,
      })
      .returning();
    return rows[0]!;
  });
}

export async function achieveMilestone(
  db: Db,
  actor: Actor,
  input: { milestoneId: string; actualDate?: string },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(studyMilestone)
      .set({ actualDate: input.actualDate ?? new Date().toISOString().slice(0, 10) })
      .where(eq(studyMilestone.id, input.milestoneId))
      .returning();
    if (!rows[0]) throw new Error("milestone not found");
    return rows[0];
  });
}
