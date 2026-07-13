# Feature gaps and roadmap

What a team gets from an incumbent CTMS or eBinder that this system does not
yet give them. The comparison was checked against the vendors' own public
documentation rather than assumed: Veeva Vault eTMF (sponsor/CRO-side eTMF),
Medidata CTMS (clinical operations), Florence eBinders (site-side
eBinder/eISF), and the CDISC eTMF Exchange Mechanism Standard for interchange.
Sources with access dates are listed at the bottom (ADR-0014).

Two ground rules for reading this page:

- **A gap is not a commitment.** This project is a product probe; the list
  below is an honest accounting of distance, not a delivery schedule.
- **A boundary is not a gap.** Several things incumbents sell are things this
  system has decided not to do. Those are restated first so the gap list
  stays clean.

## Deliberate boundaries (not gaps)

Recorded in docs/01-vision.md and the decision log; restated here because a
feature comparison is meaningless without them.

- **Subject-level clinical data.** The EDC owns it. Documents and as-reported
  aggregates come in through the filing interface (ADR-0011); subject data
  never does. Incumbent CTMS suites advertise EDC-populated enrollment and
  cross-system data flow; here the boundary is the feature.
- **Site payments and budgeting.** Medidata sells site payments as a CTMS
  module you can switch on. A non-goal here (docs/01-vision.md): payments are
  an accounting workflow, not a regulatory-document one.
- **eConsent.** Non-goal; consent form versions are filed as documents, the
  consenting workflow itself belongs elsewhere.
- **Expedited safety reporting.** Pharmacovigilance systems own SAE
  processing and regulatory submission clocks. Safety concerns at a site are
  recorded here as issues (dated facts, derived status) and safety
  correspondence files as documents — oversight, not case processing.
- **The validation program.** The software generates its raw material (IQ/OQ
  reports, traceability matrix — ADR-0010); SOPs, risk assessment, and
  training are the deploying organization's work (docs/03-compliance.md,
  honest gap #1).
- **Multi-tenancy and blinded-role scoping** are current-phase non-goals:
  pilots deploy single-tenant (docs/05-deployment.md), and no role yet hides
  unblinded material. Florence ships in-app PHI redaction; nothing comparable
  exists here yet, and won't until a blinded seat is designed.

## Closed since first written

- **Review outcomes beyond approval** — shipped as return-for-correction
  (ADR-0015): a reviewer sends a pending version back with a required,
  immutable reason; the document shows `returned` until a corrected version
  reopens review, and the returned version can never be approved. What
  remains of the original gap is the narrower QC tooling incumbents layer on
  top (checklists, tracked quality-issue workflows à la Veeva) — real, but no
  longer the daily-use hole.
- **Study, site, and staff administration** — shipped as the admin write
  surface (ADR-0016): organizations, sites, study-site activation, people,
  role assignments, access grants, and requirement rules are all creatable
  through the API and the admin page, with endings as dated facts and every
  step in the audit trail. What remains is the startup *workflow* incumbents
  layer on top (Medidata's site-specific startup milestones and task
  checklists) — the write surface exists; the guided process does not.
- **Expected-document waivers** — shipped as waiver fact rows (ADR-0016): an
  admin records why an expected document is not applicable; the row shows
  `waived` instead of `missing`, leaves the completeness denominator, and a
  filed document always wins over the waiver. Lifting a waiver is itself a
  recorded fact, never a delete.
