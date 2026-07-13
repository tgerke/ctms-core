import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Version content for queue-side preview (ADR-0027) through the HTTP surface:
 * the exact uploaded bytes come back with their uploaded mime type and the
 * content hash, and the read is scoped to the version's study/site — the
 * site seat previews its own site's documents and nothing else. Fixtures use
 * a dedicated test-only artifact (99.99.98): this suite creates force_new
 * documents, which would change "the latest document for artifact + scope"
 * under the suites sharing 99.99.99. Immutable rows accumulate by design.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let site001: string;
let site002: string;
let fixtureArtifactId: number;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };
const SITE = { Authorization: "Bearer dev-site-token" }; // scoped to site 001

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;
  const sites = await sql`
    SELECT id, site_number FROM study_site
    WHERE study_id = ${studyId} AND site_number IN ('001', '002')`;
  site001 = sites.find((s) => s.site_number === "001")!.id;
  site002 = sites.find((s) => s.site_number === "002")!.id;

  await sql`SELECT set_config('ctms.actor_label', 'vitest', false)`;
  const [zone] = await sql`
    INSERT INTO tmf_zone (number, name) VALUES (99, 'Test Fixtures')
    ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [section] = await sql`
    INSERT INTO tmf_section (zone_id, code, name) VALUES (${zone!.id}, '99.99', 'Test')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [artifact] = await sql`
    INSERT INTO tmf_artifact (section_id, code, name)
    VALUES (${section!.id}, '99.99.98', 'Content Preview Fixture')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  fixtureArtifactId = artifact!.id;
});
afterAll(() => sql.end());

async function uploadFixture(
  studySiteId: string,
  file: File,
): Promise<{ version_id: string; sha256: string }> {
  const form = new FormData();
  form.set("file", file);
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("study_site_id", studySiteId);
  form.set("title", "Content fixture");
  form.set("force_new", "true");
  const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as { version_id: string; sha256: string };
}

describe("GET /document-versions/{id}/content (ADR-0027)", () => {
  it("returns the exact bytes with the uploaded mime type, file name, and hash (§11.10(b))", async () => {
    const body = `content fixture ${Date.now()}-${Math.random()}`;
    const { version_id, sha256 } = await uploadFixture(
      site002,
      new File([body], "note.txt", { type: "text/plain" }),
    );
    const res = await app.request(`/document-versions/${version_id}/content`, {
      headers: ADMIN,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="note.txt"');
    expect(res.headers.get("x-content-sha256")).toBe(sha256);
    expect(await res.text()).toBe(body);
  });

  it("requires authentication", async () => {
    const { version_id } = await uploadFixture(
      site002,
      new File(["unauthenticated fixture"], "note.txt", { type: "text/plain" }),
    );
    const res = await app.request(`/document-versions/${version_id}/content`);
    expect(res.status).toBe(401);
  });

  it("is scoped to the version's site: the site seat reads its own site only", async () => {
    const own = await uploadFixture(
      site001,
      new File(["site 001 fixture"], "own.txt", { type: "text/plain" }),
    );
    const other = await uploadFixture(
      site002,
      new File(["site 002 fixture"], "other.txt", { type: "text/plain" }),
    );

    const ownRes = await app.request(`/document-versions/${own.version_id}/content`, {
      headers: SITE,
    });
    expect(ownRes.status).toBe(200);
    expect(await ownRes.text()).toBe("site 001 fixture");

    const otherRes = await app.request(`/document-versions/${other.version_id}/content`, {
      headers: SITE,
    });
    expect(otherRes.status).toBe(403);
  });

  it("study-wide read reaches every site's documents", async () => {
    const { version_id } = await uploadFixture(
      site002,
      new File(["monitor fixture"], "monitor.txt", { type: "text/plain" }),
    );
    const res = await app.request(`/document-versions/${version_id}/content`, {
      headers: MONITOR,
    });
    expect(res.status).toBe(200);
  });

  it("404s an unknown version id", async () => {
    const unknown = await app.request(
      "/document-versions/00000000-0000-4000-8000-000000000000/content",
      { headers: ADMIN },
    );
    expect(unknown.status).toBe(404);
  });
});
