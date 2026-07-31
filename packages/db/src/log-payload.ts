import { createHash } from "node:crypto";

/**
 * Canonical serialization of a log entry's fact columns for entry-level
 * e-signatures (ADR-0036). One implementation, used by signing, read-time
 * verification (facts_match), and the seed — the §11.70-style binding depends
 * on all three producing identical bytes for identical facts.
 *
 * Facts are the site-authored columns only: ids and dates as their SQL text
 * form ('YYYY-MM-DD'), created_at excluded (server-assigned, not attested).
 * Keys serialize in the fixed order below; absent optionals serialize as null.
 */

export type LogEntryKind = "delegation" | "training_record" | "screening_entry";

const FACT_KEYS: Record<LogEntryKind, readonly string[]> = {
  delegation: [
    "id",
    "study_site_id",
    "person_id",
    "delegated_tasks",
    "start_date",
    "end_date",
    "authorized_by",
  ],
  training_record: [
    "id",
    "study_site_id",
    "person_id",
    "topic",
    "trained_on",
    "expires_at",
    "document_id",
  ],
  screening_entry: [
    "id",
    "study_site_id",
    "screening_number",
    "screened_on",
    "enrolled_on",
    "screen_failed_on",
    "failure_reason",
  ],
};

export function logEntryPayload(
  kind: LogEntryKind,
  facts: Record<string, unknown>,
): string {
  const body: Record<string, unknown> = { kind };
  for (const key of FACT_KEYS[kind]) {
    const value = facts[key];
    if (value === undefined || value === null) {
      body[key] = null;
    } else if (value instanceof Date) {
      // Date-typed columns are facts as dates, not instants.
      body[key] = value.toISOString().slice(0, 10);
    } else {
      body[key] = value;
    }
  }
  return JSON.stringify(body);
}

export function logEntrySha256(
  kind: LogEntryKind,
  facts: Record<string, unknown>,
): string {
  return createHash("sha256").update(logEntryPayload(kind, facts)).digest("hex");
}
