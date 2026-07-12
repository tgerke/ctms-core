# ADR-0021: Multi-study is a rollup query and a selection, not a second system

Date: 2026-07-12. Status: accepted.

## Context

The schema was multi-study from day one; the web app assumed the first
study returned. Cross-study portfolio views are a standard CTMS selling
point, and the derived-status design means a portfolio is just a grouping
of the same views the per-study pages read — there was nothing to build
except the query and the selection.

## Decision

1. **`GET /portfolio` is one query over the existing views**: per study,
   completeness counts (from `v_expected_document_status`), open issues,
   overdue visits, review-queue size, and enrollment vs target — plus a
   `pct_current` that excludes waived rows, matching the per-site rollup's
   semantics. No portfolio tables, no aggregation jobs; the page can never
   disagree with the study dashboards because it reads the same derived
   truth.
2. **Study selection is client state**: a header switcher persisted in
   `localStorage` (like the theme), falling back to the first study when
   the stored id is stale — re-seeds regenerate ids, and the fallback makes
   that harmless. Deep links to documents and visits resolve by their own
   ids regardless of the selected study; site pages resolve within the
   selected study.
3. **The portfolio page is the cross-study seat**: one card per study with
   the oversight numbers and an "open dashboard" action that switches the
   selection. Read permission suffices, same posture as `GET /studies`.
4. **The seed grows a second study** (CORC-2202, a Phase 1b in startup,
   sharing two physical sites with CORC-2201) so the switcher and
   portfolio demonstrate against a real contrast instead of a list of one.
   Study-scoped isolation is asserted in tests: 2202's expected documents,
   queue, and digest are exactly its own.

## Consequences

- The digest already iterated studies; it now visibly sends one email per
  study (CORC-2202's opens "all clear"). Export, search, queue, and admin
  surfaces were study-scoped already and needed nothing.
- Test files that located "the study" with `LIMIT 1` now pin
  `protocol_number = 'CORC-2201'` — with two studies, unordered `LIMIT 1`
  was nondeterministic.
- Access grants already scope to a study; the UI does not yet hide
  non-covered studies from the switcher (the API answers 403 on their
  data). A grant-aware study list is small follow-up work if a pilot
  needs it.
- What remains of the incumbents' portfolio story is cross-study
  analytics (trend charts, custom dashboards à la Medidata Visual
  Analytics); the rollup numbers exist for anything downstream via the
  API or SQL.
