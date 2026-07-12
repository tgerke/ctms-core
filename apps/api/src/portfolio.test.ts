import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Portfolio rollup (ADR-0021). Assertions pin CORC-2202, the seeded second
 * study no test file mutates, so exact numbers are stable across a suite run;
 * CORC-2201 gets structural checks only (other files add fixtures to it).
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };

beforeAll(() => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
});
afterAll(() => sql.end());

type Entry = Record<string, unknown> & { id: string; protocol_number: string };

const fetchPortfolio = async (headers = ADMIN) => {
  const res = await app.request("/portfolio", { headers });
  expect(res.status).toBe(200);
  return (await res.json()) as Entry[];
};

describe("portfolio (ADR-0021)", () => {
  it("returns one row per study, ordered by protocol number", async () => {
    const rows = await fetchPortfolio();
    const protocols = rows.map((r) => r.protocol_number);
    expect(protocols).toContain("CORC-2201");
    expect(protocols).toContain("CORC-2202");
    expect(protocols).toEqual([...protocols].sort());
  });

  it("rolls up the second study exactly as seeded — studies do not bleed into each other", async () => {
    const rows = await fetchPortfolio();
    const s2 = rows.find((r) => r.protocol_number === "CORC-2202")!;
    expect(s2.site_count).toBe(2);
    expect(s2.active_site_count).toBe(1);
    // 2 study-level rules + IRB × 2 sites + CV × 2 staff = 6 expected;
    // protocol, IB, site-001 IRB, and the PI's CV are filed and current.
    expect(s2.expected_total).toBe(6);
    expect(s2.current_count).toBe(4);
    expect(s2.missing_count).toBe(2);
    expect(s2.enrolled).toBe(3);
    expect(s2.target_enrollment).toBe(14);

    const s1 = rows.find((r) => r.protocol_number === "CORC-2201")!;
    expect(s1.expected_total as number).toBeGreaterThan(s2.expected_total as number);
    expect(s1.site_count as number).toBeGreaterThanOrEqual(4);
  });

  it("is readable with any read-permitting grant", async () => {
    const rows = await fetchPortfolio(MONITOR);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("per-study surfaces stay scoped: 2202's expected documents are only its own", async () => {
    const rows = await fetchPortfolio();
    const s2 = rows.find((r) => r.protocol_number === "CORC-2202")!;
    const res = await app.request(`/studies/${s2.id}/expected-documents`, { headers: ADMIN });
    const expected = (await res.json()) as { study_id: string }[];
    expect(expected.length).toBe(6);
    for (const e of expected) expect(e.study_id).toBe(s2.id);
  });
});
