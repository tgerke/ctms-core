import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Return-for-correction (ADR-0015), exercised through the HTTP surface.
 * Fixtures are typed to the test-only 99.99.99 artifact and scoped to a
 * study site so this file's document lineage is isolated from the
 * study-scoped fixtures other test files version-bump. Returns and versions
 * are immutable and cannot be cleaned up by design.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let studySiteId: string;
let fixtureArtifactId: number;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };
const JSON_ADMIN = { ...ADMIN, "Content-Type": "application/json" };

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
});
afterAll(() => sql.end());

async function uploadFixture(): Promise<{ document_id: string; version_id: string }> {
  const form = new FormData();
  form.set(
    "file",
    new File([`return fixture ${Date.now()}-${Math.random()}`], "fixture.pdf", {
      type: "application/pdf",
    }),
  );
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("study_site_id", studySiteId);
  form.set("title", "Return flow fixture");
  const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as { document_id: string; version_id: string };
}

const returnVersion = (versionId: string, headers: Record<string, string>, reason?: string) =>
  app.request(`/document-versions/${versionId}/return`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? "Wrong file — please upload the signed copy." }),
  });

describe("return-for-correction (ADR-0015)", () => {
  it("records the returner, reason, and time, and moves the document to 'returned'", async () => {
    const { document_id, version_id } = await uploadFixture();
    const res = await returnVersion(version_id, ADMIN);
    expect(res.status).toBe(201);
    const { return_id } = (await res.json()) as { return_id: string };

    const [ret] = await sql`
      SELECT reason, returned_by, returned_at FROM document_return WHERE id = ${return_id}`;
    expect(ret!.reason).toContain("signed copy");
    expect(ret!.returned_by).not.toBeNull();
    const [doc] = await sql`SELECT status FROM document WHERE id = ${document_id}`;
    expect(doc!.status).toBe("returned");

    const detail = await app.request(`/documents/${document_id}`, { headers: ADMIN });
    const body = (await detail.json()) as { returns: { reason: string }[] };
    expect(body.returns.length).toBeGreaterThan(0);
    expect(body.returns[0]!.reason).toContain("signed copy");
  });

  it("requires 'approve' permission: the monitor role gets 403", async () => {
    const { version_id } = await uploadFixture();
    const res = await returnVersion(version_id, MONITOR);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("approve");
  });

  it("rejects a blank reason at the schema boundary", async () => {
    const { version_id } = await uploadFixture();
    const res = await returnVersion(version_id, ADMIN, "   ");
    expect(res.status).toBe(400);
  });

  it("a returned version can never be approved", async () => {
    const { version_id } = await uploadFixture();
    expect((await returnVersion(version_id, ADMIN)).status).toBe(201);

    const approve = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: JSON_ADMIN,
      body: JSON.stringify({ meaning: "approval", reauth_token: "dev-admin-token" }),
    });
    expect(approve.status).toBe(409);
    expect(((await approve.json()) as { error: string }).error).toContain("returned");
  });

  it("a corrected version reopens review, and only it can be approved", async () => {
    const { document_id, version_id } = await uploadFixture();
    expect((await returnVersion(version_id, ADMIN)).status).toBe(201);

    // Corrected upload lands on the same document and reopens review.
    const corrected = await uploadFixture();
    expect(corrected.document_id).toBe(document_id);
    const [afterUpload] = await sql`SELECT status FROM document WHERE id = ${document_id}`;
    expect(afterUpload!.status).toBe("pending_review");

    const approve = await app.request(`/document-versions/${corrected.version_id}/sign`, {
      method: "POST",
      headers: JSON_ADMIN,
      body: JSON.stringify({ meaning: "approval", reauth_token: "dev-admin-token" }),
    });
    expect(approve.status).toBe(201);
    const [approved] = await sql`SELECT status FROM document WHERE id = ${document_id}`;
    expect(approved!.status).toBe("effective");
  });

  it("only a pending_review document can be returned", async () => {
    // The previous test left the fixture document effective; returning its
    // latest (approved) version must refuse.
    const [version] = await sql`
      SELECT dv.id FROM document_version dv
      JOIN document d ON d.id = dv.document_id
      WHERE d.tmf_artifact_id = ${fixtureArtifactId}
        AND d.study_site_id = ${studySiteId} AND d.status = 'effective'
      ORDER BY dv.version_number DESC LIMIT 1`;
    expect(version).toBeDefined();
    const res = await returnVersion(version!.id as string, ADMIN);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("pending_review");
  });

  it("only the latest version can be returned", async () => {
    const first = await uploadFixture(); // reopens the effective fixture document
    const second = await uploadFixture(); // version-bumps the same document
    expect(second.document_id).toBe(first.document_id);
    const res = await returnVersion(first.version_id, ADMIN);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("latest");
  });

  it("the return lands in the document's audit trail", async () => {
    const { document_id, version_id } = await uploadFixture();
    expect((await returnVersion(version_id, ADMIN)).status).toBe(201);
    const audit = await app.request(`/documents/${document_id}/audit`, { headers: ADMIN });
    const events = (await audit.json()) as { entity_type: string; action: string }[];
    expect(events.some((e) => e.action === "document_return.insert")).toBe(true);
  });
});
