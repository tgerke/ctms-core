# Pilot deployment (single tenant)

One deployment per customer — multi-tenancy is a non-goal of this phase
(ADR-0001, vision doc). This page is the checklist that turns the dev
quickstart into a pilot posture; `pnpm validation:iq` verifies most of it
against the running environment and produces the sign-off report.

## Reference implementation

`infra/compose.prod.yaml` (ADR-0031) is this checklist as a runnable
artifact: pinned GHCR images, Caddy terminating TLS as the only published
service, a migrate one-shot that holds the owning role and rotates the
runtime-role passwords, and the api connecting as `ctms_app` via
`DATABASE_URL_APP`. Copy `infra/.env.example` to `infra/.env`, fill in the
required values, and:

```sh
docker compose -f infra/compose.prod.yaml up -d
```

Compose profiles cover the supported variations: `local-db` (bundled
Postgres) vs. a managed `DATABASE_URL`, and `s3-local` (bundled MinIO) vs. a
real Object Lock bucket. The sections below remain the spec — and the whole
of it applies whether you run the compose file or your own topology.

## Provisioning the VM

If the host doesn't exist yet, `infra/cloud-init.yaml` builds it on any
provider that accepts cloud-init user data (AWS, Azure, DigitalOcean,
Hetzner, Proxmox, ...): Docker, the release-pinned stack above, SSH
hardening, and a firewall, unattended. Render the placeholders and paste
the result into the provider's *user data* field:

```sh
sed -e 's/${domain}/ctms.example.org/' \
    -e 's/${app_version}/0.1.0/' \
    -e 's/${auth_mode}/oidc/' \
    -e "s/\${postgres_password}/$(openssl rand -hex 24)/" \
    -e "s/\${ctms_app_password}/$(openssl rand -hex 24)/" \
    -e 's/${compose_profiles}/local-db/' \
    -e 's/${extra_env}//' \
    infra/cloud-init.yaml > user-data.yaml
```

2 vCPUs / 2 GB RAM is comfortable. OIDC issuer/audience arrive via the
`extra_env` placeholder or a post-boot edit of `/opt/ctms/.env`. The rest of
this page — IdP registration, TMF RM import, admin provisioning, validation
sign-off — still applies.

Prefer infrastructure-as-code? `infra/terraform/{aws,azure,digitalocean}`
are three self-contained Terraform roots with an identical variable
contract — VM, firewall (SSH restricted to your admin CIDR), static IP,
encrypted disk, same cloud-init. The AWS root additionally creates the
Object Lock document bucket (ADR-0009) with a least-privilege IAM
principal and wires the stack to it. Each directory's README is a complete
walkthrough.

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
(`docs/04-api.md`). `pnpm --filter @ctms/db rotate-passwords` performs the
same rotation from `CTMS_APP_PASSWORD` / `CTMS_READONLY_PASSWORD` — the
compose stack's migrate one-shot runs it on every bring-up.

## Identity provider

Register two OIDC clients (or one, if the IdP allows both flows):

- **API audience** `ctms-api` — the value in `OIDC_AUDIENCE`.
- **Web SPA** — authorization code + PKCE, redirect URI `https://<host>/`;
  the signing dialog re-runs the flow with `prompt=login`, so the IdP must
  honor forced re-authentication (all mainstream IdPs do).

