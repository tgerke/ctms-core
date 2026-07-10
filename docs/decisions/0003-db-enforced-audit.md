# ADR-0003: Audit trail written and guarded by the database, not the application

**Status**: accepted · 2026-07-09

## Decision

`audit_event` rows are produced by AFTER-triggers on every domain table, with the
acting person supplied via `set_config('ctms.actor_id', …)` per transaction. Events are
hash-chained in-DB (pgcrypto, advisory-lock serialized). UPDATE/DELETE on
`audit_event`, `document_version`, and `signature` raise an exception for all roles.

## Rationale

Part 11 §11.10(e) demands computer-generated audit trails that never obscure prior
values. An application-layer audit writer is one forgotten code path away from a gap;
triggers make *every* write path — API, seed scripts, ad-hoc psql — leave the same
trail. The hash chain makes after-the-fact tampering detectable, which is stronger
than the regulation requires and cheap to provide.

## Consequences

- Writes require a wrapper (`packages/core` `withActor`) that sets actor context;
  writes without it are still audited, attributed to `system`.
- Migrations that must rewrite history (rare) need explicit, documented trigger
  disablement — a feature, not a bug: history rewrites should be loud.
