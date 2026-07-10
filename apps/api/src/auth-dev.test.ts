import { grantsFor, permits } from "@ctms/core";
import { createDb, type Sql } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Dev-mode authentication, authorization, and signing re-auth, exercised
 * through the HTTP surface. Runs against the seeded dev database; fixtures
 * are typed to a test-only TMF artifact (99.99.99) so no requirement rule or
 * dashboard view picks them up. Immutable rows (versions, signatures) cannot
 * be cleaned up by design; repeated runs version-bump the same fixture
 * document.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let fixtureArtifactId: number;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };

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

function uploadForm(title: string): FormData {
  const form = new FormData();
  form.set("file", new File([`fixture ${title}`], "fixture.pdf", { type: "application/pdf" }));
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("title", title);
  return form;
}

describe("authentication (§11.10(d))", () => {
  it("rejects a missing or unknown bearer token with 401", async () => {
    expect((await app.request("/studies")).status).toBe(401);
    const res = await app.request("/studies", {
      headers: { Authorization: "Bearer not-a-token" },
    });
    expect(res.status).toBe(401);
  });

  it("resolves a dev token to a person and serves the request", async () => {
    const res = await app.request("/studies", { headers: ADMIN });
    expect(res.status).toBe(200);
    const studies = (await res.json()) as unknown[];
    expect(studies.length).toBeGreaterThan(0);
  });
});

describe("authorization (ADR-0008)", () => {
  it("denies operations the role does not include, naming the permission", async () => {
    // monitor lacks 'administer'
    const res = await app.request(`/studies/${studyId}/sync-expected-documents`, {
      method: "POST",
      headers: MONITOR,
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("administer");
  });

  it("allows reads for every seeded role", async () => {
    for (const headers of [ADMIN, MONITOR]) {
      expect((await app.request(`/studies/${studyId}/sites`, { headers })).status).toBe(200);
    }
  });

  it("denies approval signatures to the monitor role but allows review", async () => {
    const up = await app.request("/documents", {
      method: "POST",
      headers: ADMIN,
      body: uploadForm("RBAC fixture"),
    });
    expect(up.status).toBe(201);
    const { version_id } = (await up.json()) as { version_id: string };

    const approve = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { ...MONITOR, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval", reauth_token: "dev-monitor-token" }),
    });
    expect(approve.status).toBe(403);
    expect(((await approve.json()) as { error: string }).error).toContain("approve");

    const review = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { ...MONITOR, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "review", reauth_token: "dev-monitor-token" }),
    });
    expect(review.status).toBe(201);
  });

  it("enforces grant scope: a study-scoped grant does not reach other studies", async () => {
    // Probe person with a grant scoped to a study that is not the seeded one;
    // rolled back so the dev database is untouched.
    const ROLLBACK = new Error("rollback");
    await sql
      .begin(async (tx) => {
        await tx`SELECT set_config('ctms.actor_label', 'vitest', true)`;
        const [otherStudy] = await tx`
          INSERT INTO study (protocol_number, title, sponsor_org_id)
          SELECT 'VITEST-SCOPE', 'Scope probe', id
          FROM organization WHERE kind = 'sponsor' LIMIT 1 RETURNING id`;
        const [person] = await tx`
          INSERT INTO person (given_name, family_name, email)
          VALUES ('Scope', 'Probe', 'scope.probe@vitest.example') RETURNING id`;
        await tx`
          INSERT INTO access_grant (person_id, role, study_id)
          VALUES (${person!.id}, 'trial_ops', ${otherStudy!.id})`;

        const grants = await grantsFor(tx as unknown as Sql, person!.id as string);
        expect(permits(grants, "read", { studyId: otherStudy!.id as string })).toBe(true);
        expect(permits(grants, "read", { studyId })).toBe(false);
        expect(permits(grants, "upload", { studyId })).toBe(false);
        // Revocation is immediate: a revoked grant no longer permits anything.
        await tx`UPDATE access_grant SET revoked_at = now() WHERE person_id = ${person!.id}`;
        const revoked = await grantsFor(tx as unknown as Sql, person!.id as string);
        expect(permits(revoked, "read", { studyId: otherStudy!.id as string })).toBe(false);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});

describe("signing re-authentication (§11.200)", () => {
  it("rejects a signature without valid re-authentication", async () => {
    const up = await app.request("/documents", {
      method: "POST",
      headers: ADMIN,
      body: uploadForm("Reauth fixture"),
    });
    const { version_id } = (await up.json()) as { version_id: string };

    const missing = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval" }),
    });
    expect(missing.status).toBe(400); // schema requires reauth_token

    const wrong = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval", reauth_token: "stale-or-forged" }),
    });
    expect(wrong.status).toBe(403);
  });

  it("records the re-auth method and time on the signature row", async () => {
    const up = await app.request("/documents", {
      method: "POST",
      headers: ADMIN,
      body: uploadForm("Reauth record fixture"),
    });
    const { version_id } = (await up.json()) as { version_id: string };
    const res = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval", reauth_token: "dev-admin-token" }),
    });
    expect(res.status).toBe(201);
    const { signature_id } = (await res.json()) as { signature_id: string };
    const [sig] = await sql`
      SELECT reauth_method, reauth_at FROM signature WHERE id = ${signature_id}`;
    expect(sig!.reauth_method).toBe("dev_token");
    expect(sig!.reauth_at).not.toBeNull();
  });

  it("is DB-enforced: a direct INSERT without re-auth fields is rejected", async () => {
    const [version] = await sql`SELECT id, sha256 FROM document_version LIMIT 1`;
    const [person] = await sql`SELECT id FROM person LIMIT 1`;
    await expect(sql`
      INSERT INTO signature (document_version_id, signer_person_id, meaning, signed_sha256)
      VALUES (${version!.id}, ${person!.id}, 'author', ${version!.sha256})`).rejects.toThrow(
      /signature_reauth_required/,
    );
  });
});
