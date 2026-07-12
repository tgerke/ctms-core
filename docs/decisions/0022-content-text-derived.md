# ADR-0022: Content full-text search is derived text of immutable bytes

Date: 2026-07-12. Status: accepted.

## Context

Metadata search (ADR-0019) finds what a document *is* — its title, artifact,
site, person — but not what it *says*. "Find the plan that covers temperature
excursions" still meant opening PDFs. ADR-0019 deliberately scoped content
full-text out and named the property that would make it safe to add later:
versions are immutable, so extracted text of a version's bytes can never go
stale.

The failure mode to avoid is the same one ADR-0019 was written against: a
search index as independent state that drifts from the record. The second
failure mode is specific to content: treating derived text as part of the
regulated record, dragging an OCR-grade artifact into the audit chain and
immutability rules it does not belong in.

## Decision

1. **Extracted text is content-addressed, like the blobs.**
   `document_content_text` has one row per `sha256` — the same key as the
   blob store. The extracted text of a hash is a pure function of bytes that
   cannot change, so the table needs no sync logic, no invalidation, and no
   re-extraction on upload of identical content.
2. **It is derived state, deliberately outside the audited record.** No audit
   trigger, no immutability trigger: the record is the bytes and their hash;
   the text is rebuildable from them at any time (`pnpm db:extract-text`,
   idempotent). Auditing a rebuildable cache would only pad the hash chain.
3. **Extraction happens at upload and never blocks it.** `uploadDocument`
   extracts right after the blob is stored (PDF via unpdf/pdf.js, `text/*`
   via UTF-8 decode); any other type is recorded as `unsupported` and a
   parse error as `failed` — honest rows, not silent gaps. A failed
   extraction still uploads the document; the backfill retries stragglers.
   The seed runs the backfill because it inserts versions directly.
4. **Search semantics stay ADR-0019's, with a wider haystack.**
   `v_document_search` gains a `content_text` column (each document's
   versions' extracted text); every query token must now match the metadata
   haystack *or* the content. Still substring AND, still no ranking model,
   still one view queryable by `ctms_readonly`. The API adds
   `matched_in_content` and a `content_snippet` (context around the first
   content match, preferring tokens the metadata alone would not explain);
   the full text stays SQL-only.

## Consequences

- "Find the plan that covers temperature excursions" is now typing
  "temperature excursion" — from the UI, the API, or SQL.
- Scanned image-only PDFs extract to empty text: recorded, searchable by
  metadata only. OCR is a deliberate non-feature until a pilot needs it.
- Extraction is synchronous in the upload request — fine at probe scale,
  measured before pilot scale, same posture as the sequential-scan search
  (ADR-0019's generated-column FTS path now covers content too).
- `v_document_search` rows carry full document text, so `SELECT *` on it got
  heavy; select columns, or filter before you fetch.
