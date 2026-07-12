# ADR-0019: Document search is a metadata query, not an index

Date: 2026-07-11. Status: accepted.

## Context

Navigation was the site matrix, status filters, and URL-addressable lists —
good for "what is missing," weak for "find the signed protocol amendment 2
from site 03." Incumbents ship search over all document versions (Veeva's
TMF Viewer). The roadmap scoped metadata search first and content full-text
as the larger second step.

A search *index* (Elasticsearch, a maintained tsvector table) is state
derived from the record that must be kept in sync with it — the drift
failure mode ADR-0004 exists to prevent, applied to search.

## Decision

1. **Search is a query over a view.** `v_document_search` flattens each
   document's searchable metadata — title, TMF artifact code and taxonomy
   names, site number and name, person, uploader, file names, filing
   source, status — into a lowercase haystack.
   `GET /studies/{id}/document-search?q=` requires every whitespace token
   to appear in the haystack (substring semantics; LIKE wildcards in the
   query are escaped to literals). Results can never disagree with the
   record because there is nothing but the record.
2. **Substring AND, not full-text stemming.** Predictable for the things
   people actually type here: artifact codes ("04.01"), site numbers,
   names, title fragments. No ranking model — results order by latest
   upload. Postgres FTS with a generated indexed column is the documented
   scale path if a pilot's corpus outgrows sequential scans; the API
   contract would not change.
3. **Content full-text stays out of scope.** Indexing PDF text means an
   extraction pipeline and stored derived text; the immutability of
   versions makes that safe to add later (extracted text of immutable
   bytes can never go stale), but it is a separate, larger step and the
   roadmap keeps it visible.
4. **The UI is a header search box plus a search page** with status
   filters; the view is queryable by `ctms_readonly` like every other
   `v_*` surface.

## Consequences

- "Find the signed 1572 from site 03" is now typing "1572 003" — from the
  UI, the API, or SQL.
- Searches are sequential scans over a per-study document set; fine at
  probe scale, measured before pilot scale (the generated-column index
  path exists).
- What remains of the incumbents' search story: content full-text and
  Excel export of result sets.
