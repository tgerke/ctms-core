import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attentionCount,
  collectDigest,
  digestRecipients,
  renderDigest,
  type DigestData,
} from "./digest.js";

// Digest composition (ADR-0017) against the seeded database. The digest is a
// pure function of the derived views, so these tests assert structure and
// coherence rather than exact seeded counts (other test files mutate demo
// state within a run).

const { sql } = createDb();
let studyId: string;

beforeAll(async () => {
  const [study] = await sql`SELECT id FROM study LIMIT 1`;
  studyId = study!.id;
});
afterAll(() => sql.end());

describe("digest notifications (ADR-0017)", () => {
  it("collects a digest whose numbers cohere with the views", async () => {
    const d = await collectDigest(sql, studyId);
    expect(d.study.protocol_number).toBeTruthy();
    expect(d.chain.valid).toBe(true);
    expect(d.counts.total).toBeGreaterThan(0);
    expect(attentionCount(d)).toBe(
      d.expired.length +
        d.expiringSoon.length +
        d.overdueVisits.length +
        d.overdueActionItems.length +
        d.overdueIssues.length +
        d.overdueMilestones.length,
    );
    for (const row of [...d.expired, ...d.expiringSoon]) {
      expect(row.effective_expiry).toBeTruthy();
    }
  });

  it("renders a subject and body that carry the study and the counts", async () => {
    const d = await collectDigest(sql, studyId);
    const { subject, text } = renderDigest(d);
    expect(subject).toContain(d.study.protocol_number);
    expect(subject).toContain(
      attentionCount(d) === 0 ? "all clear" : `${attentionCount(d)} item`,
    );
    expect(text).toContain("Standing counts:");
    expect(text).toContain(`Audit chain verified: ${d.chain.events} events.`);
  });

  it("a broken chain leads the email and the subject count", async () => {
    const d = await collectDigest(sql, studyId);
    const broken: DigestData = { ...d, chain: { events: d.chain.events, valid: false } };
    expect(attentionCount(broken)).toBe(attentionCount(d) + 1);
    const { text } = renderDigest(broken);
    expect(text).toContain("AUDIT CHAIN BROKEN");
    expect(text.indexOf("AUDIT CHAIN BROKEN")).toBeLessThan(text.indexOf("Standing counts:"));
  });

  it("recipients are the study-wide admin/trial_ops seats, nobody else", async () => {
    const recipients = await digestRecipients(sql, studyId);
    const emails = recipients.map((r) => r.email);
    expect(emails).toContain("nora.feld@corc.example"); // unscoped admin
    expect(emails).not.toContain("ravi.patel@meridiancro.example"); // monitor
    expect(emails).not.toContain("edc.filing@corc.example"); // ingest machine
  });
});
