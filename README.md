# ctms-core

A modern regulatory-document backbone for clinical trials, built sponsor/CRO-side:
every trial document is a row with a [TMF Reference Model](https://www.cdisc.org/standards/trial-master-file-reference-model)
artifact type, immutable content-addressed versions, and an append-only audit trail.
A requirement engine materializes *expected* documents from declarative rules, so
completeness, gaps, and upcoming expirations are queries — not monitoring visits.

The public API is the product; the web UI is its first customer.

## Why

eBinder/eISF and CTMS incumbents are compliant document buckets with no relational
data model. Questions like "which coordinators are missing current GCP training across
my sites?" or "which sites lack IRB approval for protocol amendment 3?" require manual
review. Here they are one `GET` (or one `SELECT`). See [docs/01-vision.md](docs/01-vision.md).

## Layout

| Path | What |
| --- | --- |
| `docs/` | Design docs: vision, data model, compliance mapping, API guide + ADR log |
| `packages/db` | Postgres schema (Drizzle), migrations, audit-trail enforcement, seed |
| `packages/core` | Domain logic: audited mutations, requirement engine, completeness |
| `apps/api` | OpenAPI 3.1 REST API (Hono), spec at `/openapi.json`, docs at `/docs` |
| `apps/web` | React dashboard: completeness grid, site detail, document audit timeline |

## Quick start

Requires Node 22+, pnpm, Docker.

```sh
cp .env.example .env
pnpm install
pnpm db:up        # Postgres 16 in Docker (port 5433)
pnpm db:migrate
pnpm db:seed      # demo study: 4 sites, 12 staff, realistic gaps
pnpm dev          # API on :8787, web on :5173
```

Then open http://localhost:5173 (dashboard) and http://localhost:8787/docs (API reference).

```sh
pnpm test         # includes DB-level audit-immutability tests
```

## Status

Working vertical slice / design probe. Not validated software — see
[docs/03-compliance.md](docs/03-compliance.md) for what "compliant-by-design" does and
does not claim.