- **Notifications and scheduled reports** — shipped as the stateless digest
  job (ADR-0017): `pnpm digest`, run from cron at whatever cadence the team
  wants, emails each study's expiring/expired documents, overdue visits,
  action items, issues, and milestones — with a broken audit chain leading
  the message — to everyone holding study-wide admin/trial-ops access. What
  remains is the per-user subscription and flash-report scheduling UI
  incumbents ship (Veeva's any-frequency flash reports); the daily-use hole
  — nothing emails anyone — is closed.
- **Task assignment and review queues** — shipped as review assignments with
  a derived queue (ADR-0018): a pending version is assigned to a named
  reviewer with a due date, "my work" is a filter on `v_review_queue`, and
  the assignment resolves itself when the version is approved or returned —
  no completion state exists to drift. Overdue assignments join the digest.
  What remains is the multi-step named workflow engines incumbents ship
  (route to A, then B, then C); this system deliberately commits to two
  review outcomes per version.
- **Document search** — shipped as a metadata query over `v_document_search`
  (ADR-0019): every word must match the document's title, artifact taxonomy,
  site, person, uploader, file names, or filing source — "1572 003" finds
  site 003's Form FDA 1572, from the UI header, the API, or read-only SQL.
  No index to drift: search is a query over the record. What remains is
  Excel export of result sets.
- **Content full-text search** — shipped as derived text of immutable bytes
  (ADR-0022): every version's text is extracted at upload (PDF and `text/*`;
  failures recorded, never blocking) into a table keyed by the same content
  hash as the blob store, deliberately outside the audited record and
  rebuildable any time with `pnpm db:extract-text`. Search tokens now match
  metadata *or* content, and results carry a snippet of the content match.
  What remains is OCR for scanned image-only PDFs and relevance ranking —
  results still order by latest upload.
- **TMF transfer and inspection export** — shipped as a verifiable package
  (ADR-0020): `pnpm export-tmf` writes every document version's
  content-addressed bytes, the full metadata (signatures with their §11.70
  hashes, returns, waivers, completeness snapshot), and the entire
  hash-chained audit trail, with a `shasum -c` compatible manifest — a
  flipped byte fails verification with stock tooling. Initially shipped
  without CDISC eTMF-EMS output (the EMS text was not yet in the verified
  source library — ADR-0012); the remainder, purpose-built in-app auditor
  UX, closed as ADR-0028.
- **eTMF-EMS serialization** — shipped as a schema-validated layer over the
  export package (ADR-0024): `pnpm export-tmf -- --study <p> --ems
  <agreement-id>` adds an exchange.xml (eTMF-EMS v1.0.2) validated against
  the official XSD on every export. The three facts the standard demands
  that the schema didn't carry — TMF RM unique IDs, the model version, site
  countries — arrive via the verbatim importer and the admin surface, never
  from model memory: export refuses, listing every gap, until
  `pnpm db:import-tmf` has loaded the licensed spreadsheet. The import side
  followed as ADR-0025.
- **eTMF-EMS import** — shipped as a client of the filing interface
  (ADR-0025): `pnpm import-ems -- --package <dir>` performs the standard's
  receiving-side checks (XSD validation, checksum verification, spec §4.1),
  maps artifacts by TMF RM unique ID against the verbatim-imported taxonomy
  — never invented — and files every object through the same audited
  endpoint any source system uses (ADR-0011), as an `ingest` machine
  identity. Iterations thread onto one document by provenance, re-runs are
  no-ops (`GET /studies/{id}/filings` is the idempotency read), everything
  lands `pending_review`, and the partner's signatures and audit records
  stay in the retained package rather than being replayed into this record.
  The bulk-review surface followed as ADR-0026.
- **Bulk review** — shipped as a series of signings (ADR-0026): checkboxes
  on the review queue, and approval of the selection is one
  §11.200(a)(1)(i) ceremony — one re-authentication opens the series,
  every version still gains its own signature bound to its own content
  hash. Bulk return shares one immutable reason. All-or-nothing with every
  blocker listed, in one transaction, on the same code path as the
  single-document ceremony. The reviewer-ergonomics remainder (inline
  preview from the queue) closed as ADR-0027.
- **Queue-side document preview** — shipped as a scoped read of the signed
  bytes (ADR-0027): every queue row opens the version inline — the exact
  immutable bytes a signature would hash, never a derived rendition — over
  `GET /document-versions/{id}/content`, which resolves the version's
  study/site scope so the site seat previews only its own site. Reading
  what you are about to sign now costs one click on the same page as the
  ceremony. What remained — in-browser rendering for office formats — closed
  as ADR-0030; the broader auditor UX closed as ADR-0028.
