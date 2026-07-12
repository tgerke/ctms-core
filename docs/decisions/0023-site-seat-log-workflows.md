# ADR-0023: Site-seat log workflows — structured logs as facts, the seat as a permission scope

**Status**: accepted · 2026-07-12

## Decision

1. The site seat is an access role, not a second application. A new
   `site_staff` role (read, upload, sign, and the new `log` operation) is
   granted with a study-site scope; the web app reads the person's grants from
   a new `GET /me` and, when every grant is site-scoped, lands on that site's
   page and hides study-wide navigation. The site page itself now reads
   through site-scoped endpoints (`GET /study-sites/{id}`,
   `/expected-documents`, `/enrollment`), which serve the oversight seat
   identically — one code path, two seats, exactly as ADR-0001 promised
   ("site vs. sponsor is a permission scope, not a different data model").
2. Delegation-of-authority and training logs are structured fact rows with
   derived status, not stored workflow state (ADR-0006 pattern):
   - `delegation`: delegate, delegated tasks, start date, authorizing PI;
     ending a delegation sets `end_date`, never deletes. The
     `v_delegation_log` view derives `active`/`ended` and two cross-checks
     the oversight seat wants: whether the authorizer actually held an active
     principal-investigator role at that site on the start date, and the
     delegate's count of open credential items (expired license, missing GCP)
     from `v_expected_document_status`.
   - `training_record`: person, topic, completion date, optional expiry and a
     link to the filed certificate document. `v_training_log` derives
     `current`/`expiring_soon`/`expired` with the same 60-day window the
     document views use.
   Both tables carry the standard audit trigger; rows are never deleted.
3. Writing a log entry takes the new `log` operation, held by `site_staff`
   and `admin` only. Monitors and trial ops read every log (oversight) but do
   not author a site's own log — the log is the site's record of itself.
4. The signed Delegation of Authority Log document (TMF artifact 05.03.01)
   remains the authoritative Part 11 record. Structured rows are the
   queryable operational layer beside it; they do not claim the PI's
   e-signature. An entry-level signing ceremony (reusing the §11.200
   machinery) is future work, stated in the roadmap.

## Rationale

- The roadmap named structured DoA/training logs "a future site-facing
  surface's first real test" (ADR-0014). Building the logs without the seat
  would test nothing; building the seat as new endpoints plus a grant kind
  keeps the test honest and small.
- Fact rows + derived views is the house pattern for exactly this shape of
  problem: a delegation's validity depends on other facts (the PI's role
  dates, the delegate's credential documents), so deriving status at read
  time means the log can never disagree with the staffing and document
  record next to it. That cross-check — delegation active but delegate's
  license expired — is the oversight value incumbents' site-side binders
  don't surface.
- A `log` operation, rather than reusing `upload`, keeps the authorship
  boundary in the role map where access reviews already look (ADR-0008),
  instead of in per-route special cases.

## Consequences

- Dev mode gains a third persona: `dev-site-token` maps to the seeded
  site 001 coordinator (site_staff grant scoped to CORC-2201 site 001), and
  the web header gets a dev-only persona switcher so the seat is demoable
  without editing localStorage.
- Site-scoped personas see a working site page (staff, logs, expected
  documents, enrollment reporting, uploads, signing) but no study-wide
  reads: portfolio, review queue, search, and monitoring-visit/issue lists
  stay 403 for them, and the UI hides those affordances rather than
  rendering dead ends.
- The export package (ADR-0020) does not yet carry the structured log rows;
  the audit trail it exports records them, and the signed DoA document is in
  the package as a document. Log-row serialization can join a future export
  revision if a transfer needs it.
- `access_role` gains an enum value; Postgres 16 allows this inside the
  migration transaction as long as the same migration does not use the new
  value — the seed, not the migration, writes the first `site_staff` grant.
