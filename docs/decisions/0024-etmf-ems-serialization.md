# ADR-0024: eTMF-EMS exchange.xml is a serialization over the export package, with nothing invented

Date: 2026-07-12. Status: accepted.

## Context

ADR-0020 shipped the verifiable transfer package and deliberately did not
claim CDISC eTMF-EMS conformance: the standard's text was not in the
verified source library, and per ADR-0012 this project does not write a
standard's file layout from model memory. That unblocked today: the
eTMF-EMS Specification v1.0.2 (21-Jan-2022) and the official XSD
(github.com/TmfRef/exchange-framework) are now in
`~/claude-clinical-skills/sources/CDISC/TMF/` with hashes and provenance.
Unlike the licensed TMF RM spreadsheet (ADR-0005), the EMS materials are
published in the public domain, "free for use by anyone for any purpose
without restriction" (spec front matter; tmfrefmodel.com/about/ipr/), so
the XSD is vendored at `tools/ems/` for validation.

Reading the actual text vindicated ADR-0012 twice over: the normative XSD
spells two element names differently from the spec's own tables —
`RENTENTIONDATE` (spec §5.3.2 says RETENTIONDATE) and `USEROID` (§5.3.4
says USERID) — and types `UNIQUEID` as `xs:int`. A from-memory serializer
would have produced plausible XML that no receiving system validates.

## Decision

1. **`pnpm export-tmf -- --study <p> --ems <agreement-id>` adds
   `exchange.xml` to the ADR-0020 package.** One `<OBJECT>` per document
   version (spec §5.2: OBJECTVERSION identifies the iteration), one
   `<FILE>` per object pointing into the existing content-addressed
   `files/` tree. §5.1 makes the folder layout agreement-defined, so the
   checksums-as-filenames layout stands; `<INTEGRITY>` carries the same
   sha256 in the SRI format §5.3.3 cites.
2. **The three EMS-mandatory facts the schema lacked arrive via tooling,
   never from model memory** (migration 0013): `tmf_artifact.unique_id`
   (the TMF RM "Unique ID Number" column → `<UNIQUEID>`) and
   `app_meta.tmf_rm_version` (→ `TMFRMVERSION`) are written only by the
   verbatim importer; `site.country` (ISO 3166-1 alpha-3 → `<COUNTRYID>`)
   comes from the seed or the admin surface. Export with `--ems` refuses —
   listing every gap at once — when any referenced artifact lacks a unique
   ID, the model version is unrecorded, or a site lacks a country. The
   seeded illustrative subset (ADR-0005) carries no unique IDs by design,
   so EMS output requires `pnpm db:import-tmf` first.
3. **The XSD is the conformance target, validated on every export** (spec
   §4.1) via `xmllint --schema` against the vendored official schema; a
   validation failure fails the export. Where the spec's tables and the
   XSD disagree, the XSD wins (RENTENTIONDATE, USEROID).
4. **Status mapping is lossless.** `OBJECTVERSIONSTATE`: older iterations
   and superseded documents → Superseded; the latest iteration of a
   returned document → Obsolete; otherwise Current. The exact ctms-core
   status, original filename, and ADR-0011 provenance ride in `<METADATA>`
   tags — the agreement-defined extension point §5.3.6 exists for.
5. **Audit records in exchange.xml are file-scoped** — events on the
   version row and on rows referencing it (signatures, returns), since
   `<AUDITRECORD>` is a child of `<FILE>`. The full hash chain still
   travels whole in `audit-trail.jsonl` (ADR-0020 #3); exchange.xml
   inventories, the package proves.
6. **SPECIFICATIONID is the operator's statement, not a default.** §4.3
   expects parties to hold an exchange agreement; the `--ems` argument is
   its identifier and there is no fallback value — an export cannot claim
   an agreement nobody made.

## Consequences

- "Hand the TMF to a successor system" now speaks the industry
  interchange standard: `shasum -c` verifies the bytes, `xmllint --schema`
  verifies the inventory, and both ship inside the package.
- `documents.json` remains the richer record (waivers, returns, review
  history); exchange.xml is the interoperable subset plus `<METADATA>`.
- A fresh demo database cannot produce EMS output until the licensed
  spreadsheet is imported — that is the honest cost of never inventing
  taxonomy facts (ADR-0005), and the refusal message says exactly this.
- Importing over the seed relabels illustrative artifacts with the official
  names for their codes (the model owns the code space; e.g. the subset's
  05.02.01 "Curriculum Vitae" is officially "Acceptance of Investigator
  Brochure"), so demo documents can land under differently-named artifact
  types afterward — reseed to return to the subset. The test suite runs
  against seed state and is unaffected.
- Sites created before this change have no country; the admin create-site
  call accepts one, but there is no site-edit surface yet — backfill is a
  SQL statement away and the export names the sites that need it.
