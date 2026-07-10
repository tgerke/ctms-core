# ADR-0001: Build for the sponsor/CRO oversight seat

**Status**: accepted · 2026-07-09

## Decision

The system's center of gravity is sponsor/CRO-side oversight across many sites (eTMF +
CTMS oversight), not the site coordinator's day-to-day binder (eISF).

## Rationale

- The relational questions that motivate the product (cross-site completeness, gaps,
  expirations) live in the oversight seat — PCCTC's own seat, so the demand is
  first-hand rather than hypothesized.
- Site-side eISF is crowded and commoditizing (Veeva SiteVault free tier; Florence
  incumbency). Sponsor-side oversight with a real data model and API is unoccupied.

## Consequences

Site-facing workflows (upload, sign) exist but are minimal; the demo persona is a
consortium/CRO monitor. A future site-facing surface would reuse the same schema —
site vs. sponsor is a permission scope, not a different data model.
