import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Site-seat log workflows (ADR-0023) through the HTTP surface: the site_staff
 * persona sees exactly its site, writes its own DoA/training facts, and the
 * derived views carry the cross-checks. Log rows accumulate across runs (no
 * cleanup by design), so assertions key on a unique per-run suffix, never on
 * counts.
 */

const { sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let site001: string;
let site002: string;
const person: Record<string, string> = {};

const suffix = `${Date.now()}`.slice(-6);
const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };
const SITE = { Authorization: "Bearer dev-site-token" };

const get = (path: string, headers = SITE) => app.request(path, { headers });
const post = (path: string, body: unknown, headers = SITE) =>
  app.request(path, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const patch = (path: string, body: unknown, headers = SITE) =>
  app.request(path, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  const { db } = createDb();
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;
  const sites = await sql`
    SELECT id, site_number FROM study_site
    WHERE study_id = ${studyId} AND site_number IN ('001', '002')`;
  site001 = sites.find((s) => s.site_number === "001")!.id;
  site002 = sites.find((s) => s.site_number === "002")!.id;
  for (const key of ["kim", "vasquez", "webb"]) {
    const [p] = await sql`
      SELECT id FROM person WHERE email LIKE ${`%.${key}@site001.example`}`;
    person[key] = p!.id;
  }
});
afterAll(() => sql.end());

describe("the site seat is a permission scope (ADR-0023)", () => {
  it("/me names the person and the site-scoped grant", async () => {
    const res = await get("/me");
    expect(res.status).toBe(200);
    const me = (await res.json()) as {
      family_name: string;
      grants: { role: string; study_site_id: string | null }[];
    };
    expect(me.family_name).toBe("Kim");
    expect(me.grants).toHaveLength(1);
    expect(me.grants[0]!.role).toBe("site_staff");
    expect(me.grants[0]!.study_site_id).toBe(site001);
  });

  it("reads its own site: overview, expected documents, enrollment, staff", async () => {
    const overview = await get(`/study-sites/${site001}`);
    expect(overview.status).toBe(200);
    const site = (await overview.json()) as {
      site_number: string;
      protocol_number: string;
      total: number;
    };
    expect(site.site_number).toBe("001");
    expect(site.protocol_number).toBe("CORC-2201");
    expect(site.total).toBeGreaterThan(0);

    const expected = await get(`/study-sites/${site001}/expected-documents`);
    expect(expected.status).toBe(200);
    const rows = (await expected.json()) as { study_site_id: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.study_site_id === site001)).toBe(true);

    expect((await get(`/study-sites/${site001}/enrollment`)).status).toBe(200);
    expect((await get(`/study-sites/${site001}/staff`)).status).toBe(200);
  });

  it("is refused everywhere else — other sites, study-wide reads, the portfolio (§11.10(g))", async () => {
    expect((await get(`/study-sites/${site002}`)).status).toBe(403);
    expect((await get(`/study-sites/${site002}/delegation-log`)).status).toBe(403);
    expect((await get(`/studies/${studyId}/expected-documents`)).status).toBe(403);
    expect((await get(`/studies/${studyId}/document-search?q=protocol`)).status).toBe(403);
    expect((await get(`/studies/${studyId}/review-queue`)).status).toBe(403);
    expect((await get("/portfolio")).status).toBe(403);
    // The unscoped study list stays open to any grant holder (ADR-0008).
    expect((await get("/studies")).status).toBe(200);
  });
});

