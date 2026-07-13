# ADR-0027: Preview is a scoped read of the signed bytes

Date: 2026-07-12. Status: accepted.

## Context

Bulk review (ADR-0026) made the signature ceremony cheap for a series and
owned the rubber-stamp risk in one sentence: the surface makes diligence
cheaper, not optional. But diligence still cost a page per document — the
queue named the work, and reading a version meant leaving for its document
page and opening the file from there.

The file link had two quieter problems. `/files/{sha256}` is an unscoped
read: any authenticated reader holding a hash could fetch any blob, which is
broader than the site seat's page-level scoping (ADR-0023). And the web's
link to it was a plain `<a href>`, which cannot carry the bearer token — the
API answers such a request with 401, so the document page's download link
was dead (verified against the live stack before fixing). It also served
every blob as `application/pdf`, regardless of what was uploaded.

## Decision

1. **`GET /document-versions/{versionId}/content` is the read the UI uses.**
   It resolves the version to its study/site scope like every other
   version-addressed route, so a site-scoped seat can fetch exactly the
   documents it can already read about — no more. It serves the version's
   uploaded mime type, an `inline` disposition with the uploaded file name,
   and the content hash in an `x-content-sha256` header, so a client can
   verify what it received against the signature rows.
2. **There is no preview rendition.** The endpoint returns the exact
   immutable bytes every signature on the version hashes (§11.70 binding,
   ADR-0003) — no thumbnails, no converted copies, nothing derived that
   could drift from the record. The browser renders the original: PDFs,
   images, and text inline; anything else is offered as a download.
3. **The queue is the surface.** Each row gains a preview toggle; one panel
   is open at a time, so working the queue reads like paging through the
   stack. Reading what you are about to sign now costs one click, on the
   same page as the checkbox and the ceremony.
4. **The web fetches bytes with the session credential.** Browser-initiated
   loads (`<a href>`, `<iframe src>`) can't carry the bearer token, so every
   file view and download goes through an authenticated fetch and an object
   URL. This is also the fix for the document page's dead download link.
5. **`/files/{sha256}` stays, as the content-addressed copy surface** — the
   hash on a signature row is a retrieval key, which is worth keeping for
   inspection tooling. It now serves the uploaded mime type and file name
   instead of assuming PDF. The UI no longer uses it.

## Consequences

- The reviewer's loop — read, then sign — happens on one page, so ADR-0026's
  "diligence gets cheaper" claim is now built, not promised. The roadmap
  item closes.
- The site seat's boundary holds for bytes, not just metadata: content
  fetched by version id is checked against the seat's site scope, and the
  test suite pins that with the site token.
- Reads leave no audit rows, unchanged: the hash-chained trail records what
  happened to the record, not who looked at it. Preview adds no state
  anywhere — no "viewed" flag exists to disagree with anything.
- Non-renderable types (Word documents, spreadsheets) preview as a download
  offer, not inline. OCR'd or converted in-browser renditions remain
  deliberately unbuilt; showing anything but the signed bytes would be a new
  record to keep honest.
