import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Bulk review (ADR-0026): approving a checkbox selection as one
 * §11.200(a)(1)(i) series of signings, and returning one with a shared
 * reason. Fixtures follow the house convention — the 99.99.99 artifact,
 * per-run bytes, no cleanup (immutable by design).
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let fixtureArtifactId: number;

const RUN = `${Date.now()}`;
const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };
const jsonHeaders = (auth: Record<string, string>) => ({
  ...auth,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;

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

async function upload(label: string) {
  const form = new FormData();
  form.set(
    "file",
    new File([new TextEncoder().encode(`${label} ${RUN}`)], `${label}.pdf`, {
      type: "application/pdf",
    }),
  );
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("title", `Bulk review fixture ${label} ${RUN}`);
  form.set("force_new", "true");
  const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as { document_id: string; version_id: string; sha256: string };
}

const docStatus = async (documentId: string) => {
  const [row] = await sql`SELECT status FROM document WHERE id = ${documentId}`;
  return row!.status as string;
};

describe("bulk approval (ADR-0026)", () => {
  it("one re-authentication opens the series; each version gains its own signature bound to its own hash (§11.200 §11.70)", async () => {
    const a = await upload("series-a");
    const b = await upload("series-b");
    const c = await upload("series-c");

    const res = await app.request("/document-versions/bulk-approve", {
      method: "POST",
      headers: jsonHeaders(ADMIN),
      body: JSON.stringify({
        version_ids: [a.version_id, b.version_id, c.version_id],
        reauth_token: "dev-admin-token",
      }),
    });
    expect(res.status).toBe(201);
    const { signed } = (await res.json()) as {
      signed: { version_id: string; signature_id: string; signed_sha256: string }[];
    };
    expect(signed).toHaveLength(3);

    // §11.70: each signature carries the content hash of ITS version, not a
    // batch hash — the binding survives the series.
    const bySha = new Map([
      [a.version_id, a.sha256],
      [b.version_id, b.sha256],
      [c.version_id, c.sha256],
    ]);
    for (const s of signed) expect(s.signed_sha256).toBe(bySha.get(s.version_id));

    // every signature row recorded its §11.200 re-authentication
    const rows = await sql`
      SELECT reauth_method, reauth_at FROM signature
      WHERE id IN ${sql(signed.map((s) => s.signature_id))}`;
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.reauth_method).toBe("dev_token");

    // the series behaves like three approvals: c supersedes b supersedes a
    // (same artifact + scope), the last one standing effective
    expect(await docStatus(c.document_id)).toBe("effective");
    expect(await docStatus(a.document_id)).toBe("superseded");
    expect(await docStatus(b.document_id)).toBe("superseded");
  });

  it("refuses the whole selection with every blocker listed, signing nothing", async () => {
    const good = await upload("blocker-good");
    const returned = await upload("blocker-returned");
    const stale = await upload("blocker-stale");

    // make one returned…
    const ret = await app.request(`/document-versions/${returned.version_id}/return`, {
      method: "POST",
      headers: jsonHeaders(ADMIN),
      body: JSON.stringify({ reason: "fixture: wrong file" }),
    });
    expect(ret.status).toBe(201);
    // …and one not-latest (a corrected second version)
    const v2 = new FormData();
    v2.set("file", new File([new TextEncoder().encode(`stale v2 ${RUN}`)], "stale-v2.pdf", {
      type: "application/pdf",
    }));
    const staleV2 = await app.request(`/documents/${stale.document_id}/versions`, {
      method: "POST",
      headers: ADMIN,
      body: v2,
    });
    expect(staleV2.status).toBe(201);

    const res = await app.request("/document-versions/bulk-approve", {
      method: "POST",
      headers: jsonHeaders(ADMIN),
      body: JSON.stringify({
        version_ids: [good.version_id, returned.version_id, stale.version_id],
        reauth_token: "dev-admin-token",
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { problems: string[] };
    expect(body.problems.join("\n")).toMatch(/status: returned/);
    expect(body.problems.join("\n")).toMatch(/not the latest version/);
    expect(body.problems.join("\n")).toMatch(/returned for correction and can never be approved/);

    // all-or-nothing: the clean document was not signed
    expect(await docStatus(good.document_id)).toBe("pending_review");
    const sigs = await sql`
      SELECT id FROM signature WHERE document_version_id = ${good.version_id}`;
    expect(sigs).toHaveLength(0);
  });

  it("requires approve authority (a monitor holds sign, not approve)", async () => {
    const doc = await upload("authz");
    const res = await app.request("/document-versions/bulk-approve", {
      method: "POST",
      headers: jsonHeaders(MONITOR),
      body: JSON.stringify({
        version_ids: [doc.version_id],
        reauth_token: "dev-monitor-token",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses the series without valid re-authentication (§11.200)", async () => {
    const doc = await upload("reauth");
    const res = await app.request("/document-versions/bulk-approve", {
      method: "POST",
      headers: jsonHeaders(ADMIN),
      body: JSON.stringify({
        version_ids: [doc.version_id],
        reauth_token: "not-the-credential",
      }),
    });
    expect(res.status).toBe(403);
    expect(await docStatus(doc.document_id)).toBe("pending_review");
  });
});

describe("bulk return (ADR-0026 over ADR-0015)", () => {
  it("returns the selection with one shared immutable reason", async () => {
    const a = await upload("return-a");
    const b = await upload("return-b");
    const res = await app.request("/document-versions/bulk-return", {
      method: "POST",
      headers: jsonHeaders(ADMIN),
      body: JSON.stringify({
        version_ids: [a.version_id, b.version_id],
        reason: `fixture: partner batch refiled ${RUN}`,
      }),
    });
    expect(res.status).toBe(201);
    const { returned } = (await res.json()) as { returned: { return_id: string }[] };
    expect(returned).toHaveLength(2);

    expect(await docStatus(a.document_id)).toBe("returned");
    expect(await docStatus(b.document_id)).toBe("returned");
    const reasons = await sql`
      SELECT reason FROM document_return
      WHERE document_version_id IN ${sql([a.version_id, b.version_id])}`;
    expect(reasons.map((r) => r.reason)).toEqual([
      `fixture: partner batch refiled ${RUN}`,
      `fixture: partner batch refiled ${RUN}`,
    ]);
  });

  it("refuses an empty reason", async () => {
    const doc = await upload("return-empty");
    const res = await app.request("/document-versions/bulk-return", {
      method: "POST",
      headers: jsonHeaders(ADMIN),
      body: JSON.stringify({ version_ids: [doc.version_id], reason: "   " }),
    });
    expect(res.status).toBe(409);
    expect(await docStatus(doc.document_id)).toBe("pending_review");
  });
});
