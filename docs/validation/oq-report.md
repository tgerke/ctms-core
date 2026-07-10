# Operational Qualification report

Environment: commit 9b34788, node v22.23.1, 2026-07-10T15:51:27.881Z

Suite result: **PASSED** — 43/43 tests passed.

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 70 |
| PASS | requirement engine is idempotent | 4 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 9 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 24 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 68 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 16 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 7 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 10 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 23 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 1 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 3 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 9 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 5 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 10 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 3 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 45 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 24 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 10 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 3 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 2 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 42 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 20 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 6 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 4 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 1 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 7 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 20 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 4 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 8 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 13 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 4 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 25 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 2 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 26 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 3 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 1 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 49 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 13 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 8 |

Reviewed by: ______________________  Date: ____________