Every user needs a `person` row whose email matches the IdP's verified email
claim, plus an `access_grant` row for their role and scope. Provisioning is
two audited INSERTs; there is no separate user store to reconcile. Machine
identities (a source system's filing worker, ADR-0011) work the same way:
a client-credentials OIDC client whose subject maps to its person row via
`API_SERVICE_SUBJECTS`, granted `ingest` scoped to its study.

## Bring-up order

```sh
pnpm db:migrate                          # owning role
pnpm db:import-tmf -- TMF_RM.xlsx        # full CDISC taxonomy (licensed download)
# provision the first admin person + unscoped access_grant row (two audited
# INSERTs); everything after that goes through the admin API/UI (ADR-0016)
pnpm validation:iq --report iq-$(date +%F).md   # file the report
pnpm validation:artifacts                # OQ + traceability, file alongside
```

Do **not** run `pnpm db:seed` against a pilot database — it truncates.

## Digest notifications

`pnpm digest` (ADR-0017) emails each study's oversight digest — expiring and
expired documents, overdue visits, action items, issues, milestones, overdue
review assignments, and any audit-chain failure — to everyone holding a
study-wide `admin` or `trial_ops` grant. It is stateless: a pure function of the derived views at send time,
safe to rerun, with nothing to sync. Schedule it with cron at whatever
cadence the team wants:

```cron
# weekday mornings at 07:00 local — from a checkout
0 7 * * 1-5  cd /srv/ctms-core && pnpm digest
# or against the compose stack (the api image ships tools/)
0 7 * * 1-5  cd /opt/ctms && docker compose -f compose.prod.yaml run --rm api pnpm digest
```

The digest connects as the least-privilege `ctms_app` role, same as the api.

Configuration is three env vars: `SMTP_URL` (the relay; the compose file's
mailpit on `smtp://localhost:1025` for dev, inbox UI on :8025),
`DIGEST_FROM`, and optionally `DIGEST_TO` to override the derived recipient
list. Without `SMTP_URL` the job prints to stdout instead of sending
(`--dry-run` forces that; `--study <protocol>` limits to one study).

## Handing over the TMF

`pnpm export-tmf -- --study <protocol> [--out <dir>]` (ADR-0020) writes the
study's complete transfer/inspection package: content-addressed document
bytes, full metadata (versions, signatures with their §11.70 hashes,
returns, waivers, the completeness snapshot), and the entire hash-chained
audit trail. The receiving side verifies with stock tooling — no ctms-core
software required:

```sh
cd <package> && shasum -a 256 -c manifest.sha256
```

The exporter re-hashes every blob as it copies and exits non-zero on any
mismatch, missing file, or broken audit chain. The package is versioned by
its `format` marker (`ctms-core-tmf-export/1`).

Adding `--ems <agreement-id>` (ADR-0024) includes a CDISC eTMF-EMS v1.0.2
`exchange.xml`, validated against the official schema (vendored at
`tools/ems/`) before the export claims success. The agreement id is the
SPECIFICATIONID of the exchange agreement between the transferring parties;
there is no default. It requires the verbatim TMF RM import
(`pnpm db:import-tmf`), which records the model version and the per-artifact
unique IDs the standard mandates — the export refuses, naming every gap,
rather than invent them.

## Receiving a partner's TMF

The other direction (ADR-0025): `pnpm import-ems -- --package <dir>` reads a
partner's eTMF-EMS package and files it through the same audited endpoint
every source system uses (ADR-0011), authenticating with an `ingest`-role
token (`--token` or `CTMS_API_TOKEN`; dev: `dev-service-token`). It performs
the standard's receiving-side checks first — XSD validation, checksum
verification of every referenced file — and refuses the whole batch, naming
every blocker at once, if anything cannot be mapped honestly: unknown TMF RM
unique IDs, sites that don't exist on the study, country-level or RESTRICTED
objects. Everything that files lands `pending_review` for human review, and
re-running the same package is a no-op — the importer asks
`GET /studies/{id}/filings` what it already filed. `--dry-run` prints the
plan without filing; keep the received package as the partner's record — its
signatures and audit trail are their testimony and are not replayed here.

## Backups and verification

- Postgres: continuous archiving or the managed service's PITR; test restore
  before go-live. A restored copy must pass
  `SELECT * FROM ctms_verify_audit_chain()` (empty result = intact) — that is
  the tamper-evidence check, and it works on backups too.
- Object storage: versioned + locked already; replicate per your DR policy.
  Blobs are content-addressed, so a restore can be verified byte-for-byte
  against `document_version.sha256`.
- Local storage driver (non-WORM pilots only): `infra/backup.sh` takes the
  database dump and the blob directory as a pair under one timestamp;
  restore instructions are in its header.
- Schedule `GET /audit-chain/verify` (any grant holder) or the SQL function
  from cron/monitoring so chain integrity is exercised continuously, not just
  available.
