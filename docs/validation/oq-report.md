# Operational Qualification report

Environment: commit 00749c6, node v22.23.1, 2026-07-13T06:08:40.079Z

Suite result: **PASSED** — 175/175 tests passed.

## packages/core/src/digest.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | digest notifications (ADR-0017) collects a digest whose numbers cohere with the views | 42 |
| PASS | digest notifications (ADR-0017) renders a subject and body that carry the study and the counts | 16 |
| PASS | digest notifications (ADR-0017) a broken chain leads the email and the subject count | 14 |
| PASS | digest notifications (ADR-0017) recipients are the study-wide admin/trial_ops seats, nobody else | 2 |

## packages/core/src/ems-import.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | parseExchangeXml (ADR-0025) parses a partner batch: attributes, objects, files, metadata | 10 |
| PASS | parseExchangeXml (ADR-0025) round-trips this system's own export | 4 |
| PASS | parseExchangeXml (ADR-0025) reports every structural gap at once | 1 |
| PASS | parseSri decodes the SRI sha256 our export emits back to the hex digest | 0 |
| PASS | parseSri rejects non-SRI values | 0 |
| PASS | planEmsImport (ADR-0025) threads iterations onto one document and maps by UNIQUEID | 2 |
| PASS | planEmsImport (ADR-0025) skips identical already-filed versions and threads onto the existing document | 2 |
| PASS | planEmsImport (ADR-0025) refuses, all blockers at once: unknown UNIQUEID, unknown site, bad checksum | 1 |
| PASS | planEmsImport (ADR-0025) refuses an un-imported taxonomy (no unique IDs anywhere) | 2 |
| PASS | planEmsImport (ADR-0025) refuses a re-sent version whose content changed (versions are immutable) | 1 |
| PASS | planEmsImport (ADR-0025) refuses country-level and RESTRICTED objects — no honest home in the schema | 1 |
| PASS | planEmsImport (ADR-0025) warns when ARTIFACTNUMBER disagrees with the imported taxonomy — UNIQUEID wins | 1 |
| PASS | EmsBatch typing emsSourceRef is the provenance key format the filings endpoint threads on | 2 |

## packages/core/src/ems.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | exchange.xml serialization (ADR-0024) maps batch attributes, object order, and version state per spec/XSD | 6 |
| PASS | exchange.xml serialization (ADR-0024) computes the SRI checksum the standard cites (sha256, base64) | 1 |
| PASS | exchange.xml serialization (ADR-0024) marks the latest iteration of a returned document Obsolete | 1 |
| PASS | exchange.xml serialization (ADR-0024) emits site-level identifiers for site-scoped documents | 1 |
| PASS | exchange.xml serialization (ADR-0024) refuses to fabricate: every blocker reported at once, nothing emitted | 1 |
| PASS | exchange.xml serialization (ADR-0024) refuses an empty batch (XSD requires at least one OBJECT) | 1 |
| PASS | exchange.xml against the seeded study serializes the full study and validates against the official XSD | 82 |

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 101 |
| PASS | requirement engine is idempotent | 9 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 17 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 121 |

## packages/core/src/export.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF export (ADR-0020) collects every document with versions, signatures, and returns intact | 60 |
| PASS | TMF export (ADR-0020) every referenced blob exists and hashes to its recorded sha256 | 86 |
| PASS | TMF export (ADR-0020) carries the whole audit trail with a verified chain and its head hash | 48 |
| PASS | TMF export (ADR-0020) the expected-document snapshot matches the live view | 50 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 320 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 37 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 14 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 28 |

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
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 43 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 3 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 4 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 4 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_return (ADR-0015) | 4 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 12 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 10 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 15 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 5 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 63 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 34 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 2 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 11 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 3 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 5 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 74 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 25 |

## apps/api/src/admin.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | site onboarding (ADR-0016) onboards a site end to end: org → site → study-site → activate → staff → sync | 86 |
| PASS | site onboarding (ADR-0016) duplicate site number on the study is refused | 8 |
| PASS | site onboarding (ADR-0016) ending a role is a dated fact, not a delete | 8 |
| PASS | site onboarding (ADR-0016) admin mutations are attributed in the audit trail | 3 |
| PASS | site onboarding (ADR-0016) the monitor role gets 403 on every admin mutation | 10 |
| PASS | site onboarding (ADR-0016) grants and revokes access; revocation is a fact, revoking twice refuses | 20 |
| PASS | site onboarding (ADR-0016) creates and updates a requirement rule, and sync materializes it | 21 |
| PASS | expected-document waivers (ADR-0016) waiving turns 'missing' into 'waived' with the reason on the view | 21 |
| PASS | expected-document waivers (ADR-0016) waived items leave the completeness denominator | 9 |
| PASS | expected-document waivers (ADR-0016) a second active waiver is refused; a blank reason is a 400 | 10 |
| PASS | expected-document waivers (ADR-0016) the monitor role cannot waive | 2 |
| PASS | expected-document waivers (ADR-0016) a filed document beats the waiver | 116 |
| PASS | expected-document waivers (ADR-0016) lifting the waiver restores 'missing' and keeps the history | 13 |
| PASS | expected-document waivers (ADR-0016) waiver facts land in the audit trail | 4 |

