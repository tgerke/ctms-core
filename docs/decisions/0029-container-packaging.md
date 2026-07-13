# ADR-0029: Container packaging — two GHCR images, api image runs migrations

**Status**: accepted · 2026-07-12

## Decision

Tagging `vX.Y.Z` publishes two OCI images to GHCR
(`ghcr.io/tgerke/ctms-core-api`, `ghcr.io/tgerke/ctms-core-web`), mirroring
the sibling edc-core release pipeline. The api image is a tsx runtime (no
compile step) that contains the full `@ctms/db` package; it therefore doubles
as the one-shot migrate/seed runner in deployments. The web image is a
multi-stage Vite build served by nginx, which also owns the `/api/*` reverse
proxy (`API_PROXY_TARGET`), replicating the Vite dev proxy contract.

Migrations are **not** run at api boot. A deployment runs an explicit
one-shot container (`pnpm --filter @ctms/db migrate`) with the owner-role
`DATABASE_URL`, then starts the api, which connects only as the DML-only
`ctms_app` role via `DATABASE_URL_APP`.

## Rationale

- The api process cannot self-migrate even in principle: migration 0004 gives
  it a role with no DDL. Boot-time migration would require handing the owner
  credential to the long-running, network-exposed process, undoing that
  separation. The explicit migrate step keeps the owner credential confined
  to a container that exits.
- One image for api + migrate/seed avoids a third artifact whose contents
  would be a strict subset of the api image, and guarantees the migration
  code version always matches the api code version in a pinned deployment.
- tsx-at-runtime matches how the api already runs everywhere else (dev, CI);
  introducing a compile step only for the container would create a
  packaging-only code path.

## Consequences

- A production compose topology (not yet in the repo; this bullet originally
  pointed at a planned deployment ADR whose number was later taken by office
  renditions) sequences db → migrate (one-shot) → api via
  `depends_on: service_completed_successfully`.
- The api image is larger than a compiled bundle would be (ships
  devDependencies like tsx). Accepted at pilot scale.
- `pnpm db:seed` becomes trivially runnable in production topology
  (`docker compose run migrate pnpm --filter @ctms/db seed`) — the existing
  rule that seed must never run against a real deployment now applies to a
  one-liner. The prod env template and deployment docs carry the warning.
- Image versioning follows git tags; deployments pin exact versions.
