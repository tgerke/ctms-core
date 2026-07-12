# ctms-core

Sponsor/CRO-side regulatory-document backbone for clinical trials. Compliance
(21 CFR Part 11) is enforced in the Postgres schema — triggers, immutability,
hash-chained audit — not in app code. Design docs in `docs/`, decision log in
`docs/decisions/` (read the ADRs before changing anything they cover).

## Commands

```sh
pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev   # full stack
pnpm test                    # vitest, needs Postgres (and MinIO for s3 tests)
pnpm typecheck
pnpm validation:iq           # installation qualification vs the live env
pnpm validation:artifacts    # OQ report + traceability matrix (runs the suite)
pnpm db:import-tmf -- file.xlsx   # official CDISC TMF RM spreadsheet, verbatim
pnpm digest                  # oversight digest email per study (ADR-0017)
pnpm export-tmf -- --study CORC-2201   # verifiable transfer/inspection package (ADR-0020)
pnpm export-tmf -- --study CORC-2201 --ems <agreement-id>  # + eTMF-EMS exchange.xml; needs db:import-tmf first (ADR-0024)
pnpm import-ems -- --package <dir>   # file a partner's eTMF-EMS package via the API; needs a running API + ingest token (ADR-0025)
pnpm db:extract-text         # backfill content search text for pre-existing versions (ADR-0022)
```

API :8787, web :5173, Postgres :5433, MinIO :9000, mailpit SMTP :1025 /
UI :8025 (docker compose).

## Constraints that will bite you

- `.env` must set `AUTH_MODE` (`dev` or `oidc`) — the API refuses to boot
  without it. Dev tokens `dev-admin-token` / `dev-monitor-token` /
  `dev-site-token` map to seeded people by email; the site token is the
  site-scoped seat (ADR-0023), so most study-wide endpoints 403 for it.
- Re-seeding regenerates all UUIDs; never cache ids across seeds. `pnpm db:seed`
  truncates — never run it against a real deployment.
- Versions, signatures, and audit events are immutable at the DB level, so API
  tests cannot clean up after themselves (by design). Tests use the dedicated
  `99.99.99` fixture artifact; reset demo state with `pnpm db:seed`.
- The API always connects as the DML-only `ctms_app` role (migration 0004).
  If a runtime query needs DDL or TRUNCATE, the design is wrong.
- Signing requires `reauth_token` in the request body (§11.200) — keep every
  documented sign example consistent with this.
- Per-visit document uploads must pass `forceNew`, and approval's
  supersede-siblings step exempts visit-linked documents (see ADR-0006).

## LLM-practice rules (these are logged ADRs, not preferences)

- **Never generate TMF taxonomy content from model memory** (ADR-0005). The
  importer loads the official CDISC Excel verbatim; the licensed file is never
  vendored into the repo.
- **Never hand-edit `docs/validation/`** (ADR-0010) — those files are generated
  by `pnpm validation:artifacts` / `validation:iq` from live runs.
- **Never write regulatory specifics from model memory** (ADR-0012). Any GAMP 5, Part 11,
  ICH, or CDISC-specific claim in docs must be verified against the full texts
  in `~/claude-clinical-skills/sources/`, citing the section (e.g. GAMP 5
  2nd ed. Appendix M4). A plausible from-memory GAMP claim has already been
  caught subtly wrong once.
- Compliance claims in docs must never run ahead of the code. When a control
  ships, update `docs/03-compliance.md` and its mirror
  `docs-site/compliance.qmd` together, and keep the "honest gaps" list honest.

## Docs

`docs/*.md` and `docs-site/*.qmd` deliberately overlap; a change to one usually
needs the other. Rebuild the site with `quarto render` in `docs-site/`
(rendered `_site/` is gitignored). Screenshots regenerate via
`docs-site/screenshots.mjs` against a freshly seeded stack (ADR-0007).
