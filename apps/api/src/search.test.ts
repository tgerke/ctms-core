import { createDb, makePdf } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Document search against the seeded study: metadata (ADR-0019) plus content
 * full-text (ADR-0022). The metadata tests are read-only; the content tests
 * upload fixtures typed to the test-only 99.99.99 artifact (immutable by
 * design, so no cleanup) marked with a per-run token to stay isolated from
 * earlier runs.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let studySiteId: string;
let fixtureArtifactId: number;
let rankingPersonId: string;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;
  const [site] = await sql`
    SELECT id FROM study_site WHERE study_id = ${studyId} ORDER BY site_number LIMIT 1`;
  studySiteId = site!.id;

  await sql`SELECT set_config('ctms.actor_label', 'vitest', false)`;
  const [zone] = await sql`
    INSERT INTO tmf_zone (number, name) VALUES (99, 'Test Fixtures')
    ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [section] = await sql`
    INSERT INTO tmf_section (zone_id, code, name) VALUES (${zone!.id}, '99.99', 'Test')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [artifact] = await sql`
    INSERT INTO tmf_artifact (section_id, code, name)
    VALUES (${section!.id}, '99.99.99', 'API Test Fixture')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  fixtureArtifactId = artifact!.id;
  // The ranking fixtures are person-scoped so they can never be picked up by
  // another test file's "existing document with this artifact + scope"
  // lookup (those all run with person_id null). Raman and Patel appear in
  // name-based search assertions, so any other person keeps those honest.
  const [person] = await sql`
    SELECT id FROM person WHERE family_name NOT IN ('Raman', 'Patel')
    ORDER BY family_name LIMIT 1`;
  rankingPersonId = person!.id;
});
afterAll(() => sql.end());

async function uploadFixture(
  bytes: BlobPart,
  fileName: string,
  mimeType: string,
  // forceNew gives a test its own document; without it uploads pile onto the
  // shared fixture document as versions (the ADR-0022 tests rely on that).
  // personScoped keeps forceNew documents out of every other file's
  // artifact + site scope.
  opts: { title?: string; forceNew?: boolean; personScoped?: boolean } = {},
): Promise<{ document_id: string; version_id: string; sha256: string }> {
  const form = new FormData();
  form.set("file", new File([bytes], fileName, { type: mimeType }));
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("study_site_id", studySiteId);
  if (opts.personScoped) form.set("person_id", rankingPersonId);
  form.set("title", opts.title ?? "Content search fixture");
  if (opts.forceNew) form.set("force_new", "true");
  const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as { document_id: string; version_id: string; sha256: string };
}

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

describe("content full-text search (ADR-0022)", () => {
  // Unique per run: fixture versions are immutable and accumulate, so each
  // run searches for text only it uploaded.
  const marker = `excursion${Date.now()}`;

  it("a word that exists only inside the PDF finds the document, with a snippet", async () => {
    const pdf = makePdf([
      "Content search fixture",
      `Temperature ${marker} noted in the investigational product fridge.`,
      "Corrective action logged the same day.",
    ]);
    const { document_id } = await uploadFixture(
      new Uint8Array(pdf),
      "fixture.pdf",
      "application/pdf",
    );

    const { rows } = await search(marker);
    expect(rows.length).toBe(1);
    expect(rows[0].document_id).toBe(document_id);
    expect(rows[0].matched_in_content).toBe(true);
    expect(rows[0].content_snippet).toContain(marker);
  });

  it("tokens mix freely across metadata and content", async () => {
    // 'fixture' matches the title (metadata); the marker matches only content.
    const { rows } = await search(`fixture ${marker}`);
    expect(rows.length).toBe(1);
    expect(rows[0].matched_in_content).toBe(true);
  });

  it("a metadata-only match carries no snippet", async () => {
    // Uploader names never appear inside the seeded PDFs.
    const { rows } = await search("patel");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.matched_in_content).toBe(false);
      expect(r.content_snippet).toBeNull();
    }
  });

  it("unextractable bytes never block the upload; the failure is recorded", async () => {
    const brokenMarker = `broken${Date.now()}`;
    const { sha256 } = await uploadFixture(
      `not a pdf ${brokenMarker}`,
      "broken.pdf",
      "application/pdf",
    );
    const [row] = await sql`
      SELECT status, content FROM document_content_text WHERE sha256 = ${sha256}`;
    expect(row!.status).toBe("failed");
    expect(row!.content).toBeNull();
    // And the failed bytes are invisible to content search.
    const { rows } = await search(brokenMarker);
    expect(rows.length).toBe(0);
  });
});

describe("relevance ranking (ADR-0037)", () => {
  // Each test uploads in the order that would put the WRONG document first
  // under the old latest-upload ordering, so a pass proves rank drives.

  it("a title match outranks a content-only match, whatever uploaded last", async () => {
    const marker = `rank${Date.now()}`;
    const titled = await uploadFixture(
      "body text with nothing notable in it",
      "titled.txt",
      "text/plain",
      { title: `Ranking fixture ${marker}`, forceNew: true, personScoped: true },
    );
    const mention = await uploadFixture(
      `the ${marker} appears once in passing`,
      "mention.txt",
      "text/plain",
      { forceNew: true, personScoped: true },
    );

    const { rows } = await search(marker);
    expect(rows.map((r) => r.document_id)).toEqual([
      titled.document_id,
      mention.document_id,
    ]);
    expect(rows[0].rank).toBeGreaterThan(rows[1].rank);
  });

  it("more content occurrences rank higher, capped so bulk cannot run away", async () => {
    const marker = `occ${Date.now()}`;
    const thrice = await uploadFixture(
      `${marker} then ${marker} then ${marker}`,
      "thrice.txt",
      "text/plain",
      { forceNew: true, personScoped: true },
    );
    const flood = await uploadFixture(
      Array.from({ length: 40 }, () => marker).join(" "),
      "flood.txt",
      "text/plain",
      { forceNew: true, personScoped: true },
    );
    const once = await uploadFixture(`${marker} alone`, "once.txt", "text/plain", {
      forceNew: true,
      personScoped: true,
    });

    const { rows } = await search(marker);
    expect(rows.length).toBe(3);
    expect(rows[rows.length - 1].document_id).toBe(once.document_id);
    const rankOf = (id: string) => rows.find((r) => r.document_id === id)!.rank;
    expect(rankOf(thrice.document_id)).toBeGreaterThan(rankOf(once.document_id));
    // 40 mentions score the same as 4: the cap keeps a wordy document from
    // drowning everything else.
    expect(rankOf(flood.document_id)).toBe(4);
  });

  it("equal ranks keep the previous ordering: latest upload first", async () => {
    const marker = `tie${Date.now()}`;
    const older = await uploadFixture(`${marker} alpha`, "older.txt", "text/plain", {
      forceNew: true,
      personScoped: true,
    });
    const newer = await uploadFixture(`${marker} beta`, "newer.txt", "text/plain", {
      forceNew: true,
      personScoped: true,
    });

    const { rows } = await search(marker);
    expect(rows[0].rank).toBe(rows[1].rank);
    expect(rows.map((r) => r.document_id)).toEqual([
      newer.document_id,
      older.document_id,
    ]);
  });
});
