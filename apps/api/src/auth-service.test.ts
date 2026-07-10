import { createServer, type Server } from "node:http";
import { createDb } from "@ctms/db";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { resetOidcCache } from "./auth.js";

/**
 * Machine-identity authentication and source-system filing (ADR-0011): a
 * client-credentials-style token with no email claim maps to a provisioned
 * person via API_SERVICE_SUBJECTS, files a document with provenance through
 * the audited upload path, and is denied everything beyond its ingest grant.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let issuer: string;
let idp: Server;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let studyId: string;
let fixtureArtifactId: number;

const AUDIENCE = "ctms-api";
const SERVICE_SUB = "edc-filing-client";
// Seeded machine identity (email survives re-seeding).
const SERVICE_EMAIL = "edc.filing@corc.example";

/** A client-credentials-style token: subject only, no email claim. */
async function mintService(sub = SERVICE_SUB) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "vitest" })
    .setSubject(sub)
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setExpirationTime("5m")
    .sign(keys.privateKey);
}

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "vitest", alg: "RS256" };
  idp = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("openid-configuration")) {
      res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks` }));
    } else if (req.url?.includes("jwks")) {
      res.end(JSON.stringify({ keys: [jwk] }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => idp.listen(0, "127.0.0.1", resolve));
  const address = idp.address();
  issuer = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  process.env.AUTH_MODE = "oidc";
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_AUDIENCE = AUDIENCE;
  process.env.API_SERVICE_SUBJECTS = `${SERVICE_SUB}:${SERVICE_EMAIL}`;
  resetOidcCache();
  app = buildApp(db, sql);

  const [study] = await sql`SELECT id FROM study LIMIT 1`;
  studyId = study!.id;

  // Test-only artifact for fixtures (no requirement rule references it).
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

afterAll(async () => {
  delete process.env.API_SERVICE_SUBJECTS;
  await new Promise<void>((resolve) => idp.close(() => resolve()));
  await sql.end();
});

function filingForm(title: string): FormData {
  const form = new FormData();
  form.set("file", new File([`filing ${title}`], "casebook.pdf", { type: "application/pdf" }));
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("title", title);
  form.set("source_system", "edc-core");
  form.set("source_ref", "casebook:demo-001:v3");
  return form;
}

describe("machine identity (ADR-0011)", () => {
  it("authenticates a configured service subject with no email claim", async () => {
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${await mintService()}` },
    });
    expect(res.status).toBe(200);
  });

  it("still rejects an unconfigured subject with no email claim", async () => {
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${await mintService("some-other-client")}` },
    });
    expect(res.status).toBe(403);
  });

  it("files a document with provenance, attributed to the service actor", async () => {
    const res = await app.request("/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${await mintService()}` },
      body: filingForm("Service filing fixture"),
    });
    expect(res.status).toBe(201);
    const { version_id } = (await res.json()) as { version_id: string };

    const [version] = await sql`
      SELECT source_system, source_ref FROM document_version WHERE id = ${version_id}`;
    expect(version!.source_system).toBe("edc-core");
    expect(version!.source_ref).toBe("casebook:demo-001:v3");

    const [event] = await sql`
      SELECT actor_label FROM audit_event
      WHERE entity_type = 'document_version' AND entity_id = ${version_id}
        AND action = 'document_version.insert'`;
    expect(event!.actor_label).toContain("EDC Filing");
  });

  it("cannot sign: ingest grants upload but no signing ceremony", async () => {
    const token = await mintService();
    const up = await app.request("/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: filingForm("Service sign-denial fixture"),
    });
    expect(up.status).toBe(201);
    const { version_id } = (await up.json()) as { version_id: string };

    const res = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval", reauth_token: token }),
    });
    expect(res.status).toBe(403);
  });

  it("leaves provenance null for uploads that do not claim it", async () => {
    const form = filingForm("No-provenance fixture");
    form.delete("source_system");
    form.delete("source_ref");
    const res = await app.request("/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${await mintService()}` },
      body: form,
    });
    expect(res.status).toBe(201);
    const { version_id } = (await res.json()) as { version_id: string };
    const [version] = await sql`
      SELECT source_system, source_ref FROM document_version WHERE id = ${version_id}`;
    expect(version!.source_system).toBeNull();
    expect(version!.source_ref).toBeNull();
  });
});
