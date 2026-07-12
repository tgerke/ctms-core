import { createHash } from "node:crypto";
import { createDb, getBlob } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectTmfExport } from "./export.js";

// TMF export composition (ADR-0020) against the seeded study: the package's
// promises are checked at the source — every version's blob exists, its
// bytes hash to the recorded sha256, and the audit chain verifies whole.

const { sql } = createDb();
let studyId: string;

beforeAll(async () => {
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;
});
afterAll(() => sql.end());

describe("TMF export (ADR-0020)", () => {
  it("collects every document with versions, signatures, and returns intact", async () => {
    const data = await collectTmfExport(sql, studyId);
    const [{ n }] = await sql<[{ n: number }]>`
      SELECT count(*)::int AS n FROM document WHERE study_id = ${studyId}`;
    expect(data.documents.length).toBe(n);

    const versions = data.documents.flatMap((d) => d.versions as { sha256: string }[]);
    expect(versions.length).toBeGreaterThan(0);
    const signatures = data.documents.flatMap(
      (d) => d.signatures as { signed_sha256: string }[],
    );
    expect(signatures.length).toBeGreaterThan(0);
    // §11.70 binding survives the export: every signature's hash matches one
    // of its document's version hashes.
    for (const doc of data.documents) {
      const hashes = new Set((doc.versions as { sha256: string }[]).map((v) => v.sha256));
      for (const s of doc.signatures as { signed_sha256: string }[]) {
        expect(hashes.has(s.signed_sha256)).toBe(true);
      }
    }
  });

  it("every referenced blob exists and hashes to its recorded sha256", async () => {
    const data = await collectTmfExport(sql, studyId);
    expect(data.blobs.length).toBeGreaterThan(0);
    for (const blob of data.blobs) {
      const bytes = await getBlob(blob.sha256);
      expect(bytes, `blob ${blob.sha256} missing from store`).not.toBeNull();
      const actual = createHash("sha256").update(new Uint8Array(bytes!)).digest("hex");
      expect(actual).toBe(blob.sha256);
    }
  });

  it("carries the whole audit trail with a verified chain and its head hash", async () => {
    const data = await collectTmfExport(sql, studyId);
    const [{ n }] = await sql<[{ n: number }]>`
      SELECT count(*)::int AS n FROM audit_event`;
    expect(data.auditEvents.length).toBe(n);
    expect(data.chain.valid).toBe(true);
    expect(data.chain.head_hash).toBe(data.auditEvents[data.auditEvents.length - 1]!.hash);
  });

  it("the expected-document snapshot matches the live view", async () => {
    const data = await collectTmfExport(sql, studyId);
    const [{ n }] = await sql<[{ n: number }]>`
      SELECT count(*)::int AS n FROM v_expected_document_status WHERE study_id = ${studyId}`;
    expect(data.expected.length).toBe(n);
  });
});
