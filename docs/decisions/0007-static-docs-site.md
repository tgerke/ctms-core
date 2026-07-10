# ADR-0007: Quarto docs site with static code examples, verified against the route definitions

**Status**: accepted · 2026-07-09

## Decision

The user-facing docs site (`docs-site/`) is a Quarto website whose code examples
are plain fenced blocks — displayed, never executed. The GitHub Actions workflow
that publishes to Pages therefore needs only Quarto: no R, no Node, no database.
It must render with `docs-site` as the working directory (from the repo root,
Quarto's dotenv support finds `.env.example` and fails on the missing variables).

## Rationale

- Executing the R/Python examples in CI would require the full stack
  (docker-compose Postgres, migrate, seed, API) inside the Pages workflow —
  slow, flaky, and a lot of machinery to typeset code blocks.
- The drift risk that live execution would catch is instead mitigated at
  writing time: every example was checked against the route definitions in
  `apps/api/src/app.ts` and the views in the migrations, not written from
  memory. (Logged per the LLM-practice transparency policy: verification
  against source is the hallucination control here.)
- The choice is reversible per page: switching a fence to `{r}` opts that page
  into knitr execution whenever a live-CI setup becomes worth its cost.

## Consequences

- API changes can silently stale the docs examples; touching a route or view
  should include a grep through `docs-site/` for its name.
- The app screenshots in `docs-site/images/` are equally static and go stale
  when the UI changes. `docs-site/screenshots.mjs` regenerates them against
  the running seeded stack (headless Chrome over CDP, no extra dependencies);
  it looks its subjects up via the API because seeding regenerates UUIDs.
- The docs build stays fast and dependency-free, and contributors can render
  the site with nothing but Quarto installed.
