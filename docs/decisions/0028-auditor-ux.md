# ADR-0028: Auditor UX is a rendering of the record, not a module

Date: 2026-07-12. Status: accepted.

## Context

The roadmap's last standing candidate from ADR-0020's "what remains" was
purpose-built in-app auditor UX. The pieces an inspection needs were already
records: the reference-model taxonomy (ADR-0005), derived completeness
(ADR-0004), hash-chained audit events (ADR-0003), signatures bound to content
hashes (§11.70), and scoped byte reads (ADR-0027). What was missing was the
inspector's way *in*: the app navigated like an operations dashboard (sites,
visits, queues), not like a TMF; the §11.70 binding was displayed but never
demonstrated; and the "auditor's seat" the docs promised — a `read_only`
grant — had no demo occupant and rendered a UI full of buttons that could
only answer 403.

## Decision

1. **The binder is a read.** `GET /studies/{studyId}/binder` serves the study
   in the reference model's own hierarchy — zone → section → artifact — with
   each artifact carrying its filed documents and the expected/missing/waived
   rollup, computed from the same views every other surface reads. Every
   artifact of the loaded taxonomy appears, populated or not: an empty slot
   is information to an inspector, not noise. There is no binder table, no
   folder state, nothing to fall out of date; `/binder` in the web is a
   rendering of that one GET.
2. **Verification runs in the reader's browser.** Any version row offers
   "Verify bytes": the web fetches the version's content (ADR-0027),
   recomputes SHA-256 locally, and compares against the recorded content hash
   and every signature's `signed_sha256`. The §11.70 record↔signature binding
   is demonstrated on the exact served bytes, on demand, trusting neither the
   server's headers nor the UI's word. No new endpoint, no verification log —
   reads still leave no audit rows (unchanged from ADR-0027).
3. **The auditor's seat is seeded and unscoped.** `dev-auditor-token` maps to
   a seeded person holding one unscoped `read_only` grant: view everything,
   change nothing. Unscoped deliberately — pilots deploy single-tenant
   (docs/05-deployment.md) and the audit chain only verifies end to end
   (ADR-0020), so an inspector's live seat reads the whole deployment. A
   narrower engagement scopes the grant to a study; the mechanism (ADR-0008)
   already does both.
4. **The UI renders the seat's operations.** Write affordances — upload,
   approve/return, assignment checkboxes, waivers, admin forms, log entry
   forms — render only when the caller's grants include the operation, via a
   web-side mirror of the core role→operation map. This supersedes the
   ADR-0016-era posture ("actions render for everyone; the API's 403
   answers"): a seat defined by reading should read a clean surface, and a
   monitor should not see approval ceremonies it cannot perform. The API's
   permission gate remains the only enforcement; hiding is ergonomics.

## Consequences

- The inspector's three questions cost one click each on the live system:
  *what is here* (binder), *what happened to it* (per-document audit trail,
  ADR-0003), *are these the bytes that were signed* (in-browser §11.70
  verification) — and the offline answer stays `pnpm export-tmf` (ADR-0020).
- The binder over the seeded demo subset is illustrative; after
  `pnpm db:import-tmf` it is the full licensed reference model, verbatim
  (ADR-0005). Nothing in the binder is generated content.
- Grant-aware rendering tightened every seat, not just the auditor's: the
  monitor persona no longer sees assign/approve affordances, and the site
  seat's page-level scoping (ADR-0023) now composes with operation-level
  hiding. The test suite pins the auditor seat's reads and 403s.
- What remains, unchanged from ADR-0027: office formats preview as a download
  offer, and content search still lacks OCR and relevance ranking. The
  in-browser hash check verifies one version at a time by design — whole-TMF
  verification is the export package's job, where `shasum -c` covers every
  byte at once.
