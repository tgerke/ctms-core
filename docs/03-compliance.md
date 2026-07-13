# Compliance mapping

What "compliant-by-design" means here: the mechanisms 21 CFR Part 11 and ICH
E6(R3) require are properties of the database schema, enforced below the
application layer. What it does **not** mean: that this software is validated.
Formal computer system validation (GAMP 5 categorization, risk assessment,
IQ/OQ/PQ, SOPs, training records) is a separate, deliberate program that has not
been performed. This document maps requirement → mechanism so that a future
validation effort inherits architecture instead of retrofit.

## 21 CFR Part 11 — electronic records

| Requirement | Mechanism | Where |
| --- | --- | --- |
| §11.10(a) validation of systems | **Not claimed**, but the raw material is generated, not hand-written: `pnpm validation:iq` checks a live environment's controls (15 checks, sign-off report), `pnpm validation:artifacts` emits an OQ run report and a requirement→test traceability matrix from a live suite run. Formal CSV (GAMP 5, SOPs, training) remains an organizational program | `tools/validation-artifacts.ts`, `packages/db/src/iq.ts`, `docs/validation/` |
| §11.10(b) accurate and complete copies | Every version's bytes are content-addressed (sha256) and immutable; API serves originals at `/files/{sha256}` and, scoped to the version's study/site, at `/document-versions/{id}/content` — the UI's preview shows these exact bytes; no rendition is ever stored or served, and office formats render client-side in the viewer's browser from those same bytes, labeled as a reading aid (ADR-0027, ADR-0030) | `document_version`, blob store |
| §11.10(c) record protection & retention | Versions, signatures, and audit events reject UPDATE/DELETE via database triggers, for every role | `ctms_forbid_mutation()` in migration 0001 |
| §11.10(d) limited system access | OIDC/SSO (`AUTH_MODE=oidc`): JWTs validated against the IdP's issuer, audience, and JWKS; the verified email claim resolves to a person, or the request is refused — never a fallback actor. The API runs as a least-privilege DB role (`ctms_app`: DML only, no TRUNCATE/DDL, no direct audit writes). A dev-token mode remains for the demo and is not a Part 11 posture | `apps/api/src/auth.ts`, migration 0004, ADR-0008 |
| §11.10(e) audit trails | Computer-generated, timestamped `audit_event` rows written by AFTER-triggers on every domain-table mutation; append-only; prior values preserved as full row images; **hash-chained** so retroactive edits are detectable (`ctms_verify_audit_chain()`) | `ctms_audit()` in migration 0001, ADR-0003 |
| §11.10(g) authority checks | Role-based grants (`access_grant`: admin / trial_ops / monitor / read_only / ingest / site_staff → read / upload / sign / approve / administer / log, scoped to study or site; `ingest` is the machine-identity role for source-system filing, ADR-0011; `site_staff` is the site seat and `log` gates writing a site's own DoA/training entries, ADR-0023) enforced per route; grant changes are themselves audited and revocation is a fact, not a delete. Actor identity bound per transaction (`ctms.actor_id`) | `packages/core/src/authz.ts`, ADR-0008 |
| §11.50 signature manifestation | `signature` rows carry signer, timestamp, and meaning (author/review/approval); UI displays all three | `signature` table, document page |
| §11.70 signature/record linking | Signature stores a copy of the signed version's content hash; binding is verifiable independently of the version row. The web demonstrates it on demand: "Verify bytes" re-fetches the version's content, recomputes SHA-256 in the reader's browser, and compares against the recorded hash and every signature bound to it (ADR-0028) | `signed_sha256` column, document page |
| §11.200 signature components | Signing requires re-authentication: in OIDC mode a freshly issued token for the same subject with `auth_time` inside a short window (default 300 s); method and time are recorded on the signature row, and a DB CHECK requires them on every new signature. The dev-mode stub restates the bearer token — API-shape parity, not a credential challenge. Bulk approval is a §11.200(a)(1)(i) series of signings: one re-authentication opens the series, and every version still gains its own recorded signature (ADR-0026) | sign + bulk-approve routes, `verifyReauth()`, migration 0003 |

## ICH E6(R3) — essential records

| Expectation | Mechanism |
| --- | --- |
| Records identifiable, version-controlled | Typed by TMF RM artifact + scoped identity; monotonic immutable versions |
| Completeness of essential records | Requirement rules + `v_expected_document_status`: expected-vs-actual is continuously computed, per site and per person |
| Access, availability, readability | Relational queries + documented API; records retrievable by identity, not folder-path memory |
| Records protected from unauthorised alteration and from inappropriate destruction or accidental loss (2.12.9, 3.16.1(v)) | DB-level immutability; deletes of domain rows are themselves audited events |
| Protection of blind / privacy when sharing | Out of scope this phase (single-tenant demo; no blinded roles yet) |

## Honest gaps (current phase)

1. **The validation *program* is not performed** — the software now generates
   its raw material (traceability matrix, IQ and OQ reports), but a CSV dossier
   also needs SOPs, risk assessment, training records, and a QMS to live in.
   That is organizational work no repository can contain.
2. **Dev mode still exists** — `AUTH_MODE=dev` and the dev-grade role passwords
   (`ctms_app`, `ctms_readonly`) are demo affordances. A production deployment
   must run `AUTH_MODE=oidc` and rotate the DB role credentials
   (`docs/05-deployment.md`); nothing in the code forces that choice.
3. **WORM depends on deployment** — the s3 driver with Object Lock extends
   immutability to the bytes; the default local-directory driver does not.
   `pnpm validation:iq` flags which one an environment is running.
4. **Single tenant** — one deployment per customer. Multi-tenancy hardening
   (isolation, per-tenant keys) remains a non-goal of this phase.
5. **`expected_document` churn is unaudited by design** — placeholders are
   derived state (ADR-0004); the ground truth they derive from is fully audited.
   The same stance covers `document_content_text` (ADR-0022): extracted search
   text is rebuildable from the immutable, audited bytes at any time.

Resolved since the first draft of this document: dev-token-only auth (now
OIDC + RBAC, ADR-0008), stubbed signing re-authentication (§11.200 row above),
unblocked TRUNCATE (least-privilege `ctms_app` role, migration 0004), and the
40-artifact taxonomy ceiling (verbatim CDISC importer, `pnpm db:import-tmf`).
