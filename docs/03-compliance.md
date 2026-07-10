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
| §11.10(a) validation of systems | **Not claimed.** Automated tests cover the audit, immutability, and signature mechanisms; formal CSV is future work | `packages/*/test` |
| §11.10(b) accurate and complete copies | Every version's bytes are content-addressed (sha256) and immutable; API serves originals at `/files/{sha256}` | `document_version`, blob store |
| §11.10(c) record protection & retention | Versions, signatures, and audit events reject UPDATE/DELETE via database triggers, for every role | `ctms_forbid_mutation()` in migration 0001 |
| §11.10(d) limited system access | Bearer-token auth resolving to a person; all data routes require it. Dev-grade — a real IdP is a non-goal of this phase | `apps/api/src/auth.ts` |
| §11.10(e) audit trails | Computer-generated, timestamped `audit_event` rows written by AFTER-triggers on every domain-table mutation; append-only; prior values preserved as full row images; **hash-chained** so retroactive edits are detectable (`ctms_verify_audit_chain()`) | `ctms_audit()` in migration 0001, ADR-0003 |
| §11.10(g) authority checks | Actor identity bound per transaction (`ctms.actor_id`); signing requires a person-linked token | `withActor()`, sign route |
| §11.50 signature manifestation | `signature` rows carry signer, timestamp, and meaning (author/review/approval); UI displays all three | `signature` table, document page |
| §11.70 signature/record linking | Signature stores a copy of the signed version's content hash; binding is verifiable independently of the version row | `signed_sha256` column |
| §11.200 signature components | **Partial.** Signature is tied to an authenticated identity but re-authentication at signing (password challenge) is stubbed | future work |

## ICH E6(R3) — essential records

| Expectation | Mechanism |
| --- | --- |
| Records identifiable, version-controlled | Typed by TMF RM artifact + scoped identity; monotonic immutable versions |
| Completeness of essential records | Requirement rules + `v_expected_document_status`: expected-vs-actual is continuously computed, per site and per person |
| Access, availability, readability | Relational queries + documented API; records retrievable by identity, not folder-path memory |
| Control of records, prevention of premature destruction | DB-level immutability; deletes of domain rows are themselves audited events |
| Protection of blind / privacy when sharing | Out of scope this phase (single-tenant demo; no blinded roles yet) |

## Honest gaps (current phase)

1. **No validation dossier** — the largest gap between this and a marketable
   claim; the mechanisms above are its raw material.
2. **Authentication is a dev stub** — SSO/IdP with per-user credentials and
   signing re-challenge is required for a real Part 11 posture.
3. **TRUNCATE is not blocked** — dev seeding truncates tables. A production
   role simply would not hold TRUNCATE/DDL privileges; the migration role would.
4. **Blob store is a local directory** — production needs S3-class storage with
   object lock (WORM) to extend immutability to the bytes themselves.
5. **`expected_document` churn is unaudited by design** — placeholders are
   derived state (ADR-0004); the ground truth they derive from is fully audited.
