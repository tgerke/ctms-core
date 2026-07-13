# ADR-0030: Office-format previews render in the viewer's browser

Date: 2026-07-12. Status: accepted.

## Context

Preview (ADR-0027) is a scoped read of the signed bytes, and it drew a hard
line: no stored rendition, nothing derived that could drift from the record.
The browser renders PDFs, images, and text natively; Word and Excel files —
plans, logs, trackers, a large share of what a TMF reviews daily — fell to a
download offer. Both ADR-0027 and ADR-0028 named in-browser office rendering
as the remainder.

The obvious fix is the wrong one here: a server-side conversion service
(LibreOffice headless or a SaaS renderer) produces a second artifact per
version that must be stored, rebuilt, and kept honest against the §11.10(b)
copies — plus a heavyweight runtime dependency in every deployment, test run,
and validation environment. ADR-0022 already established the pattern for
derived content (rebuildable, outside the audited record), but a rendition
differs from extracted text in one way that matters: extracted text feeds a
query; a rendition is *looked at* right where signing happens, so anything
stored invites reviewing the copy instead of the record.

## Decision

1. **The rendition is computed in the viewer's browser, from the signed
   bytes.** The preview panel already fetches the exact immutable bytes with
   the session credential (ADR-0027); for office formats the web app converts
   those bytes to HTML client-side — the same trust model as the browser's
   built-in PDF viewer, which is also client software rendering the signed
   bytes. The server stores nothing, serves nothing new, and has no new
   endpoint or schema: there is no artifact anywhere that could drift.
   §11.10(b)'s copies are untouched — the electronic copy remains the exact
   bytes, and the rendition is a reading aid beside the download, not a copy.
2. **docx converts with mammoth; xlsx with a small OOXML reader of our own**
   (jszip + fast-xml-parser, both already in the dependency tree). exceljs —
   which the server keeps using for the TMF importer and seed — never
   resolves its `load()` under a browser bundler, and a preview needs only
   cell text; the direct reader handles shared strings, inline strings,
   rich-text runs, formula results, and booleans in ~100 lines, and keeps the
   lazy-loaded chunk about a tenth the size. Dates and number formats show as
   their stored raw values — reading-grade, stated plainly in the panel.
3. **The rendition lives in an iframe with an empty `sandbox`.** A document
   under review is untrusted input. Everything the reader emits itself is
   escaped, mammoth escapes its own text nodes, and the sandbox (no scripts,
   no origin, no navigation) contains whatever a hostile file smuggles
   through either path. Sheets are capped at 200 rows × 40 columns with an
   explicit truncation note.
4. **The panel says what it is.** "Rendered in your browser for reading — the
   downloaded file is the record" sits beside the download link on every
   office preview. Byte verification (ADR-0028) keeps hashing fetched
   originals; renditions are invisible to it.
5. **Detection is mime-type first, extension only as a fallback** for
   uploads that arrived as `application/octet-stream` (partner packages,
   generic HTTP clients). Legacy binary formats (.doc, .xls) and
   presentations stay download offers — an honest "no inline view" beats a
   wrong one.
6. **The seed uploads real office files awaiting review** (a docx trial
   management plan, an xlsx lab-ranges workbook), so the queue demos the
   rendition and a regression would be visible on any seeded stack.

## Consequences

- Reading a Word plan or an Excel log now happens on the queue row where the
  signature ceremony is, closing the remainder ADR-0027 and ADR-0028 both
  carried. What remains of that thread is OCR for image-only PDFs and
  relevance ranking (ADR-0022's note), unchanged.
- Fidelity is reading-grade, not print-grade: complex layout, charts, and
  cell formatting degrade, and a reviewer who needs the authoritative
  appearance downloads the file the signature actually binds — the label
  points there.
- The queue is still the only preview surface; the document page and binder
  keep offering the download plus byte verification. If a pilot wants
  renditions there, the module is shared code.
- The web app gains no server coupling: mammoth and the OOXML reader load as
  a lazy chunk on first office preview, and the main bundle is unchanged.
