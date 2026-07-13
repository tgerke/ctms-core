# ADR-0031: Single-VM production shape, Caddy for TLS, thin infra-as-code

**Status**: accepted · 2026-07-12

## Decision

The supported production shape is one VM running `infra/compose.prod.yaml`:
pinned GHCR images (ADR-0029), Caddy terminating TLS as the only published
service, and the bring-up order from `docs/05-deployment.md` wired in —
db → migrate one-shot (owner role; also rotates `ctms_app`/`ctms_readonly`
passwords from `.env` via `pnpm --filter @ctms/db rotate-passwords`) →
api (`DATABASE_URL_APP`, `AUTH_MODE` still mandatory) → web. Caddy fronts
the web container only; the web nginx keeps owning `/api/*` routing.
Compose profiles express the supported variations: `local-db` (bundled
Postgres vs. managed) and `s3-local` (bundled MinIO vs. a real bucket).
Infrastructure-as-code stays thin and VM-shaped: provider-agnostic
cloud-init plus sibling Terraform roots per cloud that provision
VM/firewall/volume and delegate app install to that same cloud-init. No
Kubernetes at this phase; the same posture as the sibling edc-core repo
(its ADR-0011).

## Rationale

- Single-tenant pilots (ADR-0001) don't need an orchestrator; they need the
  prose checklist in `docs/05-deployment.md` turned into artifacts an
  operator can run and `pnpm validation:iq` can verify.
- Encoding the migrate/rotate step in compose keeps the owner credential
  out of the long-running api's role by construction, instead of by SOP.
- "Where do I run this?" is an adoption barrier; a compose file plus a DNS
  record is an answer, and it is the same answer as edc-core's, which
  matters for orgs installing both.

## Consequences

- `packages/db` gains `rotate-passwords` (idempotent ALTER ROLE from env);
  the deployment doc's manual `ALTER ROLE` snippet remains the reference for
  operators who prefer SQL.
- The local storage volume is now a first-class deployment target for
  non-WORM pilots; `infra/backup.sh` pairs it with the database dump. The
  Object Lock posture is unchanged and remains the recommendation.
- The dev flow (root `docker-compose.yml` for dependencies, `pnpm dev` on
  the host) is untouched.
