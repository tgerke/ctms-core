# Pilot deployment (single tenant)

One deployment per customer — multi-tenancy is a non-goal of this phase
(ADR-0001, vision doc). This page is the checklist that turns the dev
quickstart into a pilot posture; `pnpm validation:iq` verifies most of it
against the running environment and produces the sign-off report.

## Topology

Three processes plus storage:

- **API** (`apps/api`, Node 22) — stateless; run behind a TLS-terminating
  reverse proxy (Caddy, nginx, or the platform's load balancer). The app
  itself speaks plain HTTP and assumes the proxy owns certificates.
- **Postgres 16** — the compliance surface lives here (triggers, roles,
  hash chain). Managed Postgres (RDS et al.) is fine.
- **Web** (`apps/web`) — static files after `pnpm build`; serve from the same
  proxy or any static host.
- **Object storage** — any S3-compatible store, bucket created **with Object
  Lock** and a default COMPLIANCE retention rule matching your records
  retention schedule.

## Environment

```sh
AUTH_MODE=oidc                     # dev mode is a demo affordance, never a pilot
OIDC_ISSUER=https://idp.customer.example/...
OIDC_AUDIENCE=ctms-api
REAUTH_MAX_AGE_SECONDS=300         # §11.200 signing re-auth window

DATABASE_URL=postgres://ctms:<owner-password>@db:5432/ctms     # migrations only
CTMS_APP_PASSWORD=<rotated>        # API connects as ctms_app, derived from DATABASE_URL

STORAGE_DRIVER=s3
S3_ENDPOINT=...                    # omit for AWS
S3_REGION=...
S3_BUCKET=ctms-documents
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Secrets arrive via the platform's secret store, not files in the repo.

## Role credentials

Migrations create dev-grade passwords; rotate both before first use:

```sql
ALTER ROLE ctms_app      LOGIN PASSWORD '<generated>';
ALTER ROLE ctms_readonly LOGIN PASSWORD '<generated>';
```

The API must run as `ctms_app` (it does by default — verify with IQ). The
owning role's credentials are used only for `pnpm db:migrate` and stay out of
the API's environment. `ctms_readonly` is the analyst SQL account
(`docs/04-api.md`).

## Identity provider

Register two OIDC clients (or one, if the IdP allows both flows):

- **API audience** `ctms-api` — the value in `OIDC_AUDIENCE`.
- **Web SPA** — authorization code + PKCE, redirect URI `https://<host>/`;
  the signing dialog re-runs the flow with `prompt=login`, so the IdP must
  honor forced re-authentication (all mainstream IdPs do).

Every user needs a `person` row whose email matches the IdP's verified email
claim, plus an `access_grant` row for their role and scope. Provisioning is
two audited INSERTs; there is no separate user store to reconcile.

## Bring-up order

```sh
pnpm db:migrate                          # owning role
pnpm db:import-tmf -- TMF_RM.xlsx        # full CDISC taxonomy (licensed download)
# provision people + access_grant rows (SQL or seed script adapted per customer)
pnpm validation:iq --report iq-$(date +%F).md   # file the report
pnpm validation:artifacts                # OQ + traceability, file alongside
```

Do **not** run `pnpm db:seed` against a pilot database — it truncates.

## Backups and verification

- Postgres: continuous archiving or the managed service's PITR; test restore
  before go-live. A restored copy must pass
  `SELECT * FROM ctms_verify_audit_chain()` (empty result = intact) — that is
  the tamper-evidence check, and it works on backups too.
- Object storage: versioned + locked already; replicate per your DR policy.
  Blobs are content-addressed, so a restore can be verified byte-for-byte
  against `document_version.sha256`.
- Schedule `GET /audit-chain/verify` (any grant holder) or the SQL function
  from cron/monitoring so chain integrity is exercised continuously, not just
  available.
