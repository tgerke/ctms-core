# Operational Qualification report

Environment: commit 02a8511, node v22.23.1, 2026-07-10T18:15:49.328Z

Suite result: **PASSED** — 49/49 tests passed.

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 59 |
| PASS | requirement engine is idempotent | 5 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 9 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 24 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 74 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 17 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 8 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 11 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 24 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 2 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 7 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 6 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 12 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 2 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 0 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 43 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 24 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 8 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 2 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 2 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 35 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 13 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 6 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 6 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 2 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 13 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 22 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 5 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 7 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 8 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 14 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 4 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 24 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 2 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 24 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 3 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 2 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 47 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 12 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 9 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 27 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 2 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 25 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 13 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 13 |

Reviewed by: ______________________  Date: ____________
