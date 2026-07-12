import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Document metadata search (ADR-0019) against the seeded study: read-only,
 * so no fixtures and no cleanup — results are whatever the record says.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study LIMIT 1`;
  studyId = study!.id;
});
afterAll(() => sql.end());

const search = async (q: string, extra = "", headers = ADMIN) => {
  const res = await app.request(
    `/studies/${studyId}/document-search?q=${encodeURIComponent(q)}${extra}`,
    { headers },
  );
  return { status: res.status, rows: res.status === 200 ? ((await res.json()) as any[]) : [] };
};

describe("document search (ADR-0019)", () => {
  it("finds a document by title words, stem-free but case-insensitive", async () => {
    const { status, rows } = await search("investigator brochure");
    expect(status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].title).toContain("Investigator's Brochure");
  });

  it("every token must match: adding a person narrows to their documents", async () => {
    const broad = await search("license");
    const narrow = await search("license raman");
    expect(narrow.rows.length).toBeGreaterThan(0);
    expect(narrow.rows.length).toBeLessThan(broad.rows.length);
    for (const r of narrow.rows) {
      expect(`${r.person_given_name} ${r.person_family_name}`).toContain("Raman");
    }
  });

  it("matches artifact codes and site numbers ('04.01 002')", async () => {
    const { rows } = await search("04.01 002");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.artifact_code.startsWith("04.01")).toBe(true);
      expect(r.site_number).toBe("002");
    }
  });

  it("filters by document status", async () => {
    const { rows } = await search("irb", "&status=pending_review");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.status).toBe("pending_review");
  });

  it("LIKE wildcards in the query are literals, not injection", async () => {
    const { status, rows } = await search("100% protocol");
    expect(status).toBe(200);
    expect(rows.length).toBe(0); // no title contains a literal '100%'
  });

  it("a one-character query is rejected at the schema boundary", async () => {
    const { status } = await search("x");
    expect(status).toBe(400);
  });

  it("read permission suffices: the monitor can search", async () => {
    const { status, rows } = await search("protocol", "", MONITOR);
    expect(status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
  });
});
