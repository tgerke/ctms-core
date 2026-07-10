# ADR-0004: Completeness status is derived by views, never stored

**Status**: accepted · 2026-07-09

## Decision

`expected_document` stores no status and no `satisfied_by` FK. A view
(`v_expected_document_status`) joins placeholders to fulfilling documents at query time
and computes `missing / pending_review / current / expiring_soon / expired /
superseded`.

## Rationale

Stored status flags drift — that drift is precisely the incumbent-system failure this
project exists to fix. Deriving from ground truth (document lifecycle + dates) means
completeness can never disagree with the documents themselves, and new statuses (e.g.
a different expiry warning window) are a view change, not a backfill.

## Consequences

Status queries cost a join instead of an index lookup. At realistic scale (thousands
of expected documents per study) this is nothing; if it ever matters, the view can
become a materialized view refreshed on write without changing any consumer.
