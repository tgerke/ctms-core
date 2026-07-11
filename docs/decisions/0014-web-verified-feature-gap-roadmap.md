# ADR-0014: The docs carry a web-verified feature-gap roadmap

Date: 2026-07-10. Status: accepted.

## Context

The docs described what the system does (user guide, technical guide) and
what it deliberately won't do (vision non-goals, compliance honest gaps),
but nothing recorded the distance to the systems it is measured against. An
evaluator's first question — "what would I lose by leaving Veeva or
Florence?" — had no honest page to land on, and the feature comparison
existed only as unwritten assumptions.

Writing that comparison from model memory would repeat the failure mode
ADR-0012 documented for regulatory text: plausible, confident, and possibly
wrong. Claims about what incumbent products ship are checkable the same way
regulatory claims are — against the source.

## Decision

1. **A roadmap doc exists and follows the mirror convention**:
   `docs/06-roadmap.md` with `docs-site/roadmap.qmd`, updated together.
2. **Vendor and standards claims are web-verified.** Every "incumbents do X"
   statement was checked against the vendor's or standard body's own public
   page (Veeva Vault eTMF, Medidata CTMS, Florence eBinders, CDISC eTMF
   Exchange Mechanism), cited by URL with an access date. This extends
   ADR-0012's rule from regulatory texts to market claims: where ground
   truth is public, content comes from the source, not model memory.
3. **Boundaries are separated from gaps.** Things the vision declares
   non-goals (payments, eConsent, subject-level data, the validation
   program) are restated as boundaries so the gap list contains only genuine
   distance. A gap entry states what incumbents do, what exists here
   instead, and what shape a fix would take in this data model.
4. **Gaps are not commitments, and the roadmap never claims a feature
   exists.** Same direction of honesty as the compliance honest-gaps list
   and ADR-0013's binding rule for the user guide. When a gap item ships,
   it moves off this page in the same change.

## Consequences

- Evaluators get the comparison the vision only implied, with the same
  auditability as the rest of the docs.
- The citations date: vendor pages change, and an access date is not a
  guarantee. Acceptable — the claims are directional (what class of feature
  incumbents ship), not version-specific.
- The page adds one more place that must move when code moves (like
  docs/03-compliance.md); the "moves off this page when shipped" rule is
  the tripwire.
