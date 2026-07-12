import type { Context, MiddlewareHandler, Next } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  grantsFor,
  permits,
  resolveScope,
  type Actor,
  type Grant,
  type Operation,
  type ResourceScope,
  type ScopeParam,
} from "@ctms/core";
import type { Sql } from "@ctms/db";

export type Env = {
  Variables: {
    actor: Actor;
    grants: Grant[];
    /** OIDC subject of the session token; signing re-auth must match it. */
    oidcSub?: string;
  };
};

export type AuthMode = "dev" | "oidc";

/**
 * AUTH_MODE selects the identity source. `dev` maps static bearer tokens to
 * seeded people (demo only — not a Part 11 access-control posture); `oidc`
 * validates JWTs from a real identity provider. The mode must be explicit:
 * a deployment that forgot to configure auth should not boot.
 */
export function authMode(): AuthMode {
  const mode = process.env.AUTH_MODE;
  if (mode === "dev" || mode === "oidc") return mode;
  throw new Error(
    "AUTH_MODE must be 'dev' or 'oidc' (see .env.example). Refusing to start without an explicit auth mode.",
  );
}

export function assertAuthConfig(): void {
  if (authMode() !== "oidc") return;
  for (const key of ["OIDC_ISSUER", "OIDC_AUDIENCE"]) {
    if (!process.env[key]) {
      throw new Error(`AUTH_MODE=oidc requires ${key} to be set`);
    }
  }
}

// --- dev mode ---------------------------------------------------------------

const tokenToEmail = new Map<string, { email: string; roleLabel: string }>();

export function configureTokens(): void {
  tokenToEmail.set(process.env.API_TOKEN_ADMIN ?? "dev-admin-token", {
    email: "nora.feld@corc.example",
    roleLabel: "trial ops",
  });
  tokenToEmail.set(process.env.API_TOKEN_MONITOR ?? "dev-monitor-token", {
    email: "ravi.patel@meridiancro.example",
    roleLabel: "monitor",
  });
  tokenToEmail.set(process.env.API_TOKEN_SERVICE ?? "dev-service-token", {
    email: "edc.filing@corc.example",
    roleLabel: "service",
  });
  // The site seat (ADR-0023): the seeded site 001 coordinator, whose only
  // grant is site_staff scoped to CORC-2201 site 001.
  tokenToEmail.set(process.env.API_TOKEN_SITE ?? "dev-site-token", {
    email: "dana.kim@site001.example",
    roleLabel: "site staff",
  });
}

// --- oidc mode ----------------------------------------------------------------

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getJwks() {
  if (jwks) return jwks;
  let jwksUri = process.env.OIDC_JWKS_URI;
  if (!jwksUri) {
    const issuer = process.env.OIDC_ISSUER!;
    const discoveryUrl = new URL(
      ".well-known/openid-configuration",
      issuer.endsWith("/") ? issuer : `${issuer}/`,
    );
    const res = await fetch(discoveryUrl);
    if (!res.ok) throw new Error(`OIDC discovery failed (${res.status}) at ${discoveryUrl}`);
    jwksUri = ((await res.json()) as { jwks_uri: string }).jwks_uri;
  }
  jwks = createRemoteJWKSet(new URL(jwksUri));
  return jwks;
}

/** Reset cached JWKS (tests reconfigure the issuer between runs). */
export function resetOidcCache(): void {
  jwks = null;
}

async function verifyOidcToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, await getJwks(), {
    issuer: process.env.OIDC_ISSUER,
    audience: process.env.OIDC_AUDIENCE,
  });
  return payload;
}

/**
 * Machine identities (ADR-0011): client-credentials tokens carry no verified
 * email, so configured subjects map directly to provisioned person records.
 * API_SERVICE_SUBJECTS=sub:email[,sub:email...] — e.g. the IdP client id of
 * an EDC's filing worker to its seeded service person.
 */
function serviceSubjectEmail(sub: unknown): string | null {
  if (typeof sub !== "string" || sub === "") return null;
  const spec = process.env.API_SERVICE_SUBJECTS;
  if (!spec) return null;
  for (const entry of spec.split(",")) {
    const sep = entry.indexOf(":");
    if (sep === -1) continue;
    if (entry.slice(0, sep).trim() === sub) return entry.slice(sep + 1).trim();
  }
  return null;
}

function emailClaim(payload: JWTPayload): string | null {
  const claim = process.env.OIDC_EMAIL_CLAIM ?? "email";
  const value = payload[claim];
  if (typeof value !== "string" || value === "") return null;
  // Providers that assert verification must not be contradicted; absence of
  // the claim is tolerated (not all IdPs emit it on access tokens).
  if (payload.email_verified === false) return null;
  return value;
}

