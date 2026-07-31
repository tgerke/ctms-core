import {
  delegation,
  logEntrySha256,
  logSignature,
  screeningEntry,
  trainingRecord,
  type Db,
  type LogEntryKind,
  type Sql,
} from "@ctms/db";
import { and, eq, isNull, sql as dsql } from "drizzle-orm";
import { withActor, type Actor, type Tx } from "./actor.js";

// Site-seat log workflows (ADR-0023). Delegation and training entries are
// dated facts with derived status — same discipline as admin.ts: ending a
// delegation sets end_date, nothing is ever deleted, and the audit trigger
// records every write. The signed DoA log document stays the authoritative
// Part 11 record; these rows are the queryable layer beside it.

export type DelegationStatus = "active" | "ended";
export type TrainingStatus = "current" | "expiring_soon" | "expired";
export type ScreeningStatus = "in_screening" | "enrolled" | "screen_failed";

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

// --- Screening log (ADR-0036) -----------------------------------------------
// The site's operational record of its own screening: pseudonymous numbers
// and dated disposition facts, no clinical data. Recording the one outcome is
// the row's single permitted mutation (the end_date pattern above).

export async function createScreeningEntry(
  db: Db,
  actor: Actor,
  input: { studySiteId: string; screeningNumber: string; screenedOn: string },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(screeningEntry)
      .values({
        studySiteId: input.studySiteId,
        screeningNumber: input.screeningNumber,
        screenedOn: input.screenedOn,
      })
      .returning();
    return rows[0]!;
  });
}

export async function recordScreeningOutcome(
  db: Db,
  actor: Actor,
  input: {
    screeningEntryId: string;
    enrolledOn?: string;
    screenFailedOn?: string;
    failureReason?: string;
  },
) {
  if (!input.enrolledOn === !input.screenFailedOn) {
    throw new Error("record exactly one outcome: enrolled_on or screen_failed_on");
  }
  if (!input.screenFailedOn !== !input.failureReason?.trim()) {
    throw new Error("a screen failure requires its reason; enrollment takes none");
  }
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(screeningEntry)
      .set(
        input.enrolledOn
          ? { enrolledOn: input.enrolledOn }
          : { screenFailedOn: input.screenFailedOn, failureReason: input.failureReason!.trim() },
      )
      .where(
        and(
          eq(screeningEntry.id, input.screeningEntryId),
          isNull(screeningEntry.enrolledOn),
          isNull(screeningEntry.screenFailedOn),
        ),
      )
      .returning();
    if (!rows[0]) throw new Error("screening entry not found or outcome already recorded");
    return rows[0];
  });
}

export async function screeningLog(
  sql: Sql,
  filter: { studySiteId: string; status?: ScreeningStatus },
) {
  return sql`
    SELECT se.*
    FROM v_screening_log se
    WHERE se.study_site_id = ${filter.studySiteId}
      AND (${filter.status ?? null}::text IS NULL OR se.status = ${filter.status ?? null})
    ORDER BY se.screened_on DESC, se.screening_number DESC`;
}

/** Log counts beside the site's latest as-reported aggregates (ADR-0011). */
export async function screeningSummary(sql: Sql, studySiteId: string) {
  const rows = await sql`
    SELECT s.* FROM v_screening_summary s
    WHERE s.study_site_id = ${studySiteId}`;
  return rows[0] ?? null;
}

// --- Entry-level e-signatures (ADR-0036) -------------------------------------
// The §11.200 ceremony applied to individual log entries. The signature binds
// to the entry's canonical facts by hash (logEntrySha256); a later permitted
// mutation surfaces as facts_match = false at read time, never a block.

/** Fact columns in their SQL text forms — the one shape logEntrySha256
 *  hashes. Casts keep dates/uuids identical across drivers and call sites;
 *  the entry's table name is its kind. */
const FACT_COLUMNS: Record<LogEntryKind, string> = {
  delegation:
    "id::text, study_site_id::text, person_id::text, delegated_tasks, start_date::text, end_date::text, authorized_by::text",
  training_record:
    "id::text, study_site_id::text, person_id::text, topic, trained_on::text, expires_at::text, document_id::text",
  screening_entry:
    "id::text, study_site_id::text, screening_number, screened_on::text, enrolled_on::text, screen_failed_on::text, failure_reason",
};

