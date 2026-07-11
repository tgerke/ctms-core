# Operational Qualification report

Environment: commit 37c9856, node v22.23.1, 2026-07-11T15:48:05.959Z

Suite result: **PASSED** — 77/77 tests passed.

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 95 |
| PASS | requirement engine is idempotent | 8 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 15 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 39 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 98 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 24 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 22 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 15 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 39 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_return (ADR-0015) | 3 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 9 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 6 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 11 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 6 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 53 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 32 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 3 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 12 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 3 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 3 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 75 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 35 |

## apps/api/src/admin.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | site onboarding (ADR-0016) onboards a site end to end: org → site → study-site → activate → staff → sync | 81 |
| PASS | site onboarding (ADR-0016) duplicate site number on the study is refused | 8 |
| PASS | site onboarding (ADR-0016) ending a role is a dated fact, not a delete | 8 |
| PASS | site onboarding (ADR-0016) admin mutations are attributed in the audit trail | 3 |
| PASS | site onboarding (ADR-0016) the monitor role gets 403 on every admin mutation | 10 |
| PASS | site onboarding (ADR-0016) grants and revokes access; revocation is a fact, revoking twice refuses | 23 |
| PASS | site onboarding (ADR-0016) creates and updates a requirement rule, and sync materializes it | 20 |
| PASS | expected-document waivers (ADR-0016) waiving turns 'missing' into 'waived' with the reason on the view | 11 |
| PASS | expected-document waivers (ADR-0016) waived items leave the completeness denominator | 3 |
| PASS | expected-document waivers (ADR-0016) a second active waiver is refused; a blank reason is a 400 | 7 |
| PASS | expected-document waivers (ADR-0016) the monitor role cannot waive | 2 |
| PASS | expected-document waivers (ADR-0016) a filed document beats the waiver | 25 |
| PASS | expected-document waivers (ADR-0016) lifting the waiver restores 'missing' and keeps the history | 10 |
| PASS | expected-document waivers (ADR-0016) waiver facts land in the audit trail | 2 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 13 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 9 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 3 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 16 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 36 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 8 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 16 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 35 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 28 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 7 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 58 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 4 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 80 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 5 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 3 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 82 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 24 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 21 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 50 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 4 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 32 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 16 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 12 |

## apps/api/src/return.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | return-for-correction (ADR-0015) records the returner, reason, and time, and moves the document to 'returned' | 94 |
| PASS | return-for-correction (ADR-0015) requires 'approve' permission: the monitor role gets 403 | 17 |
| PASS | return-for-correction (ADR-0015) rejects a blank reason at the schema boundary | 13 |
| PASS | return-for-correction (ADR-0015) a returned version can never be approved | 28 |
| PASS | return-for-correction (ADR-0015) a corrected version reopens review, and only it can be approved | 46 |
| PASS | return-for-correction (ADR-0015) only a pending_review document can be returned | 8 |
| PASS | return-for-correction (ADR-0015) only the latest version can be returned | 26 |
| PASS | return-for-correction (ADR-0015) the return lands in the document's audit trail | 25 |

## apps/web/src/api.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | errorMessage maps 403 to a permission message | 1 |
| PASS | errorMessage surfaces the server's message for 4xx validation errors | 0 |
| PASS | errorMessage hides 5xx detail behind a plain retry message | 0 |
| PASS | errorMessage treats fetch TypeErrors as connectivity problems | 0 |
| PASS | errorMessage falls back to a generic message for unknown errors | 0 |

Reviewed by: ______________________  Date: ____________
