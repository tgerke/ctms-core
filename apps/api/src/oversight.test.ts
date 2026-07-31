import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * The oversight digest and TMF export served live (ADR-0017/0020/0035): the
 * same data the CLI tools read, through the authenticated HTTP surface.
 * Assertions pin CORC-2202, the seeded study no test file mutates; the digest
 * for CORC-2201 gets structural checks only.
 */

const { sql } = createDb();
let app: ReturnType<typeof buildApp>;
let study2: string;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const SITE = { Authorization: "Bearer dev-site-token" };
const AUDITOR = { Authorization: "Bearer dev-auditor-token" };

const get = (path: string, headers = ADMIN) => app.request(path, { headers });

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  const { db } = createDb();
  app = buildApp(db, sql);
  const [s2] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2202'`;
  study2 = s2!.id;
});
afterAll(() => sql.end());

type Digest = {
  study: { protocol_number: string };
  generated_on: string;
  attention_count: number;
  chain: { events: number; valid: boolean };
  counts: { total: number; missing: number };
  expired: unknown[];
  expiring_soon: unknown[];
  overdue_visits: unknown[];
  overdue_action_items: unknown[];
  overdue_issues: unknown[];
  overdue_milestones: unknown[];
  overdue_reviews: unknown[];
  email: { subject: string; text: string };
  recipients: { email: string }[];
};

describe("GET /studies/{id}/digest (ADR-0017)", () => {
  it("serves the digest email's data, rendering, and recipients", async () => {
    const res = await get(`/studies/${study2}/digest`);
    expect(res.status).toBe(200);
    const d = (await res.json()) as Digest;

    expect(d.study.protocol_number).toBe("CORC-2202");
    // Same seeded facts the portfolio test pins.
    expect(d.counts.total).toBe(6);
    expect(d.counts.missing).toBe(2);
    expect(d.chain.valid).toBe(true);
    expect(d.chain.events).toBeGreaterThan(0);

    // The attention count is exactly what the sections list (chain is valid,
    // so it adds nothing).
    const listed =
      d.expired.length +
      d.expiring_soon.length +
      d.overdue_visits.length +
      d.overdue_action_items.length +
      d.overdue_issues.length +
      d.overdue_milestones.length +
      d.overdue_reviews.length;
    expect(d.attention_count).toBe(listed);

    // The rendered email is the one the scheduled job would send.
    expect(d.email.subject).toContain("CORC-2202");
    expect(d.email.subject).toContain(d.generated_on);
    expect(d.email.text).toContain("Standing counts: 6 expected documents");

    // Recipients are derived from study-wide admin/trial_ops grants.
    expect(d.recipients.length).toBeGreaterThan(0);
    for (const r of d.recipients) expect(r.email).toContain("@");
  });

  it("404s an unknown study", async () => {
    const res = await get("/studies/00000000-0000-0000-0000-000000000000/digest");
    expect(res.status).toBe(404);
  });

  it("is study-wide: the site seat gets 403, the auditor reads it", async () => {
    expect((await get(`/studies/${study2}/digest`, SITE)).status).toBe(403);
    expect((await get(`/studies/${study2}/digest`, AUDITOR)).status).toBe(200);
  });
});

type TmfExport = {
  study: { protocol_number: string };
  documents: { versions: { id: string; sha256: string }[] }[];
  expected: unknown[];
  audit_events: { hash: string }[];
  chain: { events: number; valid: boolean; head_hash: string | null };
  blobs: { sha256: string; size_bytes: number; mime_type: string }[];
  tmf_rm_version: string | null;
};

describe("GET /studies/{id}/export (ADR-0020/0035)", () => {
  it("serves the package data: documents, expected snapshot, full trail, content hashes", async () => {
    const res = await get(`/studies/${study2}/export`);
    expect(res.status).toBe(200);
    const d = (await res.json()) as TmfExport;

    expect(d.study.protocol_number).toBe("CORC-2202");
    // Protocol, IB, site-001 IRB, and the PI's CV are filed as seeded.
    expect(d.documents.length).toBe(4);
    expect(d.expected.length).toBe(6);

    // The full hash-chained trail, whole (it only verifies end to end), with
    // the head hash the receiving side pins.
    expect(d.audit_events.length).toBe(d.chain.events);
    expect(d.chain.valid).toBe(true);
    expect(d.chain.head_hash).toBe(d.audit_events[d.audit_events.length - 1]!.hash);

    // Every content hash is reachable through some version, so a client can
    // fetch and verify the bytes per blob (ADR-0035).
    const versionShas = new Set(
      d.documents.flatMap((doc) => doc.versions.map((v) => v.sha256)),
    );
    expect(d.blobs.length).toBeGreaterThan(0);
    for (const b of d.blobs) {
      expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(versionShas.has(b.sha256)).toBe(true);
    }

    // Present (possibly null) so the client can say whether EMS serialization
    // is even possible — the value itself comes only from the verbatim import.
    expect("tmf_rm_version" in d).toBe(true);
  });

  it("404s an unknown study", async () => {
    const res = await get("/studies/00000000-0000-0000-0000-000000000000/export");
    expect(res.status).toBe(404);
  });

  it("is study-wide: the site seat gets 403, the auditor reads it", async () => {
    expect((await get(`/studies/${study2}/export`, SITE)).status).toBe(403);
    expect((await get(`/studies/${study2}/export`, AUDITOR)).status).toBe(200);
  });
});