async function entryFacts(tx: Tx, kind: LogEntryKind, entryId: string) {
  const rows = (await tx.execute(
    dsql`SELECT ${dsql.raw(FACT_COLUMNS[kind])} FROM ${dsql.raw(kind)} WHERE id = ${entryId}`,
  )) as unknown as Record<string, unknown>[];
  return rows[0] ?? null;
}

export interface SignLogEntryInput {
  kind: LogEntryKind;
  entryId: string;
  signerPersonId: string;
  meaning: "author" | "review" | "approval";
  // §11.200: the API layer verifies the ceremony; this layer records it.
  reauthMethod: "oidc_fresh_token" | "dev_token" | "seed_fixture";
  reauthAt: Date;
}

export async function signLogEntry(db: Db, actor: Actor, input: SignLogEntryInput) {
  return withActor(db, actor, async (tx) => {
    const facts = await entryFacts(tx, input.kind, input.entryId);
    if (!facts) throw new Error("log entry not found");
    const rows = await tx
      .insert(logSignature)
      .values({
        delegationId: input.kind === "delegation" ? input.entryId : null,
        trainingRecordId: input.kind === "training_record" ? input.entryId : null,
        screeningEntryId: input.kind === "screening_entry" ? input.entryId : null,
        signerPersonId: input.signerPersonId,
        meaning: input.meaning,
        signedSha256: logEntrySha256(input.kind, facts),
        reauthMethod: input.reauthMethod,
        reauthAt: input.reauthAt,
      })
      .returning();
    return rows[0]!;
  });
}

export interface LogSignatureRow {
  entry_id: string;
  signature_id: string;
  signer_person_id: string;
  signer_given_name: string;
  signer_family_name: string;
  meaning: "author" | "review" | "approval";
  signed_at: Date | string;
  signed_sha256: string;
  reauth_method: string;
  facts_match: boolean;
}

const ENTRY_COLUMN: Record<LogEntryKind, string> = {
  delegation: "delegation_id",
  training_record: "training_record_id",
  screening_entry: "screening_entry_id",
};

/**
 * Signatures for every entry of one site's log, grouped by entry id, each
 * verified against the entry's current facts. Verification recomputes the
 * canonical hash here, at read time — no stored validity flag exists to
 * drift (ADR-0006).
 */
export async function siteLogSignatures(
  sql: Sql,
  kind: LogEntryKind,
  studySiteId: string,
): Promise<Map<string, LogSignatureRow[]>> {
  const rows = await sql`
    SELECT ls.id AS signature_id, ls.${sql(ENTRY_COLUMN[kind])}::text AS entry_id,
           ls.signer_person_id, p.given_name AS signer_given_name,
           p.family_name AS signer_family_name, ls.meaning, ls.signed_at,
           ls.signed_sha256, ls.reauth_method
    FROM log_signature ls
    JOIN ${sql(kind)} e ON e.id = ls.${sql(ENTRY_COLUMN[kind])}
    JOIN person p ON p.id = ls.signer_person_id
    WHERE e.study_site_id = ${studySiteId}
    ORDER BY ls.signed_at`;
  const grouped = new Map<string, LogSignatureRow[]>();
  if (rows.length === 0) return grouped;
  // Signed entries are few; re-derive each entry's current hash once.
  const currentHash = new Map<string, string>();
  for (const entryId of new Set(rows.map((r) => r.entry_id as string))) {
    const factsRows = await sql.unsafe(
      `SELECT ${FACT_COLUMNS[kind]} FROM ${kind} WHERE id = $1`,
      [entryId],
    );
    const facts = factsRows[0] as Record<string, unknown> | undefined;
    if (facts) currentHash.set(entryId, logEntrySha256(kind, facts));
  }
  for (const r of rows) {
    const entryId = r.entry_id as string;
    const list = grouped.get(entryId) ?? [];
    list.push({
      entry_id: entryId,
      signature_id: r.signature_id as string,
      signer_person_id: r.signer_person_id as string,
      signer_given_name: r.signer_given_name as string,
      signer_family_name: r.signer_family_name as string,
      meaning: r.meaning as LogSignatureRow["meaning"],
      signed_at: r.signed_at as Date,
      signed_sha256: r.signed_sha256 as string,
      reauth_method: r.reauth_method as string,
      facts_match: currentHash.get(entryId) === r.signed_sha256,
    });
    grouped.set(entryId, list);
  }
  return grouped;
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
