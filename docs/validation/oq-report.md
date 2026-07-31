# Operational Qualification report

Environment: commit 6407a92, node v23.11.0, 2026-07-31T19:35:02.041Z

Suite result: **PASSED** — 210/210 tests passed.

## packages/core/src/digest.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | digest notifications (ADR-0017) collects a digest whose numbers cohere with the views | 27 |
| PASS | digest notifications (ADR-0017) renders a subject and body that carry the study and the counts | 10 |
| PASS | digest notifications (ADR-0017) a broken chain leads the email and the subject count | 9 |
| PASS | digest notifications (ADR-0017) recipients are the study-wide admin/trial_ops seats, nobody else | 1 |

## packages/core/src/ems-import.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | parseExchangeXml (ADR-0025) parses a partner batch: attributes, objects, files, metadata | 4 |
| PASS | parseExchangeXml (ADR-0025) round-trips this system's own export | 2 |
| PASS | parseExchangeXml (ADR-0025) reports every structural gap at once | 0 |
| PASS | parseSri decodes the SRI sha256 our export emits back to the hex digest | 0 |
| PASS | parseSri rejects non-SRI values | 0 |
| PASS | planEmsImport (ADR-0025) threads iterations onto one document and maps by UNIQUEID | 1 |
| PASS | planEmsImport (ADR-0025) skips identical already-filed versions and threads onto the existing document | 1 |
| PASS | planEmsImport (ADR-0025) refuses, all blockers at once: unknown UNIQUEID, unknown site, bad checksum | 1 |
| PASS | planEmsImport (ADR-0025) refuses an un-imported taxonomy (no unique IDs anywhere) | 1 |
| PASS | planEmsImport (ADR-0025) refuses a re-sent version whose content changed (versions are immutable) | 0 |
| PASS | planEmsImport (ADR-0025) refuses country-level and RESTRICTED objects — no honest home in the schema | 0 |
| PASS | planEmsImport (ADR-0025) warns when ARTIFACTNUMBER disagrees with the imported taxonomy — UNIQUEID wins | 0 |
| PASS | EmsBatch typing emsSourceRef is the provenance key format the filings endpoint threads on | 0 |

## packages/core/src/ems.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | exchange.xml serialization (ADR-0024) maps batch attributes, object order, and version state per spec/XSD | 3 |
| PASS | exchange.xml serialization (ADR-0024) computes the SRI checksum the standard cites (sha256, base64) | 0 |
| PASS | exchange.xml serialization (ADR-0024) marks the latest iteration of a returned document Obsolete | 0 |
| PASS | exchange.xml serialization (ADR-0024) emits site-level identifiers for site-scoped documents | 0 |
| PASS | exchange.xml serialization (ADR-0024) refuses to fabricate: every blocker reported at once, nothing emitted | 0 |
| PASS | exchange.xml serialization (ADR-0024) refuses an empty batch (XSD requires at least one OBJECT) | 0 |
| PASS | exchange.xml against the seeded study serializes the full study and validates against the official XSD | 101 |

## packages/core/src/engine.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | requirement engine materializes site- and person-scoped placeholders when scope appears | 54 |
| PASS | requirement engine is idempotent | 3 |
| PASS | derived status (ADR-0004) derives expired and expiring_soon from effective_date + validity | 6 |
| PASS | upload -> sign lifecycle lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70) | 57 |

## packages/core/src/export.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF export (ADR-0020) collects every document with versions, signatures, and returns intact | 36 |
| PASS | TMF export (ADR-0020) every referenced blob exists and hashes to its recorded sha256 | 41 |
| PASS | TMF export (ADR-0020) carries the whole audit trail with a verified chain and its head hash | 16 |
| PASS | TMF export (ADR-0020) the expected-document snapshot matches the live view | 17 |

## packages/core/src/operations.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | monitoring visit lifecycle (derived, never stored) walks scheduled -> overdue -> awaiting_report -> report_pending_review -> follow_up -> complete | 116 |
| PASS | monitoring visit lifecycle (derived, never stored) approving one visit's trip report does not supersede another visit's report | 16 |
| PASS | issue lifecycle (derived) derives open, overdue, and resolved from dated facts | 9 |
| PASS | enrollment reports latest as_of_date wins in v_site_enrollment; corrections are audited upserts | 11 |

