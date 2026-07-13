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
| `docs/` | Design docs: vision, data model, compliance mapping, API guide, deployment + ADR log |
| `docs/validation/` | Generated IQ/OQ reports and requirement→test traceability matrix |
| `docs-site/` | Quarto docs site: getting started, user guide, cookbook, compliance, validation |
| `packages/db` | Postgres schema (Drizzle), migrations, audit-trail enforcement, seed |
| `packages/core` | Domain logic: audited mutations, requirement engine, completeness |
| `apps/api` | OpenAPI 3.1 REST API (Hono), spec at `/openapi.json`, docs at `/docs` |
| `apps/web` | React app: dashboard and portfolio, site/visit/document pages, review queue, TMF binder, audit timeline |
| `tools/` | CLI jobs: oversight digest, TMF export / eTMF-EMS exchange, EMS import, validation artifacts |

## Quick start

Requires Node 22+, pnpm, Docker.

```sh
cp .env.example .env
pnpm install
pnpm db:up        # Postgres 16 (:5433), MinIO, mailpit in Docker
pnpm db:migrate
pnpm db:seed      # demo study: 4 sites, 12 staff, realistic gaps
pnpm dev          # API on :8787, web on :5173
```

Then open http://localhost:5173 (dashboard) and http://localhost:8787/docs (API reference).

```sh
pnpm test                   # includes DB-level audit-immutability + WORM tests
pnpm validation:iq          # installation qualification against the live env
pnpm validation:artifacts   # OQ report + requirement traceability matrix
```

## Status

Working vertical slice, hardened toward a single-tenant pilot: OIDC/SSO with
role-based grants, signing re-authentication (§11.200), WORM-capable object
storage, least-privilege DB roles, a verbatim CDISC TMF Reference Model importer
(`pnpm db:import-tmf`), and generated validation artifacts. On that core sits
the working surface: full-text search across metadata and document content, a
review queue with inline preview and batch signing (one re-authentication, one
signature per document), site-scoped seats keeping structured delegation-of-authority
and training logs, a read-only auditor seat with a reference-model binder and
in-browser byte verification, a multi-study portfolio view, emailed oversight
digests, and a verifiable TMF export package that speaks CDISC eTMF-EMS in both
directions (`pnpm export-tmf` / `pnpm import-ems`). Not validated
software — the formal CSV program is organizational work; see
[docs/03-compliance.md](docs/03-compliance.md) for what "compliant-by-design"
does and does not claim, and [docs/05-deployment.md](docs/05-deployment.md) for
the pilot checklist.

## License

[AGPL-3.0](LICENSE). Same license as its sibling project
[edc-core](https://github.com/tgerke/edc-core), for the same reason: anyone can
run, study, and improve this, and nobody can take it closed and sell it back to
the sites and sponsors it serves.
