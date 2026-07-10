# ADR-0002: TypeScript + Postgres; R is a client, not the implementation

**Status**: accepted · 2026-07-09

## Decision

Postgres 16 is the system of record. The backend and frontend are TypeScript end-to-end
(Hono + Drizzle; Vite + React + Tailwind). R (the team's analysis stack) consumes the
OpenAPI-documented REST API.

## Rationale

- The product's core claim is a relational model with compliance primitives —
  Postgres provides triggers, views, constraints, and pgcrypto to enforce them *in the
  database*, below any application bug.
- "Elegant 2026 web software" — the stated bar — lives in the TS ecosystem.
- Keeping R out of the implementation but first-class at the API boundary is the
  point: the API must be good enough that a data-science team never needs a backdoor.

## Consequences

`docs/04-api.md` carries a worked httr2 example as an acceptance test of API quality.