## packages/db/src/content-text.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | extractContentText (ADR-0022) extracts the text of a PDF | 49 |
| PASS | extractContentText (ADR-0022) passes text/* through with whitespace normalized | 0 |
| PASS | extractContentText (ADR-0022) records other mime types as unsupported | 0 |
| PASS | extractContentText (ADR-0022) records malformed PDF bytes as failed, without throwing | 1 |
| PASS | OCR of image-only PDFs (ADR-0031) recovers text that exists only as pixels | 537 |

## packages/db/src/immutability.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE on audit_event at the database level | 21 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects DELETE on audit_event | 1 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_version | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on signature | 2 |
| PASS | append-only enforcement (Part 11 §11.10(c) §11.10(e)) rejects UPDATE and DELETE on document_return (ADR-0015) | 2 |
| PASS | audit trail (§11.10(e)) writes an attributed, chained event for every domain mutation | 6 |
| PASS | audit trail (§11.10(e)) verifies clean on untampered data | 21 |
| PASS | audit trail (§11.10(e)) detects tampering when a row is altered with triggers disabled | 17 |

## packages/db/src/import-tmf.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | TMF RM importer finds the header row, carries merged names forward, skips non-artifacts | 3 |
| PASS | TMF RM importer rejects a workbook with no recognizable TMF RM sheet | 1 |
| PASS | TMF RM importer upserts idempotently: re-import updates names in place, no duplicates | 36 |

## packages/db/src/privileges.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot TRUNCATE domain tables | 20 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot disable triggers (not the table owner) | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot run DDL in the schema | 1 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) cannot write audit_event directly, yet its DML is still audited | 4 |
| PASS | least-privilege runtime role (§11.10(c) §11.10(d)) keeps immutability guarantees (UPDATE/DELETE rejected by trigger) | 1 |

## packages/db/src/storage.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | local driver contract stores content-addressed, round-trips bytes, reports presence | 2 |
| PASS | s3 driver (MinIO, Object Lock) s3 driver contract stores content-addressed, round-trips bytes, reports presence | 43 |
| PASS | s3 driver (MinIO, Object Lock) WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential | 19 |

## apps/api/src/admin.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | site onboarding (ADR-0016) onboards a site end to end: org → site → study-site → activate → staff → sync | 52 |
| PASS | site onboarding (ADR-0016) duplicate site number on the study is refused | 5 |
| PASS | site onboarding (ADR-0016) ending a role is a dated fact, not a delete | 9 |
| PASS | site onboarding (ADR-0016) admin mutations are attributed in the audit trail | 2 |
| PASS | site onboarding (ADR-0016) the monitor role gets 403 on every admin mutation | 19 |
| PASS | site onboarding (ADR-0016) grants and revokes access; revocation is a fact, revoking twice refuses | 14 |
| PASS | site onboarding (ADR-0016) creates and updates a requirement rule, and sync materializes it | 13 |
| PASS | expected-document waivers (ADR-0016) waiving turns 'missing' into 'waived' with the reason on the view | 6 |
| PASS | expected-document waivers (ADR-0016) waived items leave the completeness denominator | 1 |
| PASS | expected-document waivers (ADR-0016) a second active waiver is refused; a blank reason is a 400 | 4 |
| PASS | expected-document waivers (ADR-0016) the monitor role cannot waive | 1 |
| PASS | expected-document waivers (ADR-0016) a filed document beats the waiver | 55 |
| PASS | expected-document waivers (ADR-0016) lifting the waiver restores 'missing' and keeps the history | 6 |
| PASS | expected-document waivers (ADR-0016) waiver facts land in the audit trail | 1 |

## apps/api/src/auditor.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /studies/{id}/binder (ADR-0028) serves the taxonomy in reference-model order with filed documents attached | 43 |
| PASS | GET /studies/{id}/binder (ADR-0028) rolls up expected-document status per artifact from the same view | 12 |
| PASS | GET /studies/{id}/binder (ADR-0028) is a study-scoped read: the site seat gets 403 | 1 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) /me names the person and the single unscoped read_only grant | 2 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) reads the whole record: studies, binder, portfolio, audit trail, chain, bytes | 115 |
| PASS | the auditor's seat: unscoped read_only (ADR-0028) cannot change anything (§11.10(g)): upload, sign, bulk-approve, grant, sync all 403 | 13 |

## apps/api/src/auth-dev.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | authentication (§11.10(d)) rejects a missing or unknown bearer token with 401 | 12 |
| PASS | authentication (§11.10(d)) resolves a dev token to a person and serves the request | 5 |
| PASS | authorization (§11.10(g), ADR-0008) denies operations the role does not include, naming the permission | 2 |
| PASS | authorization (§11.10(g), ADR-0008) allows reads for every seeded role | 13 |
| PASS | authorization (§11.10(g), ADR-0008) denies approval signatures to the monitor role but allows review | 75 |
| PASS | authorization (§11.10(g), ADR-0008) enforces grant scope: a study-scoped grant does not reach other studies | 6 |
| PASS | accurate and complete copies (§11.10(b)) serves the original bytes at /files/{sha256}, verifiable against the hash | 13 |
| PASS | signing re-authentication (§11.200) rejects a signature without valid re-authentication | 10 |
| PASS | signing re-authentication (§11.200) records the re-auth method and time on the signature row | 14 |
| PASS | signing re-authentication (§11.200) is DB-enforced: a direct INSERT without re-auth fields is rejected | 4 |

## apps/api/src/auth-oidc.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | OIDC authentication (§11.10(d)) accepts a valid token and resolves the person by email claim | 26 |
| PASS | OIDC authentication (§11.10(d)) rejects a token for the wrong audience | 2 |
| PASS | OIDC authentication (§11.10(d)) rejects a forged token (wrong key) | 19 |
| PASS | OIDC authentication (§11.10(d)) rejects an authenticated identity with no person record (403, not a fallback actor) | 3 |
| PASS | OIDC authentication (§11.10(d)) rejects a token whose email is explicitly unverified | 2 |
| PASS | OIDC signing re-authentication (§11.200) accepts a fresh re-auth token for the same subject and records it | 91 |
| PASS | OIDC signing re-authentication (§11.200) rejects a stale re-auth token (auth_time outside the freshness window) | 30 |
| PASS | OIDC signing re-authentication (§11.200) rejects a re-auth token minted for a different subject | 10 |

## apps/api/src/auth-service.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | machine identity (ADR-0011) authenticates a configured service subject with no email claim | 38 |
| PASS | machine identity (ADR-0011) still rejects an unconfigured subject with no email claim | 5 |
| PASS | machine identity (ADR-0011) files a document with provenance, attributed to the service actor | 61 |
| PASS | machine identity (ADR-0011) cannot sign: ingest grants upload but no signing ceremony | 13 |
| PASS | machine identity (ADR-0011) leaves provenance null for uploads that do not claim it | 7 |

## apps/api/src/bulk-review.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | bulk approval (ADR-0026) one re-authentication opens the series; each version gains its own signature bound to its own hash (§11.200 §11.70) | 115 |
| PASS | bulk approval (ADR-0026) refuses the whole selection with every blocker listed, signing nothing | 40 |
| PASS | bulk approval (ADR-0026) requires approve authority (a monitor holds sign, not approve) | 6 |
| PASS | bulk approval (ADR-0026) refuses the series without valid re-authentication (§11.200) | 7 |
| PASS | bulk return (ADR-0026 over ADR-0015) returns the selection with one shared immutable reason | 20 |
| PASS | bulk return (ADR-0026 over ADR-0015) refuses an empty reason | 6 |

## apps/api/src/document-content.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /document-versions/{id}/content (ADR-0027) returns the exact bytes with the uploaded mime type, file name, and hash (§11.10(b)) | 30 |
| PASS | GET /document-versions/{id}/content (ADR-0027) requires authentication | 9 |
| PASS | GET /document-versions/{id}/content (ADR-0027) is scoped to the version's site: the site seat reads its own site only | 13 |
| PASS | GET /document-versions/{id}/content (ADR-0027) study-wide read reaches every site's documents | 6 |
| PASS | GET /document-versions/{id}/content (ADR-0027) 404s an unknown version id | 1 |

## apps/api/src/ems-import.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | EMS import surface (ADR-0025) GET /tmf-artifacts carries the TMF RM unique ID, the EMS mapping key | 12 |
| PASS | EMS import surface (ADR-0025) GET /studies/{id}/filings starts empty for a source system that never filed | 4 |
| PASS | EMS import surface (ADR-0025) imports a partner batch through the filing endpoint as the ingest identity, idempotently | 146 |
| PASS | EMS import surface (ADR-0025) POST /documents/{id}/versions appends to exactly that document | 13 |
| PASS | EMS import surface (ADR-0025) refuses to grow a superseded document — closed history stays closed | 30 |

## apps/api/src/log-signatures.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | screening log (ADR-0036) site staff records a screening; the view derives in_screening | 51 |
| PASS | screening log (ADR-0036) records the enrolled outcome once; a second outcome refuses | 13 |
| PASS | screening log (ADR-0036) a screen failure requires its documented reason | 12 |
| PASS | screening log (ADR-0036) refuses a duplicate screening number at the same site | 5 |
| PASS | screening log (ADR-0036) oversight reads the log; monitor and auditor cannot write it (§11.10(g)) | 8 |
| PASS | screening log (ADR-0036) the summary cross-checks the log's counts against the latest report | 11 |
| PASS | entry-level e-signatures (ADR-0036) signing requires verified re-authentication (§11.200) | 3 |
| PASS | entry-level e-signatures (ADR-0036) records signer, meaning, and timestamp, bound to the entry's facts by hash (§11.50 §11.70) | 11 |
| PASS | entry-level e-signatures (ADR-0036) a permitted mutation after signing is detectable: facts_match flips, nothing blocks | 17 |
| PASS | entry-level e-signatures (ADR-0036) monitors may attest from oversight; the read-only auditor cannot sign; other sites stay closed | 7 |
| PASS | entry-level e-signatures (ADR-0036) training and screening entries sign through the same ceremony | 19 |
| PASS | entry-level e-signatures (ADR-0036) signature rows are immutable at the database level (§11.10(c)) | 6 |
| PASS | entry-level e-signatures (ADR-0036) log signatures land in the audit trail attributed to the signer (§11.10(e)) | 5 |

## apps/api/src/oversight.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | GET /studies/{id}/digest (ADR-0017) serves the digest email's data, rendering, and recipients | 35 |
| PASS | GET /studies/{id}/digest (ADR-0017) 404s an unknown study | 1 |
| PASS | GET /studies/{id}/digest (ADR-0017) is study-wide: the site seat gets 403, the auditor reads it | 9 |
| PASS | GET /studies/{id}/export (ADR-0020/0035) serves the package data: documents, expected snapshot, full trail, content hashes | 21 |
| PASS | GET /studies/{id}/export (ADR-0020/0035) 404s an unknown study | 2 |
| PASS | GET /studies/{id}/export (ADR-0020/0035) is study-wide: the site seat gets 403, the auditor reads it | 16 |

## apps/api/src/portfolio.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | portfolio (ADR-0021) returns one row per study, ordered by protocol number | 103 |
| PASS | portfolio (ADR-0021) rolls up the second study exactly as seeded — studies do not bleed into each other | 47 |
| PASS | portfolio (ADR-0021) is readable with any read-permitting grant | 47 |
| PASS | portfolio (ADR-0021) per-study surfaces stay scoped: 2202's expected documents are only its own | 51 |

## apps/api/src/return.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | return-for-correction (ADR-0015) records the returner, reason, and time, and moves the document to 'returned' | 82 |
| PASS | return-for-correction (ADR-0015) requires 'approve' permission: the monitor role gets 403 | 13 |
| PASS | return-for-correction (ADR-0015) rejects a blank reason at the schema boundary | 10 |
| PASS | return-for-correction (ADR-0015) a returned version can never be approved | 20 |
| PASS | return-for-correction (ADR-0015) a corrected version reopens review, and only it can be approved | 24 |
| PASS | return-for-correction (ADR-0015) only a pending_review document can be returned | 3 |
| PASS | return-for-correction (ADR-0015) only the latest version can be returned | 15 |
| PASS | return-for-correction (ADR-0015) the return lands in the document's audit trail | 14 |

## apps/api/src/review-queue.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | review queue (ADR-0018) an unassigned pending version sits in the queue as 'unassigned' | 73 |
| PASS | review queue (ADR-0018) assigning with a past due date derives 'overdue'; filters find it | 18 |
| PASS | review queue (ADR-0018) reassignment inserts a new row and the latest one stands | 20 |
| PASS | review queue (ADR-0018) the assignee must be able to approve: a monitor-role assignee is refused | 10 |
| PASS | review queue (ADR-0018) assigning takes 'approve' authority: the monitor token gets 403 | 7 |
| PASS | review queue (ADR-0018) approval clears the entry from the queue — the assignment resolves itself | 26 |
| PASS | review queue (ADR-0018) a return clears the entry too, and the returned version cannot be assigned | 31 |
| PASS | review queue (ADR-0018) assignments land on the document detail and in the audit trail | 23 |

## apps/api/src/search.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | document search (ADR-0019) finds a document by title words, stem-free but case-insensitive | 22 |
| PASS | document search (ADR-0019) every token must match: adding a person narrows to their documents | 14 |
| PASS | document search (ADR-0019) matches artifact codes and site numbers ('04.01 002') | 7 |
| PASS | document search (ADR-0019) filters by document status | 4 |
| PASS | document search (ADR-0019) LIKE wildcards in the query are literals, not injection | 6 |
| PASS | document search (ADR-0019) a one-character query is rejected at the schema boundary | 1 |
| PASS | document search (ADR-0019) read permission suffices: the monitor can search | 5 |
| PASS | content full-text search (ADR-0022) a word that exists only inside the PDF finds the document, with a snippet | 65 |
| PASS | content full-text search (ADR-0022) tokens mix freely across metadata and content | 5 |
| PASS | content full-text search (ADR-0022) a metadata-only match carries no snippet | 5 |
| PASS | content full-text search (ADR-0022) unextractable bytes never block the upload; the failure is recorded | 12 |
| PASS | relevance ranking (ADR-0037) a title match outranks a content-only match, whatever uploaded last | 15 |
| PASS | relevance ranking (ADR-0037) more content occurrences rank higher, capped so bulk cannot run away | 20 |
| PASS | relevance ranking (ADR-0037) equal ranks keep the previous ordering: latest upload first | 17 |

## apps/api/src/site-seat.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | the site seat is a permission scope (ADR-0023) /me names the person and the site-scoped grant | 10 |
| PASS | the site seat is a permission scope (ADR-0023) reads its own site: overview, expected documents, enrollment, staff | 25 |
| PASS | the site seat is a permission scope (ADR-0023) is refused everywhere else — other sites, study-wide reads, the portfolio (§11.10(g)) | 9 |
| PASS | delegation-of-authority log (ADR-0023) site staff records a delegation; the view derives active + PI check | 27 |
| PASS | delegation-of-authority log (ADR-0023) an authorizer who never held the PI role is flagged, not refused | 12 |
| PASS | delegation-of-authority log (ADR-0023) refuses self-delegation, empty tasks, and monitor authorship (§11.10(g)) | 8 |
| PASS | delegation-of-authority log (ADR-0023) ending is a dated fact; ending twice refuses | 11 |
| PASS | delegation-of-authority log (ADR-0023) log writes land in the audit trail attributed to the site persona | 2 |
| PASS | training log (ADR-0023) records a completion and derives expiry status | 7 |
| PASS | training log (ADR-0023) refuses a blank topic and an expiry before completion | 5 |
| PASS | training log (ADR-0023) oversight reads the log; the monitor cannot write it | 5 |

## apps/api/src/study-startup.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | study creation (ADR-0034) creates a study in planning with template rules cloned and expected documents materialized | 37 |
| PASS | study creation (ADR-0034) attributes study creation to the actor in the audit trail (§11.10(e)) | 1 |
| PASS | study creation (ADR-0034) refuses creation to monitor, site, and auditor seats (§11.10(g)) | 3 |
| PASS | study creation (ADR-0034) rejects a duplicate protocol number | 9 |
| PASS | study creation (ADR-0034) rejects an unknown template study and an unknown sponsor | 8 |
| PASS | guided startup (ADR-0034) derives the startup checklist from facts, never state | 53 |
| PASS | guided startup (ADR-0034) enforces forward-only status transitions | 9 |
| PASS | guided startup (ADR-0034) study updates take administer for that study (§11.10(g)) | 1 |

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
| PASS | renderRendition docx converts paragraphs to a self-contained HTML document | 53 |
| PASS | renderRendition docx escapes markup smuggled in document text | 5 |
| PASS | renderRendition docx rejects bytes that are not a docx | 1 |
| PASS | renderRendition xlsx renders every sheet as a named table | 32 |
| PASS | renderRendition xlsx escapes markup smuggled in cells and sheet names | 6 |
| PASS | renderRendition xlsx reads shared-string workbooks (how Excel itself writes strings) | 5 |
| PASS | renderRendition xlsx caps huge sheets and says so | 13 |

## apps/web/src/tmf-export.test.ts

| Result | Test | ms |
| --- | --- | ---: |
| PASS | buildTmfPackage (ADR-0035) writes the CLI's file set, in the CLI's order | 2 |
| PASS | buildTmfPackage (ADR-0035) writes the CLI's manifest shape, listing every file but itself | 1 |
| PASS | buildTmfPackage (ADR-0035) emits a shasum -c compatible sidecar covering manifest.json too | 1 |
| PASS | buildTmfPackage (ADR-0035) refuses to include bytes that fail verification, and reports them | 0 |

Reviewed by: ______________________  Date: ____________
