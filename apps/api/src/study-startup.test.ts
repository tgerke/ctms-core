import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Study creation and guided startup (ADR-0034), exercised through the HTTP
 * surface. Each run creates brand-new studies (unique suffix) that persist
 * until the next re-seed; CORC-2201 serves as the clone template because the
 * seed authored its requirement rules.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let templateStudyId: string;
let sponsorOrgId: string;

const suffix = `${Date.now()}`.slice(-6);
const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };
const SITE = { Authorization: "Bearer dev-site-token" };
const AUDITOR = { Authorization: "Bearer dev-auditor-token" };

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

const startupOf = async (studyId: string) => {
  const res = await app.request(`/studies/${studyId}/startup`, { headers: ADMIN });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    status: string;
    site_count: number;
    pending_site_count: number;
    sites_without_pi_count: number;
    rule_count: number;
    unsynced_expected_count: number;
    expected_total: number;
    missing_count: number;
    milestone_count: number;
    pending_sites: { study_site_id: string }[];
    sites_without_pi: { study_site_id: string }[];
  };
};

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id, sponsor_org_id FROM study WHERE protocol_number = 'CORC-2201'`;
  templateStudyId = study!.id;
  sponsorOrgId = study!.sponsor_org_id;
});
afterAll(() => sql.end());

describe("study creation (ADR-0034)", () => {
  let createdStudyId: string;

  it("creates a study in planning with template rules cloned and expected documents materialized", async () => {
    const res = await post("/studies", {
      protocol_number: `TPL-${suffix}`,
      title: `Template clone test ${suffix}`,
      phase: "II",
      sponsor_org_id: sponsorOrgId,
      template_study_id: templateStudyId,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      cloned_rules: number;
      expected_created: number;
    };
    createdStudyId = body.id;

    const templateRules = await sql`
      SELECT tmf_artifact_id, scope_level, name, applies_to_roles,
             validity_months, requires_signature
      FROM requirement_rule WHERE study_id = ${templateStudyId}
      ORDER BY tmf_artifact_id, scope_level, name`;
    const clonedRules = await sql`
      SELECT tmf_artifact_id, scope_level, name, applies_to_roles,
             validity_months, requires_signature
      FROM requirement_rule WHERE study_id = ${createdStudyId}
      ORDER BY tmf_artifact_id, scope_level, name`;
    expect(body.cloned_rules).toBe(templateRules.length);
    expect(clonedRules.length).toBe(templateRules.length);
    expect(clonedRules).toEqual(templateRules);

    // Study-scope placeholders materialized in the same transaction; site- and
    // person-scoped rules wait for sites and staff, so nothing else exists yet.
    const [study] = await sql`SELECT status FROM study WHERE id = ${createdStudyId}`;
    expect(study!.status).toBe("planning");
    const studyScopeRules = templateRules.filter((r) => r.scope_level === "study");
    expect(body.expected_created).toBe(studyScopeRules.length);
    const statuses = await sql`
      SELECT status FROM v_expected_document_status WHERE study_id = ${createdStudyId}`;
    expect(statuses.length).toBe(studyScopeRules.length);
    expect(statuses.every((s) => s.status === "missing")).toBe(true);
  });

  it("attributes study creation to the actor in the audit trail (§11.10(e))", async () => {
    const events = await sql`
      SELECT action, actor_label FROM audit_event
      WHERE entity_type = 'study' AND entity_id = ${createdStudyId}`;
    expect(events.some((e) => e.action === "study.insert")).toBe(true);
    expect(events[0]!.actor_label).toContain("Nora Feld");
  });

  it("refuses creation to monitor, site, and auditor seats (§11.10(g))", async () => {
    const body = {
      protocol_number: `DENY-${suffix}`,
      title: "should not exist",
      sponsor_org_id: sponsorOrgId,
    };
    expect((await post("/studies", body, MONITOR)).status).toBe(403);
    expect((await post("/studies", body, SITE)).status).toBe(403);
    expect((await post("/studies", body, AUDITOR)).status).toBe(403);
    const rows = await sql`SELECT id FROM study WHERE protocol_number = ${`DENY-${suffix}`}`;
    expect(rows.length).toBe(0);
  });

  it("rejects a duplicate protocol number", async () => {
    const res = await post("/studies", {
      protocol_number: "CORC-2201",
      title: "duplicate",
      sponsor_org_id: sponsorOrgId,
    });
    expect(res.status).toBe(409);
  });

  it("rejects an unknown template study and an unknown sponsor", async () => {
    const ghost = "00000000-0000-0000-0000-000000000000";
    expect(
      (
        await post("/studies", {
          protocol_number: `TPLX-${suffix}`,
          title: "x",
          sponsor_org_id: sponsorOrgId,
          template_study_id: ghost,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("/studies", {
          protocol_number: `TPLX-${suffix}`,
          title: "x",
          sponsor_org_id: ghost,
        })
      ).status,
    ).toBe(400);
  });
});

describe("guided startup (ADR-0034)", () => {
  let studyId: string;
  let studySiteId: string;

  beforeAll(async () => {
    const res = await post("/studies", {
      protocol_number: `SUP-${suffix}`,
      title: `Startup checklist test ${suffix}`,
      sponsor_org_id: sponsorOrgId,
    });
    expect(res.status).toBe(201);
    studyId = ((await res.json()) as { id: string }).id;
  });

  it("derives the startup checklist from facts, never state", async () => {
    let s = await startupOf(studyId);
    expect(s.status).toBe("planning");
    expect(s.site_count).toBe(0);
    expect(s.rule_count).toBe(0);
    expect(s.expected_total).toBe(0);
    expect(s.milestone_count).toBe(0);

    // Adding a site surfaces it as pending and PI-less — no flag was set.
    const orgRes = await post("/organizations", {
      name: `Startup Org ${suffix}`,
      kind: "site_org",
    });
    const orgId = ((await orgRes.json()) as { id: string }).id;
    const siteRes = await post("/sites", {
      organization_id: orgId,
      name: `Startup Site ${suffix}`,
    });
    const siteId = ((await siteRes.json()) as { id: string }).id;
    const ssRes = await post(`/studies/${studyId}/sites`, {
      site_id: siteId,
      site_number: `8${suffix.slice(-3)}`,
    });
    expect(ssRes.status).toBe(201);
    studySiteId = ((await ssRes.json()) as { id: string }).id;

    s = await startupOf(studyId);
    expect(s.pending_site_count).toBe(1);
    expect(s.pending_sites.map((x) => x.study_site_id)).toContain(studySiteId);
    expect(s.sites_without_pi.map((x) => x.study_site_id)).toContain(studySiteId);

    // Assigning a PI drops the site off the no-PI list.
    const personRes = await post("/people", {
      given_name: "Startup",
      family_name: `PI${suffix}`,
      email: `startup.pi.${suffix}@test.example`,
    });
    const personId = ((await personRes.json()) as { id: string }).id;
    const roleRes = await post(`/study-sites/${studySiteId}/roles`, {
      person_id: personId,
      role: "principal_investigator",
      start_date: "2026-07-30",
    });
    expect(roleRes.status).toBe(201);
    s = await startupOf(studyId);
    expect(s.sites_without_pi_count).toBe(0);

    // A new site-scoped rule is visibly unsynced until the sync runs.
    const [artifact] = await sql`SELECT id FROM tmf_artifact ORDER BY code LIMIT 1`;
    const ruleRes = await post(`/studies/${studyId}/requirement-rules`, {
      tmf_artifact_id: artifact!.id,
      scope_level: "study_site",
      name: `Startup rule ${suffix}`,
    });
    expect(ruleRes.status).toBe(201);
    s = await startupOf(studyId);
    expect(s.rule_count).toBe(1);
    expect(s.unsynced_expected_count).toBe(1);

    const sync = await app.request(`/studies/${studyId}/sync-expected-documents`, {
      method: "POST",
      headers: ADMIN,
    });
    expect(sync.status).toBe(200);
    s = await startupOf(studyId);
    expect(s.unsynced_expected_count).toBe(0);
    expect(s.expected_total).toBe(1);
    expect(s.missing_count).toBe(1);
  });

  it("enforces forward-only status transitions", async () => {
    expect((await patch(`/studies/${studyId}`, { title: `Renamed ${suffix}`, phase: "III" })).status).toBe(200);
    expect((await patch(`/studies/${studyId}`, { status: "active" })).status).toBe(200);
    expect((await patch(`/studies/${studyId}`, { status: "planning" })).status).toBe(400);
    const [row] = await sql`SELECT title, phase, status FROM study WHERE id = ${studyId}`;
    expect(row!.title).toBe(`Renamed ${suffix}`);
    expect(row!.phase).toBe("III");
    expect(row!.status).toBe("active");
  });

  it("study updates take administer for that study (§11.10(g))", async () => {
    expect((await patch(`/studies/${studyId}`, { title: "nope" }, MONITOR)).status).toBe(403);
    expect((await patch(`/studies/${studyId}`, { title: "nope" }, AUDITOR)).status).toBe(403);
  });
});
