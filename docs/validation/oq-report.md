# Operational Qualification report

Environment: commit 4a5c4cc, node v22.23.1, 2026-07-13T05:01:41.114Z

Suite result: **PASSED** — 165/165 tests passed.

## packages/core/src/digest.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | digest notifications (ADR-0017) collects a digest whose numbers cohere with the views | 41 |
| PASS | digest notifications (ADR-0017) renders a subject and body that carry the study and the counts | 17 |
| PASS | digest notifications (ADR-0017) a broken chain leads the email and the subject count | 16 |
| PASS | digest notifications (ADR-0017) recipients are the study-wide admin/trial_ops seats, nobody else | 2 |

## packages/core/src/ems-import.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | parseExchangeXml (ADR-0025) parses a partner batch: attributes, objects, files, metadata | 7 |
| PASS | parseExchangeXml (ADR-0025) round-trips this system's own export | 2 |
| PASS | parseExchangeXml (ADR-0025) reports every structural gap at once | 0 |
| PASS | parseSri decodes the SRI sha256 our export emits back to the hex digest | 0 |
| PASS | parseSri rejects non-SRI values | 0 |
| PASS | planEmsImport (ADR-0025) threads iterations onto one document and maps by UNIQUEID | 1 |
| PASS | planEmsImport (ADR-0025) skips identical already-filed versions and threads onto the existing document | 1 |
| PASS | planEmsImport (ADR-0025) refuses, all blockers at once: unknown UNIQUEID, unknown site, bad checksum | 1 |
| PASS | planEmsImport (ADR-0025) refuses an un-imported taxonomy (no unique IDs anywhere) | 1 |
| PASS | planEmsImport (ADR-0025) refuses a re-sent version whose content changed (versions are immutable) | 1 |
| PASS | planEmsImport (ADR-0025) refuses country-level and RESTRICTED objects — no honest home in the schema | 1 |
| PASS | planEmsImport (ADR-0025) warns when ARTIFACTNUMBER disagrees with the imported taxonomy — UNIQUEID wins | 1 |
| PASS | EmsBatch typing emsSourceRef is the provenance key format the filings endpoint threads on | 1 |

## packages/core/src/ems.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | exchange.xml serialization (ADR-0024) maps batch attributes, object order, and version state per spec/XSD | 4 |
| PASS | exchange.xml serialization (ADR-0024) computes the SRI checksum the standard cites (sha256, base64) | 0 |
| PASS | exchange.xml serialization (ADR-0024) marks the latest iteration of a returned document Obsolete | 0 |
| PASS | exchange.xml serialization (ADR-0024) emits site-level identifiers for site-scoped documents | 1 |
| PASS | exchange.xml serialization (ADR-0024) refuses to fabricate: every blocker reported at once, nothing emitted | 0 |
| PASS | exchange.xml serialization (ADR-0024) refuses an empty batch (XSD requires at least one OBJECT) | 1 |
| PASS | exchange.xml against the seeded study serializes the full study and validates against the official XSD | 80 |

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 84 |
| PASS | requirement engine is idempotent | 6 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 12 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 132 |

## packages/core/src/export.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF export (ADR-0020) collects every document with versions, signatures, and returns intact | 48 |
| PASS | TMF export (ADR-0020) every referenced blob exists and hashes to its recorded sha256 | 84 |
| PASS | TMF export (ADR-0020) carries the whole audit trail with a verified chain and its head hash | 33 |
| PASS | TMF export (ADR-0020) the expected-document snapshot matches the live view | 33 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 169 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 26 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 12 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 21 |

