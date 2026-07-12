import { delegation, trainingRecord, type Db, type Sql } from "@ctms/db";
import { and, eq, isNull } from "drizzle-orm";
import { withActor, type Actor } from "./actor.js";

// Site-seat log workflows (ADR-0023). Delegation and training entries are
// dated facts with derived status — same discipline as admin.ts: ending a
// delegation sets end_date, nothing is ever deleted, and the audit trigger
// records every write. The signed DoA log document stays the authoritative
// Part 11 record; these rows are the queryable layer beside it.

export type DelegationStatus = "active" | "ended";
export type TrainingStatus = "current" | "expiring_soon" | "expired";

export async function createDelegation(
  db: Db,
  actor: Actor,
  input: {
    studySiteId: string;
    personId: string;
    delegatedTasks: string[];
    startDate: string;
    authorizedBy: string;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(delegation)
      .values({
        studySiteId: input.studySiteId,
        personId: input.personId,
        delegatedTasks: input.delegatedTasks,
        startDate: input.startDate,
        authorizedBy: input.authorizedBy,
      })
      .returning();
    return rows[0]!;
  });
}

export async function endDelegation(
  db: Db,
  actor: Actor,
  input: { delegationId: string; endDate: string },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(delegation)
      .set({ endDate: input.endDate })
      .where(and(eq(delegation.id, input.delegationId), isNull(delegation.endDate)))
      .returning();
    if (!rows[0]) throw new Error("delegation not found or already ended");
    return rows[0];
  });
}

export async function recordTraining(
  db: Db,
  actor: Actor,
  input: {
    studySiteId: string;
    personId: string;
    topic: string;
    trainedOn: string;
    expiresAt?: string | null;
    documentId?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(trainingRecord)
      .values({
        studySiteId: input.studySiteId,
        personId: input.personId,
        topic: input.topic,
        trainedOn: input.trainedOn,
        expiresAt: input.expiresAt ?? null,
        documentId: input.documentId ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function delegationLog(
  sql: Sql,
  filter: { studySiteId: string; status?: DelegationStatus },
) {
  return sql`
    SELECT d.*
    FROM v_delegation_log d
    WHERE d.study_site_id = ${filter.studySiteId}
      AND (${filter.status ?? null}::text IS NULL OR d.status = ${filter.status ?? null})
    ORDER BY (d.status = 'active') DESC, d.start_date DESC, d.family_name`;
}

export async function trainingLog(
  sql: Sql,
  filter: { studySiteId: string; status?: TrainingStatus },
) {
  return sql`
    SELECT t.*
    FROM v_training_log t
    WHERE t.study_site_id = ${filter.studySiteId}
      AND (${filter.status ?? null}::text IS NULL OR t.status = ${filter.status ?? null})
    ORDER BY t.trained_on DESC, t.family_name`;
}

/**
 * One site with its study context and completeness rollup — the site seat's
 * landing data, served by /study-sites/{id} for both seats (ADR-0023).
 */
export async function siteOverview(sql: Sql, studySiteId: string) {
  const rows = await sql`
    SELECT ss.id AS study_site_id, ss.study_id, ss.site_number, ss.status,
           ss.activated_at, ss.target_enrollment,
           si.name AS site_name, si.city, si.state,
           st.protocol_number, st.title AS study_title,
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
    JOIN study st ON st.id = ss.study_id
    LEFT JOIN v_study_site_completeness c ON c.study_site_id = ss.id
    WHERE ss.id = ${studySiteId}`;
  return rows[0] ?? null;
}

export async function siteEnrollment(sql: Sql, studySiteId: string) {
  return sql`
    SELECT e.* FROM v_site_enrollment e
    WHERE e.study_site_id = ${studySiteId}`;
}
