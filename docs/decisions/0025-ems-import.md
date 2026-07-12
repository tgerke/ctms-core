# ADR-0025: EMS import is a client of the filing interface, and nothing is replayed

Date: 2026-07-12. Status: accepted.

## Context

ADR-0024 shipped the producing side of CDISC eTMF-EMS v1.0.2; the roadmap's
remaining half was reading a partner's `exchange.xml` into this system. The
spec's receiving-side obligations are short and explicit: perform the same
checks the producer performed — XML validation against the official XSD and
checksum verification — then "file them against the relevant TMF RM artifact
numbers" (§4.1), mapping primarily by the TMF RM Unique ID Number, which
"never changes and ... is considered the primary method for mapping
artifacts" (§3.2.1).

ADR-0011 already decided what ingestion looks like here: source systems file
through the same audited multipart endpoint people use, as machine
identities holding the `ingest` role, with provenance on every version. An
importer with its own database path would un-decide that.

## Decision

1. **`pnpm import-ems -- --package <dir>` is an API client, not a second
   ingestion path.** It authenticates like any partner integration (dev:
   `dev-service-token`), reads its context over the documented API, and
   files each object through `POST /documents` / `POST
   /documents/{id}/versions`. Everything lands `pending_review` with the
   full audit attribution of ADR-0011: automation feeds the TMF; a human
   still blesses it.
2. **The §4.1 receiving checks run before anything is filed, and refusal is
   all-or-nothing.** The XML must validate against the vendored official
   XSD (a missing `xmllint` downgrades to the parser's structural checks; a
   validation failure refuses), every referenced file's SRI checksum
   (sha256/384/512) must match its bytes, and every mapping blocker across
   the whole batch is reported at once — the ADR-0024 pattern. A batch that
   is half-importable is not importable.
3. **Mapping is by UNIQUEID against the verbatim-imported taxonomy, never
   invented** (ADR-0005/0012). An unknown UNIQUEID refuses; a taxonomy with
   no unique IDs at all refuses with the `pnpm db:import-tmf` message. When
   ARTIFACTNUMBER disagrees with the imported taxonomy's code for that
   UNIQUEID — TMF RM version drift between the parties — UNIQUEID wins and
   the drift is warned, which is exactly why the spec made it primary.
4. **Objects the schema cannot honestly hold are refused, not approximated.**
   Country-level objects (no country scope exists), `RESTRICTED=Yes`
   objects (no restricted/blinded seat exists — filing one would silently
   drop a restriction the partner declared), and multi-`<FILE>` objects
   (one record file per version here). `PERSONNAME` is never guessed into a
   `person_id`: a name is not an identity, so the document files without a
   person scope, with a warning.
5. **Provenance threads iterations and makes re-runs no-ops.** Each version
   files with `source_system` = TRANSFERSOURCEID and `source_ref` =
   `OBJECTID:OBJECTVERSION`. The first iteration of a new object creates
   its own document (`force_new` — a partner record is never merged into a
   local one); later iterations append to that document, across batches.
   New endpoint `GET /studies/{id}/filings?source_system=` is the read half
   of idempotency — any filing system can ask what it already filed — so an
   identical re-send is skipped and a same-`source_ref` re-send with
   different bytes refuses: versions are immutable, the partner must issue
   a new OBJECTVERSION.
6. **Nothing of the partner's record is replayed into this one.** Their
   `<SIGNATURE>` and `<AUDITRECORD>` assertions, and their
   OBJECTVERSIONSTATE lifecycle, stay in the retained package: signatures
   are a ceremony this system witnesses, not a fact it copies (§11.200,
   ADR-0011), and status here is derived from local facts (ADR-0004/0006).
   The audit chain records the filings it saw; `<METADATA>` and the package
   remain the partner's testimony.

## Consequences

- Round-trip closes: `pnpm export-tmf --ems` → `pnpm import-ems` re-files a
  study's every version through the audited endpoint, idempotently — the
  demo is its own integration test, and the API tests run the same plan
  against the live filing surface.
- The API grew four additive pieces any integration can use: `force_new` on
  `POST /documents`, `POST /documents/{id}/versions`, `GET
  /studies/{id}/filings`, and `unique_id` on `GET /tmf-artifacts`.
- A superseded document refuses new versions at the API level — closed
  history stays closed; the importer surfaces that as a batch blocker.
- Imported documents double the reviewer's queue by design: nothing becomes
  effective without a human. A future bulk-review surface is roadmap work,
  not a reason to auto-bless.
- The importer needs a running API and an `ingest`-role token; it reads
  nothing from the database directly. That is the point: any partner could
  implement the same client against the OpenAPI spec.