## packages/db/src/content-text.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | extractContentText (ADR-0022) extracts the text of a PDF | 80 |
| PASS | extractContentText (ADR-0022) passes text/* through with whitespace normalized | 0 |
| PASS | extractContentText (ADR-0022) records other mime types as unsupported | 0 |
| PASS | extractContentText (ADR-0022) records malformed PDF bytes as failed, without throwing | 2 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 31 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 4 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 4 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_return (ADR-0015) | 4 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 9 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 11 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 16 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 4 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 57 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 32 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 3 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 11 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 3 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 3 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 58 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 23 |

## apps/api/src/admin.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | site onboarding (ADR-0016) onboards a site end to end: org → site → study-site → activate → staff → sync | 77 |
| PASS | site onboarding (ADR-0016) duplicate site number on the study is refused | 7 |
| PASS | site onboarding (ADR-0016) ending a role is a dated fact, not a delete | 7 |
| PASS | site onboarding (ADR-0016) admin mutations are attributed in the audit trail | 2 |
| PASS | site onboarding (ADR-0016) the monitor role gets 403 on every admin mutation | 9 |
| PASS | site onboarding (ADR-0016) grants and revokes access; revocation is a fact, revoking twice refuses | 20 |
| PASS | site onboarding (ADR-0016) creates and updates a requirement rule, and sync materializes it | 20 |
| PASS | expected-document waivers (ADR-0016) waiving turns 'missing' into 'waived' with the reason on the view | 10 |
| PASS | expected-document waivers (ADR-0016) waived items leave the completeness denominator | 2 |
| PASS | expected-document waivers (ADR-0016) a second active waiver is refused; a blank reason is a 400 | 9 |
| PASS | expected-document waivers (ADR-0016) the monitor role cannot waive | 2 |
| PASS | expected-document waivers (ADR-0016) a filed document beats the waiver | 90 |
| PASS | expected-document waivers (ADR-0016) lifting the waiver restores 'missing' and keeps the history | 12 |
| PASS | expected-document waivers (ADR-0016) waiver facts land in the audit trail | 2 |

## apps/api/src/auditor.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /studies/{id}/binder (ADR-0028) serves the taxonomy in reference-model order with filed documents attached | 62 |
| PASS | GET /studies/{id}/binder (ADR-0028) rolls up expected-document status per artifact from the same view | 21 |
| PASS | GET /studies/{id}/binder (ADR-0028) is a study-scoped read: the site seat gets 403 | 2 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) /me names the person and the single unscoped read_only grant | 4 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) reads the whole record: studies, binder, portfolio, audit trail, chain, bytes | 165 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) cannot change anything (§11.10(g)): upload, sign, bulk-approve, grant, sync all 403 | 16 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 9 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 9 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 2 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 24 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 100 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 9 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 16 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 14 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 24 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 7 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 41 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 3 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 68 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 4 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 3 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 122 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 22 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 18 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 222 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 8 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 327 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 26 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 16 |

## apps/api/src/bulk-review.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | bulk approval (ADR-0026) one re-authentication opens the series; each version gains its own signature bound to its own hash (§11.200 §11.70) | 201 |
| PASS | bulk approval (ADR-0026) refuses the whole selection with every blocker listed, signing nothing | 66 |
| PASS | bulk approval (ADR-0026) requires approve authority (a monitor holds sign, not approve) | 10 |
| PASS | bulk approval (ADR-0026) refuses the series without valid re-authentication (§11.200) | 14 |
| PASS | bulk return (ADR-0026 over ADR-0015) returns the selection with one shared immutable reason | 36 |
| PASS | bulk return (ADR-0026 over ADR-0015) refuses an empty reason | 11 |

## apps/api/src/document-content.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /document-versions/{id}/content (ADR-0027) returns the exact bytes with the uploaded mime type, file name, and hash (§11.10(b)) | 47 |
| PASS | GET /document-versions/{id}/content (ADR-0027) requires authentication | 14 |
| PASS | GET /document-versions/{id}/content (ADR-0027) is scoped to the version's site: the site seat reads its own site only | 27 |
| PASS | GET /document-versions/{id}/content (ADR-0027) study-wide read reaches every site's documents | 11 |
| PASS | GET /document-versions/{id}/content (ADR-0027) 404s an unknown version id | 2 |

## apps/api/src/ems-import.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | EMS import surface (ADR-0025) GET /tmf-artifacts carries the TMF RM unique ID, the EMS mapping key | 16 |
| PASS | EMS import surface (ADR-0025) GET /studies/{id}/filings starts empty for a source system that never filed | 7 |
| PASS | EMS import surface (ADR-0025) imports a partner batch through the filing endpoint as the ingest identity, idempotently | 164 |
| PASS | EMS import surface (ADR-0025) POST /documents/{id}/versions appends to exactly that document | 22 |
| PASS | EMS import surface (ADR-0025) refuses to grow a superseded document — closed history stays closed | 53 |

## apps/api/src/portfolio.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | portfolio (ADR-0021) returns one row per study, ordered by protocol number | 164 |
| PASS | portfolio (ADR-0021) rolls up the second study exactly as seeded — studies do not bleed into each other | 74 |
| PASS | portfolio (ADR-0021) is readable with any read-permitting grant | 73 |
| PASS | portfolio (ADR-0021) per-study surfaces stay scoped: 2202's expected documents are only its own | 83 |

## apps/api/src/return.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | return-for-correction (ADR-0015) records the returner, reason, and time, and moves the document to 'returned' | 259 |
| PASS | return-for-correction (ADR-0015) requires 'approve' permission: the monitor role gets 403 | 16 |
| PASS | return-for-correction (ADR-0015) rejects a blank reason at the schema boundary | 12 |
| PASS | return-for-correction (ADR-0015) a returned version can never be approved | 26 |
| PASS | return-for-correction (ADR-0015) a corrected version reopens review, and only it can be approved | 41 |
| PASS | return-for-correction (ADR-0015) only a pending_review document can be returned | 6 |
| PASS | return-for-correction (ADR-0015) only the latest version can be returned | 23 |
| PASS | return-for-correction (ADR-0015) the return lands in the document's audit trail | 24 |

## apps/api/src/review-queue.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | review queue (ADR-0018) an unassigned pending version sits in the queue as 'unassigned' | 120 |
| PASS | review queue (ADR-0018) assigning with a past due date derives 'overdue'; filters find it | 53 |
| PASS | review queue (ADR-0018) reassignment inserts a new row and the latest one stands | 42 |
| PASS | review queue (ADR-0018) the assignee must be able to approve: a monitor-role assignee is refused | 16 |
| PASS | review queue (ADR-0018) assigning takes 'approve' authority: the monitor token gets 403 | 12 |
| PASS | review queue (ADR-0018) approval clears the entry from the queue — the assignment resolves itself | 34 |
| PASS | review queue (ADR-0018) a return clears the entry too, and the returned version cannot be assigned | 28 |
| PASS | review queue (ADR-0018) assignments land on the document detail and in the audit trail | 28 |

## apps/api/src/search.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | document search (ADR-0019) finds a document by title words, stem-free but case-insensitive | 71 |
| PASS | document search (ADR-0019) every token must match: adding a person narrows to their documents | 60 |
| PASS | document search (ADR-0019) matches artifact codes and site numbers ('04.01 002') | 23 |
| PASS | document search (ADR-0019) filters by document status | 19 |
| PASS | document search (ADR-0019) LIKE wildcards in the query are literals, not injection | 25 |
| PASS | document search (ADR-0019) a one-character query is rejected at the schema boundary | 6 |
| PASS | document search (ADR-0019) read permission suffices: the monitor can search | 22 |
| PASS | content full-text search (ADR-0022) a word that exists only inside the PDF finds the document, with a snippet | 271 |
| PASS | content full-text search (ADR-0022) tokens mix freely across metadata and content | 28 |
| PASS | content full-text search (ADR-0022) a metadata-only match carries no snippet | 51 |
| PASS | content full-text search (ADR-0022) unextractable bytes never block the upload; the failure is recorded | 57 |

## apps/api/src/site-seat.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | the site seat is a permission scope (ADR-0023) /me names the person and the site-scoped grant | 15 |
| PASS | the site seat is a permission scope (ADR-0023) reads its own site: overview, expected documents, enrollment, staff | 40 |
| PASS | the site seat is a permission scope (ADR-0023) is refused everywhere else — other sites, study-wide reads, the portfolio (§11.10(g)) | 11 |
| PASS | delegation-of-authority log (ADR-0023) site staff records a delegation; the view derives active + PI check | 31 |
| PASS | delegation-of-authority log (ADR-0023) an authorizer who never held the PI role is flagged, not refused | 13 |
| PASS | delegation-of-authority log (ADR-0023) refuses self-delegation, empty tasks, and monitor authorship (§11.10(g)) | 13 |
| PASS | delegation-of-authority log (ADR-0023) ending is a dated fact; ending twice refuses | 16 |
| PASS | delegation-of-authority log (ADR-0023) log writes land in the audit trail attributed to the site persona | 3 |
| PASS | training log (ADR-0023) records a completion and derives expiry status | 12 |
| PASS | training log (ADR-0023) refuses a blank topic and an expiry before completion | 8 |
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
