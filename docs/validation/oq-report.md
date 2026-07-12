# Operational Qualification report

Environment: commit f87e92c, node v22.23.1, 2026-07-12T17:54:14.328Z

Suite result: **PASSED** — 130/130 tests passed.

## packages/core/src/digest.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | digest notifications (ADR-0017) collects a digest whose numbers cohere with the views | 29 |
| PASS | digest notifications (ADR-0017) renders a subject and body that carry the study and the counts | 15 |
| PASS | digest notifications (ADR-0017) a broken chain leads the email and the subject count | 13 |
| PASS | digest notifications (ADR-0017) recipients are the study-wide admin/trial_ops seats, nobody else | 2 |

## packages/core/src/ems.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | exchange.xml serialization (ADR-0024) maps batch attributes, object order, and version state per spec/XSD | 3 |
| PASS | exchange.xml serialization (ADR-0024) computes the SRI checksum the standard cites (sha256, base64) | 0 |
| PASS | exchange.xml serialization (ADR-0024) marks the latest iteration of a returned document Obsolete | 0 |
| PASS | exchange.xml serialization (ADR-0024) emits site-level identifiers for site-scoped documents | 1 |
| PASS | exchange.xml serialization (ADR-0024) refuses to fabricate: every blocker reported at once, nothing emitted | 0 |
| PASS | exchange.xml serialization (ADR-0024) refuses an empty batch (XSD requires at least one OBJECT) | 1 |
| PASS | exchange.xml against the seeded study serializes the full study and validates against the official XSD | 48 |

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 78 |
| PASS | requirement engine is idempotent | 7 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 13 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 94 |

## packages/core/src/export.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF export (ADR-0020) collects every document with versions, signatures, and returns intact | 45 |
| PASS | TMF export (ADR-0020) every referenced blob exists and hashes to its recorded sha256 | 44 |
| PASS | TMF export (ADR-0020) carries the whole audit trail with a verified chain and its head hash | 24 |
| PASS | TMF export (ADR-0020) the expected-document snapshot matches the live view | 24 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 157 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 29 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 12 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 16 |

