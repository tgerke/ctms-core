# ADR-0005: Seed an illustrative TMF Reference Model subset, not a from-memory copy

**Status**: accepted · 2026-07-09

## Decision

The seed contains ~40 hand-checked artifacts across the TMF RM's major zones, labeled
as an illustrative subset. We do not attempt to reproduce the full 249-artifact /
600-sub-artifact model from an LLM's memory.

## Rationale

Reproducing the official taxonomy from model memory risks hallucinated artifact
numbers/names — unacceptable in a regulated-domain tool. The official model is a free
CDISC download (Excel); a later importer can load it verbatim. (Decision logged per
the project's LLM-practice transparency policy: this is a deliberate hallucination-risk
mitigation.)

## Consequences

Zone/section/artifact numbering follows the official scheme so real data can replace
the subset without migration; demo rules and documents reference only seeded artifacts.

**Follow-through (2026-07-10)**: the verbatim importer landed as
`pnpm db:import-tmf` (`packages/db/src/import-tmf.ts`) — it parses the official
CDISC Excel and upserts by artifact number; per this ADR, no taxonomy content is
ever generated from model memory.

**Correction (2026-07-10, per ADR-0012)**: the "249-artifact / 600-sub-artifact"
figures in the Decision above were themselves written from model memory and are
not verified against any text in the source library (the v3.3.1 release notes
list only changes, not totals). The imported spreadsheet is the source of truth
for counts; docs elsewhere no longer state them.