describe("delegation-of-authority log (ADR-0023)", () => {
  let delegationId: string;
  const task = `chart review ${suffix}`;

  const logFor = async (id: string) => {
    const res = await get(`/study-sites/${site001}/delegation-log`, ADMIN);
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.find((r) => r.delegation_id === id);
  };

  it("site staff records a delegation; the view derives active + PI check", async () => {
    const res = await post(`/study-sites/${site001}/delegation-log`, {
      person_id: person.webb,
      delegated_tasks: [task, "query resolution"],
      start_date: "2026-07-01",
      authorized_by: person.vasquez,
    });
    expect(res.status).toBe(201);
    delegationId = ((await res.json()) as { id: string }).id;

    const row = (await logFor(delegationId)) as {
      status: string;
      authorizer_was_pi: boolean;
      credential_open_items: number;
      delegated_tasks: string[];
    };
    expect(row.status).toBe("active");
    expect(row.authorizer_was_pi).toBe(true);
    expect(row.delegated_tasks).toContain(task);
    // The oversight cross-check: Webb's medical license is expired in the
    // seeded document record, so his delegation carries an open item.
    expect(row.credential_open_items).toBeGreaterThanOrEqual(1);
  });

  it("an authorizer who never held the PI role is flagged, not refused", async () => {
    const res = await post(`/study-sites/${site001}/delegation-log`, {
      person_id: person.kim,
      delegated_tasks: [`temperature log review ${suffix}`],
      start_date: "2026-07-01",
      authorized_by: person.webb, // sub-investigator, not PI
    });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    const row = (await logFor(id)) as { authorizer_was_pi: boolean };
    expect(row.authorizer_was_pi).toBe(false);
  });

  it("refuses self-delegation, empty tasks, and monitor authorship (§11.10(g))", async () => {
    expect(
      (
        await post(`/study-sites/${site001}/delegation-log`, {
          person_id: person.vasquez,
          delegated_tasks: ["x"],
          start_date: "2026-07-01",
          authorized_by: person.vasquez,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(`/study-sites/${site001}/delegation-log`, {
          person_id: person.webb,
          delegated_tasks: [],
          start_date: "2026-07-01",
          authorized_by: person.vasquez,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          `/study-sites/${site001}/delegation-log`,
          {
            person_id: person.webb,
            delegated_tasks: ["x"],
            start_date: "2026-07-01",
            authorized_by: person.vasquez,
          },
          MONITOR,
        )
      ).status,
    ).toBe(403);
  });

  it("ending is a dated fact; ending twice refuses", async () => {
    const res = await patch(`/delegations/${delegationId}`, { end_date: "2026-07-10" });
    expect(res.status).toBe(200);
    const [row] = await sql`SELECT end_date FROM delegation WHERE id = ${delegationId}`;
    expect(row!.end_date).not.toBeNull();
    expect(
      (await patch(`/delegations/${delegationId}`, { end_date: "2026-07-11" })).status,
    ).toBe(404);
    const viewRow = (await logFor(delegationId)) as { status: string };
    expect(viewRow.status).toBe("ended");
  });

  it("log writes land in the audit trail attributed to the site persona", async () => {
    const audit = await get(
      `/audit-events?entity_type=delegation&entity_id=${delegationId}`,
      ADMIN,
    );
    const events = (await audit.json()) as { action: string; actor_label: string }[];
    expect(events.some((e) => e.action === "delegation.insert")).toBe(true);
    expect(events.some((e) => e.action === "delegation.update")).toBe(true);
    expect(events[0]!.actor_label).toContain("Dana Kim");
  });
});

describe("training log (ADR-0023)", () => {
  it("records a completion and derives expiry status", async () => {
    const topic = `Phlebotomy recertification ${suffix}`;
    const res = await post(`/study-sites/${site001}/training-log`, {
      person_id: person.kim,
      topic,
      trained_on: "2024-01-15",
      expires_at: "2026-01-15", // already past: derived 'expired'
    });
    expect(res.status).toBe(201);
    const log = await get(`/study-sites/${site001}/training-log`);
    expect(log.status).toBe(200);
    const rows = (await log.json()) as { topic: string; status: string }[];
    const row = rows.find((r) => r.topic === topic);
    expect(row?.status).toBe("expired");
  });

  it("refuses a blank topic and an expiry before completion", async () => {
    expect(
      (
        await post(`/study-sites/${site001}/training-log`, {
          person_id: person.kim,
          topic: "   ",
          trained_on: "2026-07-01",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(`/study-sites/${site001}/training-log`, {
          person_id: person.kim,
          topic: `backdated ${suffix}`,
          trained_on: "2026-07-01",
          expires_at: "2026-06-01",
        })
      ).status,
    ).toBe(400);
  });

  it("oversight reads the log; the monitor cannot write it", async () => {
    expect((await get(`/study-sites/${site001}/training-log`, MONITOR)).status).toBe(200);
    expect(
      (
        await post(
          `/study-sites/${site001}/training-log`,
          { person_id: person.kim, topic: "x", trained_on: "2026-07-01" },
          MONITOR,
        )
      ).status,
    ).toBe(403);
  });
});
