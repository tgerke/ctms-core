# Operational Qualification report

Environment: commit 10a8821, node v22.23.1, 2026-07-11T04:48:46.396Z

Suite result: **PASSED** — 63/63 tests passed.

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 71 |
| PASS | requirement engine is idempotent | 5 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 11 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 36 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 100 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 23 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 11 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 16 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 43 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_return (ADR-0015) | 3 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 8 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 4 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 9 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 4 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 55 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 31 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 11 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 3 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 3 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 59 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 27 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 9 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 8 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 3 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 18 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 41 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 9 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 11 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 11 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 19 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 6 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 38 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 3 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 34 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 4 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 2 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 58 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 20 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 14 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 42 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 3 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 31 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 17 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 14 |

## apps/api/src/return.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | return-for-correction (ADR-0015) records the returner, reason, and time, and moves the document to 'returned' | 73 |
| PASS | return-for-correction (ADR-0015) requires 'approve' permission: the monitor role gets 403 | 13 |
| PASS | return-for-correction (ADR-0015) rejects a blank reason at the schema boundary | 10 |
| PASS | return-for-correction (ADR-0015) a returned version can never be approved | 21 |
| PASS | return-for-correction (ADR-0015) a corrected version reopens review, and only it can be approved | 35 |
| PASS | return-for-correction (ADR-0015) only a pending_review document can be returned | 6 |
| PASS | return-for-correction (ADR-0015) only the latest version can be returned | 20 |
| PASS | return-for-correction (ADR-0015) the return lands in the document's audit trail | 19 |

## apps/web/src/api.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | errorMessage maps 403 to a permission message | 1 |
| PASS | errorMessage surfaces the server's message for 4xx validation errors | 0 |
| PASS | errorMessage hides 5xx detail behind a plain retry message | 0 |
| PASS | errorMessage treats fetch TypeErrors as connectivity problems | 0 |
| PASS | errorMessage falls back to a generic message for unknown errors | 0 |

Reviewed by: ______________________  Date: ____________
