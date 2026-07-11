import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Study/site/staff administration and expected-document waivers (ADR-0016),
 * exercised through the HTTP surface. Each run onboards a brand-new org,
 * site, and person (unique suffix), so its expected-document lineage is
 * isolated from the seeded demo sites; admin rows persist until the next
 * re-seed, like every other test fixture.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let fixtureArtifactId: number;

const suffix = `${Date.now()}`.slice(-6);
const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };

const post = (path: string, body: unknown, headers = ADMIN) =>
  app.request(path, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const patch = (path: string, body: unknown, headers = ADMIN) =>
  app.request(path, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study LIMIT 1`;
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

describe("site onboarding (ADR-0016)", () => {
  let orgId: string;
  let siteId: string;
  let studySiteId: string;
  let personId: string;

  it("onboards a site end to end: org → site → study-site → activate → staff → sync", async () => {
    const orgRes = await post("/organizations", {
      name: `Test Org ${suffix}`,
      kind: "site_org",
    });
    expect(orgRes.status).toBe(201);
    orgId = ((await orgRes.json()) as { id: string }).id;

    const siteRes = await post("/sites", {
      organization_id: orgId,
      name: `Test Site ${suffix}`,
      city: "Testville",
      state: "OR",
    });
    expect(siteRes.status).toBe(201);
    siteId = ((await siteRes.json()) as { id: string }).id;

    const ssRes = await post(`/studies/${studyId}/sites`, {
      site_id: siteId,
      site_number: `9${suffix.slice(-3)}`,
    });
    expect(ssRes.status).toBe(201);
    studySiteId = ((await ssRes.json()) as { id: string }).id;

    const activate = await patch(`/study-sites/${studySiteId}`, {
      status: "active",
      activated_at: "2026-07-11",
    });
    expect(activate.status).toBe(200);
    const [ss] = await sql`SELECT status, activated_at FROM study_site WHERE id = ${studySiteId}`;
    expect(ss!.status).toBe("active");

    const personRes = await post("/people", {
      given_name: "Test",
      family_name: `Investigator${suffix}`,
      email: `pi.${suffix}@test.example`,
      credentials: "MD",
    });
    expect(personRes.status).toBe(201);
    personId = ((await personRes.json()) as { id: string }).id;

    const roleRes = await post(`/study-sites/${studySiteId}/roles`, {
      person_id: personId,
      role: "principal_investigator",
      start_date: "2026-07-11",
    });
    expect(roleRes.status).toBe(201);

    const sync = await app.request(`/studies/${studyId}/sync-expected-documents`, {
      method: "POST",
      headers: ADMIN,
    });
    expect(sync.status).toBe(200);
    expect(((await sync.json()) as { inserted: number }).inserted).toBeGreaterThan(0);

    // Site-scoped and person-scoped requirements materialized as missing.
    const expected = await app.request(
      `/studies/${studyId}/expected-documents?study_site_id=${studySiteId}`,
      { headers: ADMIN },
    );
    const rows = (await expected.json()) as {
      scope_level: string;
      person_id: string | null;
      status: string;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
    expect(rows.some((r) => r.scope_level === "study_site")).toBe(true);
    expect(rows.some((r) => r.person_id === personId)).toBe(true);
  });

  it("duplicate site number on the study is refused", async () => {
    const res = await post(`/studies/${studyId}/sites`, {
      site_id: siteId,
      site_number: "001",
    });
    expect(res.status).toBe(409);
  });

  it("ending a role is a dated fact, not a delete", async () => {
    const [role] = await sql`
      SELECT id FROM study_site_role
      WHERE study_site_id = ${studySiteId} AND person_id = ${personId}`;
    const res = await patch(`/study-site-roles/${role!.id}`, { end_date: "2026-07-11" });
    expect(res.status).toBe(200);
    const [after] = await sql`SELECT end_date FROM study_site_role WHERE id = ${role!.id}`;
    expect(after!.end_date).not.toBeNull();
  });

  it("admin mutations are attributed in the audit trail", async () => {
    const audit = await app.request(
      `/audit-events?entity_type=organization&entity_id=${orgId}`,
      { headers: ADMIN },
    );
    const events = (await audit.json()) as { action: string; actor_label: string }[];
    expect(events.some((e) => e.action === "organization.insert")).toBe(true);
    expect(events[0]!.actor_label).toContain("Nora Feld");
  });

  it("the monitor role gets 403 on every admin mutation", async () => {
    expect((await post("/organizations", { name: "x", kind: "cro" }, MONITOR)).status).toBe(403);
    expect((await post("/people", { given_name: "a", family_name: "b", email: "x@y.example" }, MONITOR)).status).toBe(403);
    expect(
      (await post(`/studies/${studyId}/sites`, { site_id: siteId, site_number: "998" }, MONITOR)).status,
    ).toBe(403);
    expect((await patch(`/study-sites/${studySiteId}`, { status: "closed" }, MONITOR)).status).toBe(403);
    expect(
      (await post("/access-grants", { person_id: personId, role: "read_only" }, MONITOR)).status,
    ).toBe(403);
    expect(
      (await post(`/studies/${studyId}/requirement-rules`, { tmf_artifact_id: fixtureArtifactId, scope_level: "study", name: "x" }, MONITOR)).status,
    ).toBe(403);
  });

  it("grants and revokes access; revocation is a fact, revoking twice refuses", async () => {
    const grantRes = await post("/access-grants", {
      person_id: personId,
      role: "read_only",
      study_id: studyId,
    });
    expect(grantRes.status).toBe(201);
    const grantId = ((await grantRes.json()) as { id: string }).id;

    const people = await app.request("/people", { headers: ADMIN });
    const person = ((await people.json()) as { id: string; grants: { grant_id: string }[] }[]).find(
      (p) => p.id === personId,
    );
    expect(person!.grants.some((g) => g.grant_id === grantId)).toBe(true);

    expect((await post(`/access-grants/${grantId}/revoke`, {})).status).toBe(200);
    const [row] = await sql`SELECT revoked_at FROM access_grant WHERE id = ${grantId}`;
    expect(row!.revoked_at).not.toBeNull();
    expect((await post(`/access-grants/${grantId}/revoke`, {})).status).toBe(404);
  });

  it("creates and updates a requirement rule, and sync materializes it", async () => {
    const ruleRes = await post(`/studies/${studyId}/requirement-rules`, {
      tmf_artifact_id: fixtureArtifactId,
      scope_level: "study",
      name: `Test rule ${suffix}`,
    });
    expect(ruleRes.status).toBe(201);
    const ruleId = ((await ruleRes.json()) as { id: string }).id;

    expect((await patch(`/requirement-rules/${ruleId}`, { validity_months: 12 })).status).toBe(200);
    const rules = await app.request(`/studies/${studyId}/requirement-rules`, { headers: ADMIN });
    const rule = ((await rules.json()) as { id: string; validity_months: number | null }[]).find(
      (r) => r.id === ruleId,
    );
    expect(rule!.validity_months).toBe(12);

    await app.request(`/studies/${studyId}/sync-expected-documents`, {
      method: "POST",
      headers: ADMIN,
    });
    const [ed] = await sql`
      SELECT id FROM expected_document WHERE rule_id = ${ruleId}`;
    expect(ed).toBeDefined();
  });
});

describe("expected-document waivers (ADR-0016)", () => {
  let expectedDocumentId: string;
  let siteScopedRow: { expected_document_id: string; tmf_artifact_id: number; study_site_id: string };

  beforeAll(async () => {
    // The onboarding describe above ran first (file order); grab two missing
    // site-scoped expected documents from the test site it created.
    const [ss] = await sql`
      SELECT ss.id FROM study_site ss
      JOIN site si ON si.id = ss.site_id
      WHERE si.name = ${"Test Site " + suffix}`;
    const expected = await app.request(
      `/studies/${studyId}/expected-documents?study_site_id=${ss!.id}&status=missing`,
      { headers: ADMIN },
    );
    const rows = (await expected.json()) as {
      expected_document_id: string;
      scope_level: string;
      tmf_artifact_id: number;
      study_site_id: string;
    }[];
    const siteRows = rows.filter((r) => r.scope_level === "study_site");
    expect(siteRows.length).toBeGreaterThanOrEqual(2);
    expectedDocumentId = siteRows[0]!.expected_document_id;
    siteScopedRow = siteRows[1]!;
  });

  const waive = (id: string, reason: string, headers = ADMIN) =>
    post(`/expected-documents/${id}/waive`, { reason }, headers);
  const revoke = (id: string, reason: string) =>
    post(`/expected-documents/${id}/revoke-waiver`, { reason });

  const statusOf = async (id: string) => {
    const [row] = await sql`
      SELECT status, waiver_reason FROM v_expected_document_status
      WHERE expected_document_id = ${id}`;
    return row as { status: string; waiver_reason: string | null } | undefined;
  };

  it("waiving turns 'missing' into 'waived' with the reason on the view", async () => {
    const res = await waive(expectedDocumentId, "Central IRB — local approval not applicable.");
    expect(res.status).toBe(201);
    const row = await statusOf(expectedDocumentId);
    expect(row!.status).toBe("waived");
    expect(row!.waiver_reason).toContain("Central IRB");
  });

  it("waived items leave the completeness denominator", async () => {
    const [c] = await sql`
      SELECT total, waived_count, missing_count, pct_current
      FROM v_study_site_completeness
      WHERE study_site_id = ${siteScopedRow.study_site_id}`;
    expect(Number(c!.waived_count)).toBeGreaterThanOrEqual(1);
    // Denominator excludes waived rows: with everything else missing the
    // percentage stays 0 but total keeps counting the waived row.
    expect(Number(c!.total)).toBeGreaterThan(Number(c!.missing_count));
  });

  it("a second active waiver is refused; a blank reason is a 400", async () => {
    expect((await waive(expectedDocumentId, "again")).status).toBe(409);
    expect((await waive(siteScopedRow.expected_document_id, "   ")).status).toBe(400);
  });

  it("the monitor role cannot waive", async () => {
    expect(
      (await waive(siteScopedRow.expected_document_id, "not allowed", MONITOR)).status,
    ).toBe(403);
  });

  it("a filed document beats the waiver", async () => {
    expect(
      (await waive(siteScopedRow.expected_document_id, "Not applicable at this site.")).status,
    ).toBe(201);
    const form = new FormData();
    form.set("file", new File([`waiver fixture ${suffix}`], "f.pdf", { type: "application/pdf" }));
    form.set("tmf_artifact_id", String(siteScopedRow.tmf_artifact_id));
    form.set("study_id", studyId);
    form.set("study_site_id", siteScopedRow.study_site_id);
    form.set("title", "Uploaded despite waiver");
    const upload = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
    expect(upload.status).toBe(201);
    const row = await statusOf(siteScopedRow.expected_document_id);
    expect(row!.status).toBe("pending_review");
  });

  it("lifting the waiver restores 'missing' and keeps the history", async () => {
    const res = await revoke(expectedDocumentId, "Site switched to a local IRB.");
    expect(res.status).toBe(200);
    const row = await statusOf(expectedDocumentId);
    expect(row!.status).toBe("missing");
    const [w] = await sql`
      SELECT revoked_by, revoke_reason FROM expected_document_waiver
      WHERE expected_document_id = ${expectedDocumentId}`;
    expect(w!.revoked_by).not.toBeNull();
    expect(w!.revoke_reason).toContain("local IRB");
    expect((await revoke(expectedDocumentId, "again")).status).toBe(409);
  });

  it("waiver facts land in the audit trail", async () => {
    const audit = await app.request(
      `/audit-events?entity_type=expected_document_waiver`,
      { headers: ADMIN },
    );
    const events = (await audit.json()) as { action: string }[];
    expect(events.some((e) => e.action === "expected_document_waiver.insert")).toBe(true);
    expect(events.some((e) => e.action === "expected_document_waiver.update")).toBe(true);
  });
});