- **In-app auditor UX** — shipped as a rendering of the record (ADR-0028):
  a binder page serving the study in the reference model's own zone →
  section → artifact order over one GET (`/studies/{id}/binder`, same
  derived views as every other surface, empty slots included), in-browser
  verification that re-fetches any version's bytes and re-hashes them
  against the recorded content hash and every signature bound to them
  (§11.70, demonstrated rather than displayed), and the read-only auditor's
  seat made real — seeded with `dev-auditor-token`, unscoped because pilots
  are single-tenant and the audit chain verifies end to end. The UI now
  renders every seat only the operations its grants hold, so the auditor
  works a clean surface instead of collecting 403s. Of what ADR-0027 left,
  office-format renditions closed as ADR-0030; OCR and relevance ranking
  remain.
- **Office-format preview renditions** — shipped as client-side renditions
  of the signed bytes (ADR-0030): the queue's preview now renders Word and
  Excel files as HTML computed in the viewer's browser — mammoth for docx, a
  small OOXML reader for xlsx — inside a fully sandboxed iframe, labeled
  "the downloaded file is the record." The server stores and serves nothing
  new, so no rendition exists anywhere to drift from the record, and byte
  verification (§11.70) keeps hashing fetched originals. What remains is OCR
  for image-only PDFs and relevance ranking; legacy .doc/.xls and
  presentations honestly stay download offers.
- **Site-seat log workflows** — shipped as structured facts on a site-scoped
  seat (ADR-0023): a `site_staff` grant lands its holder on their site's page
  and nowhere else, and delegation-of-authority and training logs are dated
  fact rows whose status is derived beside the document record — a delegation
  whose authorizer never held the PI role, or whose delegate's license has
  expired, flags itself. The signed DoA log document stays the authoritative
  Part 11 record. What remains of the original gap is the rest of the
  site-side catalog (screening logs, EMR-routed certified copies) and
  entry-level e-signatures on log rows.
- **Multi-study operation in the UI** — shipped as a persisted study
  switcher plus a portfolio page over `GET /portfolio` (ADR-0021): one
  rollup query across the same views the study dashboards read —
  completeness, attention items, review queue, issues, enrollment vs
  target per study — with a second seeded study (CORC-2202) so the
  contrast is real. What remains is cross-study *analytics* (trends,
  custom dashboards à la Medidata Visual Analytics) and a grant-aware
  study switcher; the rollup numbers are already on the API and in SQL for
  anything downstream.

## Genuine gaps

### Site-side depth beyond the first logs

The site seat now exists (ADR-0023), but Florence still ships more of the
coordinator's day: screening logs, certified copies routed from the EMR,
entry-level e-signatures on log rows, and in-app PHI redaction. The seat's
schema is shared with oversight, so each of these is an increment, not a
new system.

## If we built next

Nothing is queued: office-format preview renditions, the last candidate
pulled from the "what remains" notes, shipped 2026-07-12 (ADR-0030).
Remaining candidates live in the notes above — site-side depth,
cross-study analytics, OCR for scanned documents.

## Sources

Vendor and standards pages verified 2026-07-10 (ADR-0014):

- Veeva, "Top 28 Vault eTMF Features to Drive Inspection Readiness" —
  https://www.veeva.com/blog/top-28-vault-etmf-features-to-drive-inspection-readiness/
- Medidata CTMS product page —
  https://www.medidata.com/en/clinical-trial-products/clinical-operations/ctms/
- Florence eBinders product page — https://www.florencehc.com/products/ebinders/
- Florence eBinders FAQ — https://www.florencehc.com/florence-ebinders-faq/
- TMF Reference Model, "Exchange Mechanism Standard" — https://tmfrefmodel.com/ems
- CDISC, "Exchange Mechanism" — https://www.cdisc.org/standards/exchange-mechanism

Added 2026-07-12 (ADR-0024): eTMF-EMS Specification v1.0.2 and the official
XSD are in the verified source library
(`~/claude-clinical-skills/sources/CDISC/TMF/`, hashes in its manifest); the
public-domain XSD is vendored at `tools/ems/`.