## apps/api/src/auditor.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /studies/{id}/binder (ADR-0028) serves the taxonomy in reference-model order with filed documents attached | 67 |
| PASS | GET /studies/{id}/binder (ADR-0028) rolls up expected-document status per artifact from the same view | 26 |
| PASS | GET /studies/{id}/binder (ADR-0028) is a study-scoped read: the site seat gets 403 | 2 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) /me names the person and the single unscoped read_only grant | 4 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) reads the whole record: studies, binder, portfolio, audit trail, chain, bytes | 1115 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) cannot change anything (§11.10(g)): upload, sign, bulk-approve, grant, sync all 403 | 30 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 11 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 10 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 3 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 24 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 117 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 8 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 19 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 22 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 33 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 10 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 83 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 5 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 110 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 8 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 7 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 209 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 32 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 23 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 48 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 4 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 124 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 25 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 22 |

## apps/api/src/bulk-review.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | bulk approval (ADR-0026) one re-authentication opens the series; each version gains its own signature bound to its own hash (§11.200 §11.70) | 242 |
| PASS | bulk approval (ADR-0026) refuses the whole selection with every blocker listed, signing nothing | 99 |
| PASS | bulk approval (ADR-0026) requires approve authority (a monitor holds sign, not approve) | 14 |
| PASS | bulk approval (ADR-0026) refuses the series without valid re-authentication (§11.200) | 20 |
| PASS | bulk return (ADR-0026 over ADR-0015) returns the selection with one shared immutable reason | 50 |
| PASS | bulk return (ADR-0026 over ADR-0015) refuses an empty reason | 14 |

## apps/api/src/document-content.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /document-versions/{id}/content (ADR-0027) returns the exact bytes with the uploaded mime type, file name, and hash (§11.10(b)) | 55 |
| PASS | GET /document-versions/{id}/content (ADR-0027) requires authentication | 20 |
| PASS | GET /document-versions/{id}/content (ADR-0027) is scoped to the version's site: the site seat reads its own site only | 34 |
| PASS | GET /document-versions/{id}/content (ADR-0027) study-wide read reaches every site's documents | 19 |
| PASS | GET /document-versions/{id}/content (ADR-0027) 404s an unknown version id | 4 |

## apps/api/src/ems-import.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | EMS import surface (ADR-0025) GET /tmf-artifacts carries the TMF RM unique ID, the EMS mapping key | 21 |
| PASS | EMS import surface (ADR-0025) GET /studies/{id}/filings starts empty for a source system that never filed | 9 |
| PASS | EMS import surface (ADR-0025) imports a partner batch through the filing endpoint as the ingest identity, idempotently | 223 |
| PASS | EMS import surface (ADR-0025) POST /documents/{id}/versions appends to exactly that document | 30 |
| PASS | EMS import surface (ADR-0025) refuses to grow a superseded document — closed history stays closed | 77 |

## apps/api/src/portfolio.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | portfolio (ADR-0021) returns one row per study, ordered by protocol number | 964 |
| PASS | portfolio (ADR-0021) rolls up the second study exactly as seeded — studies do not bleed into each other | 689 |
| PASS | portfolio (ADR-0021) is readable with any read-permitting grant | 688 |
| PASS | portfolio (ADR-0021) per-study surfaces stay scoped: 2202's expected documents are only its own | 754 |

## apps/api/src/return.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | return-for-correction (ADR-0015) records the returner, reason, and time, and moves the document to 'returned' | 205 |
| PASS | return-for-correction (ADR-0015) requires 'approve' permission: the monitor role gets 403 | 18 |
| PASS | return-for-correction (ADR-0015) rejects a blank reason at the schema boundary | 15 |
| PASS | return-for-correction (ADR-0015) a returned version can never be approved | 31 |
| PASS | return-for-correction (ADR-0015) a corrected version reopens review, and only it can be approved | 56 |
| PASS | return-for-correction (ADR-0015) only a pending_review document can be returned | 10 |
| PASS | return-for-correction (ADR-0015) only the latest version can be returned | 38 |
| PASS | return-for-correction (ADR-0015) the return lands in the document's audit trail | 37 |

