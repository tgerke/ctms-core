# ADR-0033: The docs site moves from Quarto to Astro Starlight

**Status**: accepted · 2026-07-23 · supersedes the tooling choice in ADR-0007

## Decision

The user-facing docs site is rebuilt as an Astro Starlight project in `site/`,
replacing the Quarto project in `docs-site/`. Pages convert from `.qmd` to
Markdown/MDX with every slug preserved, and the old `.html` URLs redirect
through static stubs in `site/public/`. The visual system maps the app chrome
palette from `apps/web/src/index.css` onto Starlight's theme variables, with
the app's info blue as the accent, mirroring how the sibling edc-core styled
its site after its own chrome.

ADR-0007's principles carry over unchanged: code examples are fenced blocks
that are displayed, never executed; screenshots come only from the script
(now `tools/screenshots.mjs`, writing to `site/src/assets/screenshots/`); and
ADR-0013's two-audience split, with the user guide living only on the site,
stands as written.

## Rationale

- The docs are part of the product probe. They should read like the docs of
  the commercial systems the roadmap benchmarks against (Florence, Veeva
  Vault), and edc-core made the same Quarto-to-Starlight move for the same
  reason. A shared design system with a per-product palette keeps the two
  recognizable as one stack.
- Starlight ships product-docs furniture that Quarto's website mode lacks or
  only approximates: a splash landing page, grouped sidebar navigation,
  code tabs, Pagefind search, build-time image optimization, and an
  internal-link validator that fails the build on broken links instead of
  shipping them.
- This supersedes ADR-0007's tooling choice, not its argument. The reasons to
  keep examples static are unchanged, and the Pages build still needs no R
  and no database, only Node and pnpm.

## Consequences

- `site` is a pnpm workspace member. `pnpm --filter site dev` previews,
  `pnpm --filter site build` builds; `site/dist/` is gitignored and CI builds
  it fresh for every deploy.
- The compliance mirror pairing is now `docs/03-compliance.md` and
  `site/src/content/docs/compliance.md`.
- The data-model ER diagram renders client-side from the bundled Mermaid
  package, so that one figure needs JavaScript in the reader's browser; the
  rest of the site works without it.
- Quarto-era `.html` URLs keep working through meta-refresh stubs, one per
  old page, because the slugs were preserved one-to-one.
