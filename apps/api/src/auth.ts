import type { Context, Next } from "hono";
import type { Actor } from "@ctms/core";
import type { Sql } from "@ctms/db";

/**
 * Dev bearer-token auth: tokens from .env map to seeded people by email.
 * Stand-in for a real IdP — see docs/04-api.md and the non-goals list.
 */
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
}

export function authMiddleware(sql: Sql) {
  return async (c: Context, next: Next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    const mapped = tokenToEmail.get(token);
    if (!mapped) {
      return c.json({ error: "missing or invalid bearer token" }, 401);
    }
    // Resolved per request (single indexed lookup): person ids change on
    // re-seed, so caching the mapping goes stale.
    const people = await sql`
      SELECT id, given_name, family_name FROM person WHERE email = ${mapped.email}`;
    const person = people[0];
    const actor: Actor = person
      ? {
          personId: person.id as string,
          label: `${person.given_name} ${person.family_name} (${mapped.roleLabel})`,
        }
      : { label: `${mapped.email} (${mapped.roleLabel})` };
    c.set("actor", actor);
    await next();
  };
}
