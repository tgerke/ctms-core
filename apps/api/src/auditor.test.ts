import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Auditor UX (ADR-0028) through the HTTP surface: the binder read serves the
 * reference model's own hierarchy from the same derived views as every other
 * surface, and the auditor's seat — one unscoped read_only grant — reads the
 * whole single-tenant record while every mutation answers 403. Fixtures use a
 * dedicated test-only artifact (99.99.97); immutable rows accumulate by design.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let site002: string;
let fixtureArtifactId: number;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const SITE = { Authorization: "Bearer dev-site-token" }; // scoped to site 001
const AUDITOR = { Authorization: "Bearer dev-auditor-token" };

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;
  const [site] = await sql`
    SELECT id FROM study_site WHERE study_id = ${studyId} AND site_number = '002'`;
  site002 = site!.id;

  await sql`SELECT set_config('ctms.actor_label', 'vitest', false)`;
  const [zone] = await sql`
    INSERT INTO tmf_zone (number, name) VALUES (99, 'Test Fixtures')
    ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [section] = await sql`
    INSERT INTO tmf_section (zone_id, code, name) VALUES (${zone!.id}, '99.99', 'Test')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [artifact] = await sql`
    INSERT INTO tmf_artifact (section_id, code, name)
    VALUES (${section!.id}, '99.99.97', 'Auditor Fixture')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  fixtureArtifactId = artifact!.id;
});
afterAll(() => sql.end());

interface BinderArtifact {
  tmf_artifact_id: number;
  artifact_code: string;
  artifact_name: string;
  expected_total: number;
  missing_count: number;
  waived_count: number;
  documents: { document_id: string; title: string; status: string; version_count: number }[];
}
interface BinderZone {
  zone_number: number;
  zone_name: string;
  sections: { section_code: string; section_name: string; artifacts: BinderArtifact[] }[];
}

const binderArtifacts = (zones: BinderZone[]): BinderArtifact[] =>
  zones.flatMap((z) => z.sections).flatMap((s) => s.artifacts);

async function uploadFixture(body: string): Promise<{ version_id: string; sha256: string }> {
  const form = new FormData();
  form.set("file", new File([body], "auditor-fixture.txt", { type: "text/plain" }));
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("study_site_id", site002);
  form.set("title", "Auditor fixture");
  form.set("force_new", "true");
  const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as { version_id: string; sha256: string };
}

describe("GET /studies/{id}/binder (ADR-0028)", () => {
  it("serves the taxonomy in reference-model order with filed documents attached", async () => {
    const { version_id } = await uploadFixture(`binder fixture ${Date.now()}`);
    expect(version_id).toBeTruthy();

    const res = await app.request(`/studies/${studyId}/binder`, { headers: ADMIN });
    expect(res.status).toBe(200);
    const zones = (await res.json()) as BinderZone[];
    expect(zones.length).toBeGreaterThan(0);

    // Zones ascend by number; artifacts ascend by code within each section.
    const numbers = zones.map((z) => z.zone_number);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    for (const zone of zones) {
      for (const section of zone.sections) {
        const codes = section.artifacts.map((a) => a.artifact_code);
        expect([...codes].sort()).toEqual(codes);
      }
    }

    // The fixture just filed shows under its artifact with version and status.
    const fixture = binderArtifacts(zones).find((a) => a.artifact_code === "99.99.97");
    expect(fixture).toBeDefined();
    const doc = fixture!.documents.find((d) => d.title === "Auditor fixture");
    expect(doc).toBeDefined();
    expect(doc!.status).toBe("pending_review");
    expect(doc!.version_count).toBeGreaterThanOrEqual(1);
  });

  it("rolls up expected-document status per artifact from the same view", async () => {
    const binder = (await (
      await app.request(`/studies/${studyId}/binder`, { headers: ADMIN })
    ).json()) as BinderZone[];
    const expected = (await (
      await app.request(`/studies/${studyId}/expected-documents`, { headers: ADMIN })
    ).json()) as { tmf_artifact_id: number; status: string }[];

    const totals = binderArtifacts(binder);
    expect(totals.reduce((n, a) => n + a.expected_total, 0)).toBe(expected.length);
    expect(totals.reduce((n, a) => n + a.missing_count, 0)).toBe(
      expected.filter((e) => e.status === "missing").length,
    );
    expect(totals.reduce((n, a) => n + a.waived_count, 0)).toBe(
      expected.filter((e) => e.status === "waived").length,
    );
  });

  it("is a study-scoped read: the site seat gets 403", async () => {
    const res = await app.request(`/studies/${studyId}/binder`, { headers: SITE });
    expect(res.status).toBe(403);
  });
});

describe("the auditor's seat: unscoped read_only (ADR-0028)", () => {
  it("/me names the person and the single unscoped read_only grant", async () => {
    const res = await app.request("/me", { headers: AUDITOR });
    expect(res.status).toBe(200);
    const me = (await res.json()) as {
      family_name: string;
      grants: { role: string; study_id: string | null; study_site_id: string | null }[];
    };
    expect(me.family_name).toBe("Ostrow");
    expect(me.grants).toHaveLength(1);
    expect(me.grants[0]).toMatchObject({ role: "read_only", study_id: null, study_site_id: null });
  });

  it("reads the whole record: studies, binder, portfolio, audit trail, chain, bytes", async () => {
    const { version_id, sha256 } = await uploadFixture(`auditor read ${Date.now()}`);

    for (const path of [
      "/studies",
      `/studies/${studyId}/binder`,
      `/studies/${studyId}/expected-documents`,
      "/portfolio",
      "/audit-events",
      "/people",
    ]) {
      const res = await app.request(path, { headers: AUDITOR });
      expect(res.status, path).toBe(200);
    }

    const chain = await app.request("/audit-chain/verify", { headers: AUDITOR });
    expect(chain.status).toBe(200);
    expect(((await chain.json()) as { valid: boolean }).valid).toBe(true);

    // The bytes a signature would bind to are readable, hash included —
    // what the web's in-browser verification (§11.70) fetches.
    const content = await app.request(`/document-versions/${version_id}/content`, {
      headers: AUDITOR,
    });
    expect(content.status).toBe(200);
    expect(content.headers.get("x-content-sha256")).toBe(sha256);
  });

  it("cannot change anything (§11.10(g)): upload, sign, bulk-approve, grant, sync all 403", async () => {
    const { version_id } = await uploadFixture(`auditor deny ${Date.now()}`);
    const json = (body: unknown) => ({
      method: "POST",
      headers: { ...AUDITOR, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const form = new FormData();
    form.set("file", new File(["denied"], "denied.txt", { type: "text/plain" }));
    form.set("tmf_artifact_id", String(fixtureArtifactId));
    form.set("study_id", studyId);
    form.set("title", "Denied upload");
    const upload = await app.request("/documents", {
      method: "POST",
      headers: AUDITOR,
      body: form,
    });
    expect(upload.status).toBe(403);

    const attempts: [string, RequestInit][] = [
      [
        `/document-versions/${version_id}/sign`,
        json({ meaning: "approval", reauth_token: "dev-auditor-token" }),
      ],
      [`/document-versions/${version_id}/return`, json({ reason: "denied" })],
      [
        `/document-versions/bulk-approve`,
        json({ version_ids: [version_id], reauth_token: "dev-auditor-token" }),
      ],
      [
        "/access-grants",
        json({ person_id: "00000000-0000-4000-8000-000000000000", role: "admin" }),
      ],
      [`/studies/${studyId}/sync-expected-documents`, { method: "POST", headers: AUDITOR }],
    ];
    for (const [path, init] of attempts) {
      const res = await app.request(path, init);
      expect(res.status, path).toBe(403);
    }
  });
});
