# ADR-0016: Administration write surface and expected-document waivers

Date: 2026-07-11. Status: accepted.

## Context

The roadmap's top-ranked gap (ADR-0014) was study/site/staff administration:
organizations, sites, study-site links, people, role assignments, access
grants, and requirement rules were created only by the seed script, so a
pilot onboarding its first real site would be writing SQL. The audit
triggers already covered every one of those tables (migrations 0001/0003),
the `administer` operation already existed (ADR-0008), and
`sync-expected-documents` already materialized requirements — only the write
surface was missing.

The roadmap's third item, expected-document waivers, rides along: waivers
are requirement-level administration, and TMF completeness practice expects
an absence itself to be explained ("this site's central IRB makes the local
approval letter not applicable"), not left as a permanent `missing`.

## Decision

1. **Admin mutations are ordinary core operations plus API routes**, in the
   `withActor` / zod-openapi pattern everything else uses. No new
   permission machinery: mutations gate on the existing `administer`
   operation, which only the `admin` role holds.
2. **Endings are dated facts, never deletes.** A role assignment ends by
   `end_date`; a grant ends by `revoked_at`; there is no DELETE route for
   any admin entity. Requirement rules have no delete either, and their
   `scope_level` and artifact are fixed after creation — expected documents
   already materialized from the old shape would silently orphan otherwise;
   a different requirement is a new rule.
3. **Grant scope cannot escalate.** Creating or revoking an *unscoped*
   access grant requires an equally unscoped `administer` grant; a
   study- or site-scoped admin can only grant within their scope. The check
   lives in the route handler because the scope arrives in the body (same
   pattern as document upload).
4. **A waiver is a fact row the status view reads** (`expected_document_waiver`:
   who, when, why — reason required and non-blank). It follows the ADR-0006
   resolve pattern (like `issue.resolved_at`), *not* the ADR-0015
   immutable-row pattern: lifting a waiver sets `revoked_by/revoked_at/
   revoke_reason` once (a DB CHECK requires all three together), and the
   audit trigger preserves the full history. A partial unique index allows
   one active waiver per expected document; history accumulates as revoked
   rows.
5. **A waiver only ever explains an absence.** The derived status shows
   `waived` exactly where it would have shown `missing`; any filed document
   (pending, current, expired, returned, superseded) wins over the waiver.
   Waived rows leave the completeness denominator — satisfied-by-explanation,
   not a gap — and the per-site rollup carries a `waived_count`.

## Consequences

- A pilot can onboard a site, staff it, grant access, and adjust
  requirement rules from the UI or API, with every step attributed in the
  hash-chained audit trail.
- The seed script keeps its raw inserts (it runs pre-auth, before any actor
  exists); it is no longer the only writer of these tables.
- `v_expected_document_status` gains waiver columns and the `waived` status;
  `v_study_site_completeness.pct_current` now excludes waived rows from its
  denominator — an intentional, additive-plus-one-semantics-change to the
  documented view surface.
- Two roadmap items move to "closed" in the same change (ADR-0014's rule).
  What remains of the administration gap is startup workflow (milestone
  templates, task checklists à la Medidata), not the write surface.