## packages/db/src/content-text.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | extractContentText (ADR-0022) extracts the text of a PDF | 79 |
| PASS | extractContentText (ADR-0022) passes text/* through with whitespace normalized | 0 |
| PASS | extractContentText (ADR-0022) records other mime types as unsupported | 0 |
| PASS | extractContentText (ADR-0022) records malformed PDF bytes as failed, without throwing | 2 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 35 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_return (ADR-0015) | 3 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 11 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 7 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 15 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 5 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 40 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 33 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 8 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 2 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 4 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 65 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 28 |

## apps/api/src/admin.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | site onboarding (ADR-0016) onboards a site end to end: org → site → study-site → activate → staff → sync | 95 |
| PASS | site onboarding (ADR-0016) duplicate site number on the study is refused | 8 |
| PASS | site onboarding (ADR-0016) ending a role is a dated fact, not a delete | 8 |
| PASS | site onboarding (ADR-0016) admin mutations are attributed in the audit trail | 3 |
| PASS | site onboarding (ADR-0016) the monitor role gets 403 on every admin mutation | 9 |
| PASS | site onboarding (ADR-0016) grants and revokes access; revocation is a fact, revoking twice refuses | 20 |
| PASS | site onboarding (ADR-0016) creates and updates a requirement rule, and sync materializes it | 21 |
| PASS | expected-document waivers (ADR-0016) waiving turns 'missing' into 'waived' with the reason on the view | 10 |
| PASS | expected-document waivers (ADR-0016) waived items leave the completeness denominator | 3 |
| PASS | expected-document waivers (ADR-0016) a second active waiver is refused; a blank reason is a 400 | 7 |
| PASS | expected-document waivers (ADR-0016) the monitor role cannot waive | 2 |
| PASS | expected-document waivers (ADR-0016) a filed document beats the waiver | 87 |
| PASS | expected-document waivers (ADR-0016) lifting the waiver restores 'missing' and keeps the history | 12 |
| PASS | expected-document waivers (ADR-0016) waiver facts land in the audit trail | 2 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 12 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 10 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 3 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 30 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 95 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 7 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 13 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 13 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 22 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 6 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 43 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 3 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 72 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 4 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 3 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 112 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 19 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 15 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 42 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 3 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 93 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 20 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 16 |

## apps/api/src/portfolio.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | portfolio (ADR-0021) returns one row per study, ordered by protocol number | 814 |
| PASS | portfolio (ADR-0021) rolls up the second study exactly as seeded — studies do not bleed into each other | 669 |
| PASS | portfolio (ADR-0021) is readable with any read-permitting grant | 655 |
| PASS | portfolio (ADR-0021) per-study surfaces stay scoped: 2202's expected documents are only its own | 659 |

## apps/api/src/return.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | return-for-correction (ADR-0015) records the returner, reason, and time, and moves the document to 'returned' | 143 |
| PASS | return-for-correction (ADR-0015) requires 'approve' permission: the monitor role gets 403 | 16 |
| PASS | return-for-correction (ADR-0015) rejects a blank reason at the schema boundary | 12 |
| PASS | return-for-correction (ADR-0015) a returned version can never be approved | 25 |
| PASS | return-for-correction (ADR-0015) a corrected version reopens review, and only it can be approved | 44 |
| PASS | return-for-correction (ADR-0015) only a pending_review document can be returned | 7 |
| PASS | return-for-correction (ADR-0015) only the latest version can be returned | 24 |
| PASS | return-for-correction (ADR-0015) the return lands in the document's audit trail | 24 |

## apps/api/src/review-queue.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | review queue (ADR-0018) an unassigned pending version sits in the queue as 'unassigned' | 121 |
| PASS | review queue (ADR-0018) assigning with a past due date derives 'overdue'; filters find it | 45 |
| PASS | review queue (ADR-0018) reassignment inserts a new row and the latest one stands | 31 |
| PASS | review queue (ADR-0018) the assignee must be able to approve: a monitor-role assignee is refused | 16 |
| PASS | review queue (ADR-0018) assigning takes 'approve' authority: the monitor token gets 403 | 12 |
| PASS | review queue (ADR-0018) approval clears the entry from the queue — the assignment resolves itself | 35 |
| PASS | review queue (ADR-0018) a return clears the entry too, and the returned version cannot be assigned | 26 |
| PASS | review queue (ADR-0018) assignments land on the document detail and in the audit trail | 28 |

## apps/api/src/search.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | document search (ADR-0019) finds a document by title words, stem-free but case-insensitive | 36 |
| PASS | document search (ADR-0019) every token must match: adding a person narrows to their documents | 24 |
| PASS | document search (ADR-0019) matches artifact codes and site numbers ('04.01 002') | 9 |
| PASS | document search (ADR-0019) filters by document status | 5 |
| PASS | document search (ADR-0019) LIKE wildcards in the query are literals, not injection | 7 |
| PASS | document search (ADR-0019) a one-character query is rejected at the schema boundary | 2 |
| PASS | document search (ADR-0019) read permission suffices: the monitor can search | 5 |
| PASS | content full-text search (ADR-0022) a word that exists only inside the PDF finds the document, with a snippet | 107 |
| PASS | content full-text search (ADR-0022) tokens mix freely across metadata and content | 7 |
| PASS | content full-text search (ADR-0022) a metadata-only match carries no snippet | 6 |
| PASS | content full-text search (ADR-0022) unextractable bytes never block the upload; the failure is recorded | 18 |

## apps/api/src/site-seat.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | the site seat is a permission scope (ADR-0023) /me names the person and the site-scoped grant | 22 |
| PASS | the site seat is a permission scope (ADR-0023) reads its own site: overview, expected documents, enrollment, staff | 41 |
| PASS | the site seat is a permission scope (ADR-0023) is refused everywhere else — other sites, study-wide reads, the portfolio (§11.10(g)) | 13 |
| PASS | delegation-of-authority log (ADR-0023) site staff records a delegation; the view derives active + PI check | 38 |
| PASS | delegation-of-authority log (ADR-0023) an authorizer who never held the PI role is flagged, not refused | 34 |
| PASS | delegation-of-authority log (ADR-0023) refuses self-delegation, empty tasks, and monitor authorship (§11.10(g)) | 14 |
| PASS | delegation-of-authority log (ADR-0023) ending is a dated fact; ending twice refuses | 19 |
| PASS | delegation-of-authority log (ADR-0023) log writes land in the audit trail attributed to the site persona | 3 |
| PASS | training log (ADR-0023) records a completion and derives expiry status | 12 |
| PASS | training log (ADR-0023) refuses a blank topic and an expiry before completion | 9 |
| PASS | training log (ADR-0023) oversight reads the log; the monitor cannot write it | 6 |

## apps/web/src/api.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | errorMessage maps 403 to a permission message | 1 |
| PASS | errorMessage surfaces the server's message for 4xx validation errors | 0 |
| PASS | errorMessage hides 5xx detail behind a plain retry message | 0 |
| PASS | errorMessage treats fetch TypeErrors as connectivity problems | 0 |
| PASS | errorMessage falls back to a generic message for unknown errors | 0 |

Reviewed by: ______________________  Date: ____________
