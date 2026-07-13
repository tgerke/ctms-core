# Vision

## Problem

Clinical trial regulatory documents live in eBinder/eISF and eTMF systems (Florence
eBinders, Veeva Vault/SiteVault) that are, structurally, compliant document buckets:
folders of PDFs with metadata tags. They satisfy 21 CFR Part 11 and ICH GCP, which is
why organizations buy them — but they have no relational data model. The questions a
sponsor or CRO-side team actually asks are relational:

- Which people at which sites have completed which documents?
- What is expected but missing, at every site, right now?
- Whose credentials (CV, license, GCP training) expire in the next 60 days?
- Which sites still lack IRB approval for protocol amendment 3?

In incumbent systems these are answered by coordinators clicking through folders, by
monitoring visits, or by exported spreadsheets. Their APIs are afterthoughts — flat,
folder-oriented, unusable for data-science teams.

## Thesis

**The expected-vs-actual document state of a trial should be a query, not a monitoring
visit.**

Three design commitments follow:

1. **A real relational core.** Documents are rows typed by the CDISC TMF Reference
   Model taxonomy and scoped to (study | study-site | person), with immutable
   content-addressed versions. Studies, sites, people, and role assignments are
   first-class entities, not folder names.
2. **A requirement engine.** Declarative rules ("every active site needs a current IRB
   approval per protocol version"; "every investigator needs a CV no older than 2
   years") materialize *expected* documents. Completeness status — missing, pending
   review, current, expiring soon, expired, superseded — is derived by views, never
   hand-maintained.
3. **Compliance as schema, not as feature.** The Part 11 primitives are properties of
   the database itself: an append-only, hash-chained audit trail written by triggers on
   every mutation; document versions that cannot be updated or deleted; signatures
   cryptographically bound to the content hash they signed. An auditor's question
   ("show me everything that happened to this record") is also just a query.

The public API is the product; the web UI is its first customer and consumes nothing
the API doesn't offer. A data-science team in R or Python gets the same power as the
dashboard. The documentation serves both seats: a task-based user guide for clinical
operations staff on the docs site, and the schema/API/SQL material for the data team
(ADR-0013).

## Wedge

- Site-side eISF is crowded and commoditizing (Veeva SiteVault is now free for most
  sites; its API is enterprise-gated). Florence dominates but competes on the same
  bucket model.
- Nobody sells the **sponsor/CRO oversight layer with a queryable relational core and a
  genuinely good API**. That is the seat PCCTC-like consortia, CROs, and sponsor study
  teams sit in, and it is where the relational questions live.
- ICH E6(R3) (final January 2025) reframes "essential documents" as "essential
  records" with explicit expectations of version control, identifiability, and
  accessibility — language that favors a records-as-data design over folders-of-PDFs.

## Non-goals (current phase)

The formal computer system validation *program* (GAMP 5 categorization, SOPs,
training, QMS — the software generates its raw material, see docs/03-compliance.md),
eConsent, EDC/EHR integration beyond inbound document filing, site payments and
budgeting, multi-tenancy hardening (pilots deploy single-tenant per
docs/05-deployment.md), blinded-role privacy scoping. Formerly on this list, since
built: OIDC/SSO with RBAC (ADR-0008), WORM object storage (ADR-0009), the
full-taxonomy importer (ADR-0005), the operational CTMS layer with UI (ADR-0006),
and the source-system filing interface — EDC and other systems file documents into
the TMF as machine identities with provenance (ADR-0011).

## What "worth building" would look like

The vertical slice in this repo is the test: if the completeness grid, per-person gap
lists, and audit timelines fall out of the schema as plain queries — and the same
queries are one `httr2` call from R — the thesis holds. That bet has held so far:
SSO/RBAC, signing re-authentication, WORM storage, least-privilege roles, the
taxonomy importer, and generated IQ/OQ/traceability artifacts all landed as breadth
on the same schema, not architecture changes — and so did the workflow layer that
followed (content search, the review queue with bulk signing, site-seat logs, the
auditor's binder, eTMF-EMS exchange in and out). What remains before a marketable
compliance claim is the organizational half of validation (docs/03-compliance.md,
honest gap #1).
