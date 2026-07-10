# ADR-0006: Operational layer as facts + derived lifecycle views

Date: 2026-07-09. Status: accepted.

## Context

The operational features CTMS products sell — monitoring visits with trip-report
workflows, issue/deviation tracking, enrollment metrics, milestones — are usually
built as workflow objects: rows with status columns advanced by application code, in
a module vendors configure per customer. That is exactly the design this project
exists to avoid, and it is also why incumbent systems are hard for data teams to use:
the workflow state lives in vendor-specific objects reachable only through vendor
screens and vendor exports.

## Decision

1. **Lifecycle stages are derived by views from dated facts, never stored.**
   `monitoring_visit` has `scheduled_date` and `visit_date`; whether a visit is
   `overdue` or `awaiting_report` is computed by `v_monitoring_visit_status` from
   those dates, the linked trip report's document status, and open action-item counts.
   Issues (`open | overdue | resolved`) and milestones (`achieved | overdue |
   upcoming`) work the same way. This extends ADR-0004 from document completeness to
   operational workflows: a stage can never be stale because it is never written.
2. **Trip reports and visit letters are documents, not a parallel review system.**
   They reuse the existing immutable versions and §11.70 hash-bound signatures;
   "report approved" is an ordinary approval signature. A `monitoring_visit_document`
   join table types the link. Because two visits at one site produce documents with
   identical artifact + scope, visit-linked documents are per-visit records: uploads
   via the visit endpoint always create a fresh document, and approval's
   supersede-siblings step skips visit-linked documents in both directions.
3. **Enrollment is as-reported aggregates; the EDC owns subject-level data.** One row
   per (site, as_of_date); corrections are audited UPDATEs with before/after row
   images, not new truths or silent overwrites. This is a firm scope boundary, not a
   phase-1 shortcut.
4. **No bespoke workflow modules.** Configuration is rows, lifecycles are SQL views,
   and every capability ships in the OpenAPI spec the moment it exists. The `v_*`
   views are documented public query surface (a seeded read-only role exercises
   this): view columns are versioned API, so additive changes are safe and renames
   are breaking.
5. All operational tables get the same trigger-written audit as the document core.
   No immutability triggers: these are correctable operational facts, and the audit
   trail preserves every prior value.

## Consequences

- The dashboard, the REST API, and a direct SQL connection cannot disagree about a
  visit's stage — all three read the same view.
- Deleting an unfulfilled placeholder-like row (e.g. a mis-scheduled visit) is
  allowed and leaves an audited tombstone, consistent with ADR-0003.
- The visit stage machine is fixed in the view. New stages mean a migration, not a
  customer-specific workflow configuration — deliberately.
