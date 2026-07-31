# ADR-0034: Study creation takes unscoped admin; startup is a derived checklist and a cloned template

Date: 2026-07-31. Status: accepted.

## Context

Every commercial CTMS starts with creating a study; this system could not.
`/studies` was GET-only, so a new protocol required `pnpm db:seed` (which
truncates) or raw SQL — the one entity in the organizational spine still
owned exclusively by the seed script after ADR-0016 gave sites, people,
grants, and rules their write surface. The roadmap's ADR-0016 entry also
left a named remainder: "the startup *workflow* incumbents layer on top
(Medidata's site-specific startup milestones and task checklists). The
write surface exists; the guided process does not."

Two design constraints bind anything built here. Status is derived, never
stored (ADR-0004/0006), so a startup checklist cannot be a task table with
checkboxes. And templates cannot ship content from model memory (ADR-0005),
so "start the new study like the last one" must copy what a user authored,
not what a model suggests.

## Decision

1. **Creating a study requires an *unscoped* admin grant.** Grants scope to
   a study or a site; a grant naming neither matches everything
   (`permits()`, ADR-0008). A new study is a new top-level scope, so
   creating one takes the same authority that mints unscoped access — the
   `permitsGrantScope` rule from ADR-0016, reused verbatim. The rejected
   alternative (any `administer` holder creates studies, receiving a
   study-scoped admin grant in the same transaction) would let a
   study-scoped admin manufacture scope for themselves, contradicting that
   rule. Consequence: **no bootstrap grant row exists.** The creator's
   unscoped grant already covers the new study for every operation, so the
   transaction writes nothing to `access_grant`.
2. **The startup template clones requirement rules from an existing study,
   server-side and atomic.** Rules are date-free configuration authored by
   users against the verbatim-imported taxonomy, so copying them wholesale
   is safe under ADR-0005: nothing is invented. The clone is one
   insert-select inside the create transaction (each row audited by the
   existing trigger), followed by `ctms_sync_expected_documents` on the same
   connection so the study-scope placeholders exist before anyone looks —
   and so their audit rows keep the creator's attribution.
3. **Milestones are never cloned server-side.** `planned_date` is NOT NULL,
   and a prior study's dates are invented data for a new one. The startup
   panel instead offers a planner: pick a source study, see its study-level
   milestone *names*, enter a date for each. Names are reusable structure;
   dates are always a human's claim about this study.
4. **The checklist is a view, not a table.** `v_study_startup` (migration
   0014) computes one row per study from existing facts: site counts by
   status, sites lacking an active PI, rule counts by scope, placeholders
   the sync function would insert but hasn't (the same three scope-level
   sources with `NOT EXISTS` guards — "sync needed" is derived, never
   flagged), expected/missing totals, milestone counts, and people with
   study-scoped access. An item completes when the underlying fact changes;
   there is nothing to tick. One requested item proved impossible by
   schema, deliberately: "milestones without planned dates" cannot exist,
   so the derived signal is "no milestones yet" plus the existing overdue
   count.
5. **`PATCH /studies/{studyId}` ships alongside**, because the checklist's
   terminal action is planning → active. Title and phase are editable;
   status moves forward only (planning → active → closed, with
   planning → closed for a study abandoned before activation);
   `protocol_number` and sponsor are the record's identity and are
   immutable — a different protocol is a different study (the
   `updateRequirementRule` stance from ADR-0016). Updating takes
   `administer` scoped to the study; only creation demands the unscoped
   grant.

## Consequences

- A clinical operations lead can stand up a protocol end to end without a
  developer: create it from the portfolio page, clone a sibling study's
  requirements, add and activate sites, staff the PI, plan milestones, and
  mark it active — every step an audited row.
- The facts inform; they do not gate. "Mark study active" works with open
  checklist items (after a confirmation), because a derived checklist that
  blocked the transition would be stored workflow state wearing a
  disguise.
- `GET /studies` and `/portfolio` remain read-gated but unscoped
  (ADR-0008), so every reader sees every study. Single-tenant pilots
  absorb this today, but user-creatable studies raise the pressure on
  ADR-0021's deferred grant-aware study list.
- The seed script keeps its raw inserts (it runs pre-auth); it is no
  longer the only writer of `study`. `protocol_version` remains the last
  spine table with no API surface.
- The roadmap's ADR-0016 remainder moves to "closed" in this change
  (ADR-0014's rule). What remains of the incumbents' startup story is
  per-site startup task templates with date projections, not the guided
  process.
