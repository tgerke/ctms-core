import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Screening log and entry-level e-signatures (ADR-0036) through the HTTP
 * surface. Log rows and signatures accumulate across runs (no cleanup by
 * design), so assertions key on per-run unique screening numbers and on
 * entries this run creates, never on counts of pre-existing rows.
 */

const { sql } = createDb();
let app: ReturnType<typeof buildApp>;
let site001: string;
let site002: string;
const person: Record<string, string> = {};

const suffix = `${Date.now()}`.slice(-6);
const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };
const SITE = { Authorization: "Bearer dev-site-token" };
const AUDITOR = { Authorization: "Bearer dev-auditor-token" };

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

interface LogSig {
  signature_id: string;
  signer_given_name: string;
  signer_family_name: string;
  meaning: string;
  signed_at: string;
  signed_sha256: string;
  facts_match: boolean;
}

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  const { db } = createDb();
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  const sites = await sql`
    SELECT id, site_number FROM study_site
    WHERE study_id = ${study!.id} AND site_number IN ('001', '002')`;
  site001 = sites.find((s) => s.site_number === "001")!.id;
  site002 = sites.find((s) => s.site_number === "002")!.id;
  for (const key of ["kim", "vasquez", "webb"]) {
    const [p] = await sql`
      SELECT id FROM person WHERE email LIKE ${`%.${key}@site001.example`}`;
    person[key] = p!.id;
  }
});
afterAll(() => sql.end());

describe("screening log (ADR-0036)", () => {
  const number = (n: string) => `${n}-${suffix}`;
  let entryId: string;

  const rowFor = async (num: string) => {
    const res = await get(`/study-sites/${site001}/screening-log`);
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.find((r) => r.screening_number === num);
  };

  it("site staff records a screening; the view derives in_screening", async () => {
    const res = await post(`/study-sites/${site001}/screening-log`, {
      screening_number: number("SL-A"),
      screened_on: "2026-07-20",
    });
    expect(res.status).toBe(201);
    entryId = ((await res.json()) as { id: string }).id;
    const row = (await rowFor(number("SL-A"))) as { status: string };
    expect(row.status).toBe("in_screening");
  });

  it("records the enrolled outcome once; a second outcome refuses", async () => {
    const res = await patch(`/screening-entries/${entryId}`, {
      enrolled_on: "2026-07-28",
    });
    expect(res.status).toBe(200);
    const row = (await rowFor(number("SL-A"))) as { status: string; enrolled_on: string };
    expect(row.status).toBe("enrolled");
    expect(row.enrolled_on).toBe("2026-07-28");
    expect(
      (
        await patch(`/screening-entries/${entryId}`, {
          screen_failed_on: "2026-07-29",
          failure_reason: "x",
        })
      ).status,
    ).toBe(404);
  });

  it("a screen failure requires its documented reason", async () => {
    const res = await post(`/study-sites/${site001}/screening-log`, {
      screening_number: number("SL-B"),
      screened_on: "2026-07-21",
    });
    const id = ((await res.json()) as { id: string }).id;
    expect(
      (await patch(`/screening-entries/${id}`, { screen_failed_on: "2026-07-25" })).status,
    ).toBe(400);
    expect(
      (
        await patch(`/screening-entries/${id}`, {
          screen_failed_on: "2026-07-25",
          failure_reason: "Inclusion criterion 2 not met",
        })
      ).status,
    ).toBe(200);
    const row = (await rowFor(number("SL-B"))) as { status: string; failure_reason: string };
    expect(row.status).toBe("screen_failed");
    expect(row.failure_reason).toBe("Inclusion criterion 2 not met");
  });

  it("refuses a duplicate screening number at the same site", async () => {
    expect(
      (
        await post(`/study-sites/${site001}/screening-log`, {
          screening_number: number("SL-A"),
          screened_on: "2026-07-22",
        })
      ).status,
    ).toBe(400);
  });

  it("oversight reads the log; monitor and auditor cannot write it (§11.10(g))", async () => {
    expect((await get(`/study-sites/${site001}/screening-log`, MONITOR)).status).toBe(200);
    expect((await get(`/study-sites/${site001}/screening-log`, AUDITOR)).status).toBe(200);
    const body = { screening_number: number("SL-X"), screened_on: "2026-07-22" };
    expect((await post(`/study-sites/${site001}/screening-log`, body, MONITOR)).status).toBe(403);
    expect((await post(`/study-sites/${site001}/screening-log`, body, AUDITOR)).status).toBe(403);
  });

  it("the summary cross-checks the log's counts against the latest report", async () => {
    const [logRes, summaryRes] = await Promise.all([
      get(`/study-sites/${site001}/screening-log`),
      get(`/study-sites/${site001}/screening-summary`),
    ]);
    expect(summaryRes.status).toBe(200);
    const rows = (await logRes.json()) as { status: string }[];
    const summary = (await summaryRes.json()) as Record<string, number | string | null>;
    // Self-consistent, not pinned: log rows accumulate across runs.
    expect(summary.log_screened).toBe(rows.length);
    expect(summary.log_enrolled).toBe(rows.filter((r) => r.status === "enrolled").length);
    expect(summary.log_screen_failed).toBe(
      rows.filter((r) => r.status === "screen_failed").length,
    );
    expect(summary.log_in_screening).toBe(
      rows.filter((r) => r.status === "in_screening").length,
    );
    // The as-reported side (ADR-0011) rides along for the comparison.
    expect(summary).toHaveProperty("reported_screened");
    expect(summary).toHaveProperty("reported_enrolled");
    expect(summary).toHaveProperty("reported_as_of");
  });
});