## apps/api/src/review-queue.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | review queue (ADR-0018) an unassigned pending version sits in the queue as 'unassigned' | 228 |
| PASS | review queue (ADR-0018) assigning with a past due date derives 'overdue'; filters find it | 99 |
| PASS | review queue (ADR-0018) reassignment inserts a new row and the latest one stands | 89 |
| PASS | review queue (ADR-0018) the assignee must be able to approve: a monitor-role assignee is refused | 80 |
| PASS | review queue (ADR-0018) assigning takes 'approve' authority: the monitor token gets 403 | 50 |
| PASS | review queue (ADR-0018) approval clears the entry from the queue — the assignment resolves itself | 117 |
| PASS | review queue (ADR-0018) a return clears the entry too, and the returned version cannot be assigned | 77 |
| PASS | review queue (ADR-0018) assignments land on the document detail and in the audit trail | 84 |

## apps/api/src/search.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | document search (ADR-0019) finds a document by title words, stem-free but case-insensitive | 44 |
| PASS | document search (ADR-0019) every token must match: adding a person narrows to their documents | 33 |
| PASS | document search (ADR-0019) matches artifact codes and site numbers ('04.01 002') | 17 |
| PASS | document search (ADR-0019) filters by document status | 9 |
| PASS | document search (ADR-0019) LIKE wildcards in the query are literals, not injection | 14 |
| PASS | document search (ADR-0019) a one-character query is rejected at the schema boundary | 2 |
| PASS | document search (ADR-0019) read permission suffices: the monitor can search | 12 |
| PASS | content full-text search (ADR-0022) a word that exists only inside the PDF finds the document, with a snippet | 137 |
| PASS | content full-text search (ADR-0022) tokens mix freely across metadata and content | 13 |
| PASS | content full-text search (ADR-0022) a metadata-only match carries no snippet | 15 |
| PASS | content full-text search (ADR-0022) unextractable bytes never block the upload; the failure is recorded | 28 |

## apps/api/src/site-seat.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | the site seat is a permission scope (ADR-0023) /me names the person and the site-scoped grant | 22 |
| PASS | the site seat is a permission scope (ADR-0023) reads its own site: overview, expected documents, enrollment, staff | 45 |
| PASS | the site seat is a permission scope (ADR-0023) is refused everywhere else — other sites, study-wide reads, the portfolio (§11.10(g)) | 13 |
| PASS | delegation-of-authority log (ADR-0023) site staff records a delegation; the view derives active + PI check | 41 |
| PASS | delegation-of-authority log (ADR-0023) an authorizer who never held the PI role is flagged, not refused | 18 |
| PASS | delegation-of-authority log (ADR-0023) refuses self-delegation, empty tasks, and monitor authorship (§11.10(g)) | 26 |
| PASS | delegation-of-authority log (ADR-0023) ending is a dated fact; ending twice refuses | 31 |
| PASS | delegation-of-authority log (ADR-0023) log writes land in the audit trail attributed to the site persona | 5 |
| PASS | training log (ADR-0023) records a completion and derives expiry status | 23 |
| PASS | training log (ADR-0023) refuses a blank topic and an expiry before completion | 22 |
| PASS | training log (ADR-0023) oversight reads the log; the monitor cannot write it | 12 |

## apps/web/src/api.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | errorMessage maps 403 to a permission message | 1 |
| PASS | errorMessage surfaces the server's message for 4xx validation errors | 0 |
| PASS | errorMessage hides 5xx detail behind a plain retry message | 0 |
| PASS | errorMessage treats fetch TypeErrors as connectivity problems | 0 |
| PASS | errorMessage falls back to a generic message for unknown errors | 0 |

## apps/web/src/renditions.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | renditionKind detects office formats by mime type | 1 |
| PASS | renditionKind falls back to the extension only when the mime says nothing | 0 |
| PASS | renditionKind leaves everything else as a download offer | 0 |
| PASS | renderRendition docx converts paragraphs to a self-contained HTML document | 99 |
| PASS | renderRendition docx escapes markup smuggled in document text | 16 |
| PASS | renderRendition docx rejects bytes that are not a docx | 2 |
| PASS | renderRendition xlsx renders every sheet as a named table | 92 |
| PASS | renderRendition xlsx escapes markup smuggled in cells and sheet names | 15 |
| PASS | renderRendition xlsx reads shared-string workbooks (how Excel itself writes strings) | 18 |
| PASS | renderRendition xlsx caps huge sheets and says so | 36 |

Reviewed by: ______________________  Date: ____________