// --- authentication middleware --------------------------------------------------

/**
 * Resolve the bearer credential to a person and their active access grants.
 * 401 = credential invalid; 403 = valid identity with no person record or no
 * grants (authenticated but not provisioned). No fallback actor: an identity
 * the system cannot attribute must not write (§11.10(d)/(g)).
 */
export function authMiddleware(sql: Sql): MiddlewareHandler<Env> {
  const mode = authMode();
  return async (c: Context<Env>, next: Next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) return c.json({ error: "missing bearer token" }, 401);

    let email: string;
    let roleLabel: string | null = null;
    if (mode === "dev") {
      const mapped = tokenToEmail.get(token);
      if (!mapped) return c.json({ error: "missing or invalid bearer token" }, 401);
      email = mapped.email;
      roleLabel = mapped.roleLabel;
    } else {
      let payload: JWTPayload;
      try {
        payload = await verifyOidcToken(token);
      } catch {
        return c.json({ error: "missing or invalid bearer token" }, 401);
      }
      const claimed = serviceSubjectEmail(payload.sub) ?? emailClaim(payload);
      if (!claimed) {
        return c.json({ error: "token carries no verified email identity" }, 403);
      }
      email = claimed;
      if (typeof payload.sub === "string") c.set("oidcSub", payload.sub);
    }

    // Resolved per request (single indexed lookup): person ids change on
    // re-seed, so caching the mapping goes stale.
    const [person] = await sql`
      SELECT id, given_name, family_name FROM person WHERE email = ${email}`;
    if (!person) {
      return c.json({ error: `no person record for authenticated identity ${email}` }, 403);
    }
    const grants = await grantsFor(sql, person.id as string);
    c.set("actor", {
      personId: person.id as string,
      label: `${person.given_name} ${person.family_name}${roleLabel ? ` (${roleLabel})` : ""}`,
    });
    c.set("grants", grants);
    await next();
  };
}

// --- authorization middleware ---------------------------------------------------

type OpResolver = Operation | ((c: Context<Env>) => Operation | Promise<Operation>);

/**
 * Gate a route on an operation, optionally scoped by a path parameter that
 * resolves to a study/site (one indexed lookup). When the parameter names a
 * nonexistent resource, the check falls back to unscoped so the handler owns
 * the 404. Runs after authMiddleware (needs grants on the context).
 */
export function requirePermission(
  sql: Sql,
  op: OpResolver,
  scopeParam?: ScopeParam,
): MiddlewareHandler<Env> {
  return async (c: Context<Env>, next: Next) => {
    const operation = typeof op === "function" ? await op(c) : op;
    let scope: ResourceScope = {};
    if (scopeParam) {
      const id = c.req.param(scopeParam);
      if (id) scope = (await resolveScope(sql, scopeParam, id)) ?? {};
    }
    if (!permits(c.get("grants"), operation, scope)) {
      return c.json({ error: `requires '${operation}' permission for this resource` }, 403);
    }
    await next();
  };
}

// --- signing re-authentication (§11.200) ------------------------------------------

export type ReauthResult =
  | { ok: true; method: "oidc_fresh_token" | "dev_token"; at: Date }
  | { ok: false; error: string };

/**
 * Verify the re-authentication presented with a signing request. In oidc mode
 * the client obtains a fresh token (prompt=login / max_age=0) and we require
 * its auth_time within REAUTH_MAX_AGE_SECONDS (default 300) and the same
 * subject as the session. In dev mode the client restates its bearer token —
 * a stub that exercises the same API contract, not a credential challenge.
 */
export async function verifyReauth(
  c: Context<Env>,
  reauthToken: string,
): Promise<ReauthResult> {
  if (authMode() === "dev") {
    const bearer = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (reauthToken !== bearer) {
      return { ok: false, error: "re-authentication failed" };
    }
    return { ok: true, method: "dev_token", at: new Date() };
  }

  let payload: JWTPayload;
  try {
    payload = await verifyOidcToken(reauthToken);
  } catch {
    return { ok: false, error: "re-authentication token invalid" };
  }
  if (payload.sub !== c.get("oidcSub")) {
    return { ok: false, error: "re-authentication identity does not match session" };
  }
  const authTime =
    typeof payload.auth_time === "number" ? payload.auth_time : payload.iat;
  const maxAge = Number(process.env.REAUTH_MAX_AGE_SECONDS ?? 300);
  if (typeof authTime !== "number" || Date.now() / 1000 - authTime > maxAge) {
    return { ok: false, error: "re-authentication is stale; sign in again to sign" };
  }
  return { ok: true, method: "oidc_fresh_token", at: new Date(authTime * 1000) };
}