describe("entry-level e-signatures (ADR-0036)", () => {
  let delegationId: string;
  const task = `esign coverage ${suffix}`;

  const delegationRow = async () => {
    const res = await get(`/study-sites/${site001}/delegation-log`);
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.find((r) => (r.delegated_tasks as string[]).includes(task)) as {
      delegation_id: string;
      signatures: LogSig[];
    };
  };

  beforeAll(async () => {
    const res = await post(`/study-sites/${site001}/delegation-log`, {
      person_id: person.webb,
      delegated_tasks: [task],
      start_date: "2026-07-01",
      authorized_by: person.vasquez,
    });
    delegationId = ((await res.json()) as { id: string }).id;
  });

  it("signing requires verified re-authentication (§11.200)", async () => {
    expect(
      (await post(`/delegations/${delegationId}/sign`, { meaning: "author" })).status,
    ).toBe(400); // no reauth_token at all
    expect(
      (
        await post(`/delegations/${delegationId}/sign`, {
          meaning: "author",
          reauth_token: "dev-admin-token", // not this session's credential
        })
      ).status,
    ).toBe(403);
  });

  it("records signer, meaning, and timestamp, bound to the entry's facts by hash (§11.50 §11.70)", async () => {
    const res = await post(`/delegations/${delegationId}/sign`, {
      meaning: "author",
      reauth_token: "dev-site-token",
    });
    expect(res.status).toBe(201);
    const signed = (await res.json()) as { signature_id: string; signed_sha256: string };
    expect(signed.signed_sha256).toMatch(/^[0-9a-f]{64}$/);

    const row = await delegationRow();
    const sig = row.signatures.find((x) => x.signature_id === signed.signature_id)!;
    expect(sig.signer_given_name).toBe("Dana");
    expect(sig.signer_family_name).toBe("Kim");
    expect(sig.meaning).toBe("author");
    expect(sig.signed_at).toBeTruthy();
    expect(sig.signed_sha256).toBe(signed.signed_sha256);
    expect(sig.facts_match).toBe(true);
  });

  it("a permitted mutation after signing is detectable: facts_match flips, nothing blocks", async () => {
    expect(
      (await patch(`/delegations/${delegationId}`, { end_date: "2026-07-30" })).status,
    ).toBe(200);
    const row = await delegationRow();
    expect(row.signatures.some((x) => x.facts_match === false)).toBe(true);
    // A fresh attestation over the ended facts verifies again.
    const res = await post(`/delegations/${delegationId}/sign`, {
      meaning: "author",
      reauth_token: "dev-site-token",
    });
    expect(res.status).toBe(201);
    const after = await delegationRow();
    const fresh = ((await res.json()) as { signature_id: string }).signature_id;
    expect(after.signatures.find((x) => x.signature_id === fresh)!.facts_match).toBe(true);
  });

  it("monitors may attest from oversight; the read-only auditor cannot sign; other sites stay closed", async () => {
    const monitorSign = await post(
      `/delegations/${delegationId}/sign`,
      { meaning: "review", reauth_token: "dev-monitor-token" },
      MONITOR,
    );
    expect(monitorSign.status).toBe(201);
    expect(
      (
        await post(
          `/delegations/${delegationId}/sign`,
          { meaning: "review", reauth_token: "dev-auditor-token" },
          AUDITOR,
        )
      ).status,
    ).toBe(403);
    const otherSite = await get(`/study-sites/${site002}/delegation-log`, ADMIN);
    const otherId = ((await otherSite.json()) as { delegation_id: string }[])[0]!
      .delegation_id;
    expect(
      (
        await post(`/delegations/${otherId}/sign`, {
          meaning: "author",
          reauth_token: "dev-site-token",
        })
      ).status,
    ).toBe(403);
  });

  it("training and screening entries sign through the same ceremony", async () => {
    const topic = `Log signing SOP ${suffix}`;
    const tRes = await post(`/study-sites/${site001}/training-log`, {
      person_id: person.kim,
      topic,
      trained_on: "2026-07-15",
    });
    const trainingId = ((await tRes.json()) as { id: string }).id;
    expect(
      (
        await post(`/training-records/${trainingId}/sign`, {
          meaning: "author",
          reauth_token: "dev-site-token",
        })
      ).status,
    ).toBe(201);
    const tLog = (await (await get(`/study-sites/${site001}/training-log`)).json()) as {
      topic: string;
      signatures: LogSig[];
    }[];
    expect(tLog.find((r) => r.topic === topic)!.signatures).toHaveLength(1);

    const sRes = await post(`/study-sites/${site001}/screening-log`, {
      screening_number: `SL-S-${suffix}`,
      screened_on: "2026-07-23",
    });
    const screeningId = ((await sRes.json()) as { id: string }).id;
    expect(
      (
        await post(`/screening-entries/${screeningId}/sign`, {
          meaning: "author",
          reauth_token: "dev-site-token",
        })
      ).status,
    ).toBe(201);
    const sLog = (await (await get(`/study-sites/${site001}/screening-log`)).json()) as {
      screening_number: string;
      signatures: LogSig[];
    }[];
    expect(sLog.find((r) => r.screening_number === `SL-S-${suffix}`)!.signatures).toHaveLength(1);
  });

  it("signature rows are immutable at the database level (§11.10(c))", async () => {
    const [sig] = await sql`SELECT id FROM log_signature LIMIT 1`;
    await expect(
      sql`UPDATE log_signature SET meaning = 'review' WHERE id = ${sig!.id}`,
    ).rejects.toThrow();
    await expect(sql`DELETE FROM log_signature WHERE id = ${sig!.id}`).rejects.toThrow();
  });

  it("log signatures land in the audit trail attributed to the signer (§11.10(e))", async () => {
    const row = await delegationRow();
    const sigId = row.signatures[0]!.signature_id;
    const audit = await get(
      `/audit-events?entity_type=log_signature&entity_id=${sigId}`,
      ADMIN,
    );
    expect(audit.status).toBe(200);
    const events = (await audit.json()) as { action: string; actor_label: string }[];
    expect(events.some((e) => e.action === "log_signature.insert")).toBe(true);
    expect(events[0]!.actor_label).toContain("Dana Kim");
  });
});
