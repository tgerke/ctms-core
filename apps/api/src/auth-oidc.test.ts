import { createServer, type Server } from "node:http";
import { createDb } from "@ctms/db";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { resetOidcCache } from "./auth.js";

/**
 * OIDC-mode authentication and §11.200 re-auth against a mock identity
 * provider: an in-process HTTP server exposing an OIDC discovery document and
 * a JWKS, with tokens minted locally. Exercises exactly the JWT-validation
 * path a real IdP (Okta, Entra, Keycloak) would hit.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let issuer: string;
let idp: Server;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;

const AUDIENCE = "ctms-api";
// Seeded person the tokens authenticate as (email survives re-seeding).
const SEEDED_EMAIL = "nora.feld@corc.example";

async function mint(claims: JWTPayload & { email?: string }, audience = AUDIENCE) {
  return new SignJWT({ email: SEEDED_EMAIL, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "vitest" })
    .setSubject("vitest-subject")
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
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
  resetOidcCache();
  app = buildApp(db, sql);

  // Test-only artifact for fixtures (no requirement rule references it).
  await sql`SELECT set_config('ctms.actor_label', 'vitest', false)`;
  const [zone] = await sql`
    INSERT INTO tmf_zone (number, name) VALUES (99, 'Test Fixtures')
    ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [section] = await sql`
    INSERT INTO tmf_section (zone_id, code, name) VALUES (${zone!.id}, '99.99', 'Test')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  await sql`
    INSERT INTO tmf_artifact (section_id, code, name)
    VALUES (${section!.id}, '99.99.99', 'API Test Fixture')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => idp.close(() => resolve()));
  await sql.end();
});

describe("OIDC authentication (§11.10(d))", () => {
  it("accepts a valid token and resolves the person by email claim", async () => {
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${await mint({})}` },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a token for the wrong audience", async () => {
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${await mint({}, "other-api")}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a forged token (wrong key)", async () => {
    const rogue = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: SEEDED_EMAIL, email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "vitest" })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(rogue.privateKey);
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${forged}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated identity with no person record (403, not a fallback actor)", async () => {
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${await mint({ email: "stranger@example.com" })}` },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a token whose email is explicitly unverified", async () => {
    const res = await app.request("/studies", {
      headers: { Authorization: `Bearer ${await mint({ email_verified: false })}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("OIDC signing re-authentication (§11.200)", () => {
  async function fixtureVersion(session: string): Promise<string> {
    const [artifact] = await sql`SELECT id FROM tmf_artifact WHERE code = '99.99.99'`;
    const form = new FormData();
    form.set("file", new File(["oidc fixture"], "fixture.pdf", { type: "application/pdf" }));
    form.set("tmf_artifact_id", String(artifact!.id));
    const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
    form.set("study_id", study!.id);
    form.set("title", "OIDC reauth fixture");
    const up = await app.request("/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
      body: form,
    });
    expect(up.status).toBe(201);
    return ((await up.json()) as { version_id: string }).version_id;
  }

  it("accepts a fresh re-auth token for the same subject and records it", async () => {
    const session = await mint({});
    const versionId = await fixtureVersion(session);
    const res = await app.request(`/document-versions/${versionId}/sign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        meaning: "approval",
        reauth_token: await mint({ auth_time: Math.floor(Date.now() / 1000) }),
      }),
    });
    expect(res.status).toBe(201);
    const { signature_id } = (await res.json()) as { signature_id: string };
    const [sig] = await sql`
      SELECT reauth_method FROM signature WHERE id = ${signature_id}`;
    expect(sig!.reauth_method).toBe("oidc_fresh_token");
  });

  it("rejects a stale re-auth token (auth_time outside the freshness window)", async () => {
    const session = await mint({});
    const versionId = await fixtureVersion(session);
    const res = await app.request(`/document-versions/${versionId}/sign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        meaning: "approval",
        reauth_token: await mint({ auth_time: Math.floor(Date.now() / 1000) - 3600 }),
      }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a re-auth token minted for a different subject", async () => {
    const session = await mint({});
    const versionId = await fixtureVersion(session);
    const fresh = await new SignJWT({ email: SEEDED_EMAIL, email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "vitest" })
      .setSubject("someone-else")
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(keys.privateKey);
    const res = await app.request(`/document-versions/${versionId}/sign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval", reauth_token: fresh }),
    });
    expect(res.status).toBe(403);
  });
});
