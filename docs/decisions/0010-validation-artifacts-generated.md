# ADR-0010: Validation artifacts are generated from live runs, never hand-written

**Status**: accepted · 2026-07-10

## Decision

The validation raw material is produced by two commands, and only by them:

- `pnpm validation:iq` — Installation Qualification: 15 checks against a live
  environment (migrations, immutability and audit triggers, SECURITY DEFINER
  audit writer, role privilege ceilings, the §11.200 CHECK, a full audit-chain
  verification, storage WORM posture, auth mode), emitting a sign-off-able
  report and a non-zero exit on failure.
- `pnpm validation:artifacts` — runs the real test suite once and emits an
  Operational Qualification run report plus a requirement→test traceability
  matrix. The join key is the requirement token (`§11.10(e)`, …) appearing
  verbatim in test names; the compliance mapping table in
  `docs/03-compliance.md` supplies the requirement and mechanism columns.

Hand-editing the generated files is out of bounds; fixing the matrix means
fixing a test, a test name, or the compliance table.

## Rationale

- A hand-maintained traceability matrix drifts silently — the same failure
  mode as a stored status column, which this project exists to reject
  (ADR-0004 for data, applied here to evidence). Generated-from-a-live-run
  means an untested requirement shows an empty cell and a failing control
  shows FAIL, with no editorial step in between.
- Assessors ask "how do you know the controls are installed *here*?" — IQ as
  an executable answers that per environment, not per document revision.
  Writing it as checks also caught a real gap immediately (taxonomy tables
  lacked audit triggers once the importer made them runtime-mutable →
  migration 0005).

## Consequences

- Test names are load-bearing: requirement tokens in `describe`/`it` titles
  are the tagging convention. Renaming a test away from its token visibly
  drops it from the matrix — loud, by design.
- §11.10(a) remains "not claimed": these artifacts are the raw material a
  formal CSV program (SOPs, risk assessment, training, QMS) would consume,
  not the program itself.
- (Logged per the project's LLM-practice transparency policy: generation
  from executable sources rather than model-written evidence is a deliberate
  hallucination-risk mitigation, same family as ADR-0005.)
