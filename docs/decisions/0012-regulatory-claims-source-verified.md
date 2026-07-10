# ADR-0012: Regulatory specifics are verified against source texts, never written from model memory

**Status**: accepted · 2026-07-10

## Decision

Any regulation-specific claim in the docs — a GAMP 5 category or appendix, a
Part 11 section, an ICH expectation, a CDISC definition — is verified against
the full source text before it lands, and cites the section it relies on
(e.g. GAMP 5 2nd ed. Appendix M4). The source library lives outside the repo:
the texts are licensed (ISPE, ICH, CDISC), so they are never vendored, for the
same reason the CDISC taxonomy spreadsheet is never vendored (ADR-0005).
Verification happens at writing time, not review time.

## Rationale

An LLM writes plausible regulatory prose from memory, and plausible is exactly
the failure mode: the sentence reads right, cites nothing, and is subtly out
of date or out of context. It happened in this repo: the validation guide
initially described GAMP categorization as choosing "category 4 or 5 — your
QA decides," when the Second Edition (Appendix M4) treats categories 3–5 as a
continuum, expects systems to mix components of several categories, and
explicitly warns against validation approaches driven by a single category
label. The from-memory sentence survived a human read because it sounded like
standard CSV vocabulary; only checking the actual text caught it
(commit 255752e).

## Consequences

- Regulatory claims in docs carry section citations, so a reviewer can check
  the claim against the text without trusting the writer — human or model.
- Enforcement is procedural (CLAUDE.md rule, this ADR), not tooling: nothing
  automatically confirms a cited section says what the doc claims. The
  citation makes the check cheap; it does not perform it.
- Same family as ADR-0005 (taxonomy loaded verbatim from the official file)
  and ADR-0010 (validation evidence generated from live runs): where ground
  truth exists in an authoritative source, content comes from the source, and
  model memory is never the source.
