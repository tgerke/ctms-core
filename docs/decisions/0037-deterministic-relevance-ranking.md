# ADR-0037: Search relevance is a deterministic rank, computed per query

Date: 2026-07-31. Status: accepted.

## Context

Search matches well but orders poorly. Since ADR-0019 the results have been
sorted by latest upload, which was honest when every match was a metadata
match: recently touched documents are a fair default. Content full-text
(ADR-0022) broke that assumption. A document whose title is exactly what the
user typed can now sit below a newer document that mentions the same words
once on page 40. Three ADRs in a row (0022, 0030, 0031) closed with the same
line: relevance ranking remains.

Two failure modes to avoid. The first is the one ADR-0019 was written
against: ranking state that lives outside the record — a score column, a
search index, a materialized weight — that can drift from what the documents
actually say. The second is new: a scoring model nobody can explain. This
system's posture is that everything derived is checkable against the record
(derived status, facts_match, the audit chain), and an inspector asking "why
is this document first?" deserves a better answer than a statistical
formula's output.

Postgres's own full-text machinery (`tsvector` / `ts_rank`) was the obvious
candidate and was rejected for both reasons at once. Its tokenizer disagrees
with the documented substring semantics: "04.01" and partial words match
today via `LIKE`, but score zero in a tsquery, so exactly the queries this
system promises to handle would order arbitrarily. And `ts_rank`'s
normalization options produce scores that are defensible statistically but
not explainable row by row.

## Decision

1. **Matching is untouched; ranking only reorders.** The result set of a
   query is exactly what it was: every token must substring-match the
   metadata haystack or the extracted content (`LIKE ALL`). The rank is a
   new `ORDER BY`, nothing else.
2. **The rank is a deterministic sum, computed in the same query and never
   stored.** Per token: the highest metadata tier it hits — title 8,
   taxonomy (artifact code and name, section, zone) 4, anything else in the
   haystack 2 — plus its occurrences in the extracted content, capped at 4.
   What a document *is* outranks what it merely *mentions*: a content-only
   match can never overtake a title match on the same token, and the cap
   keeps a wordy protocol from drowning a certificate. No migration, no new
   state, no index: the score is a pure function of the query and the same
   view the match reads.
3. **Ties keep the old ordering.** Equal ranks fall back to latest upload,
   then artifact code — so for the queries where ranking has nothing to say,
   behavior is exactly what it was before this ADR.
4. **The rank ships with each result.** The API returns `rank` alongside the
   existing `matched_in_content` and snippet, and the formula above is in
   the endpoint description. "Why is this first?" is answerable from the
   response fields and a documented weight table, not from a model.

## Consequences

- "Investigator's Brochure" typed into search now returns the brochure
  first, not whichever document mentioning brochures was uploaded last.
- The weights are editorial, and visibly so. 8/4/2 plus a capped occurrence
  count is not information retrieval theory; it is a small, auditable
  opinion about what users mean. If a pilot shows the opinion is wrong, the
  fix is a one-line weight change and a test, not a reindex.
- Cost stays the sequential-scan posture of ADR-0019/0022, plus one
  `replace()` pass over the extracted text per token per candidate row —
  measured before pilot scale, like the scan itself.
- Stemming, fuzziness, and phrase proximity remain non-features. The match
  semantics are still literal substrings; this ADR only decides what order
  the matches arrive in.
