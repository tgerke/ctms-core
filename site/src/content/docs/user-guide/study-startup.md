---
title: "Starting a study"
---

A new protocol begins on the **Portfolio** page. The *New study* card takes
the protocol number, title, phase, and sponsor, and creates the study in
*planning*. From there its dashboard walks you through startup with a
checklist, and when the pieces are in place you mark the study active.

Creating a study is the one action in the app that needs more than the
administrator role on some study: it requires an administrator grant with
no study or site scope. A new study is new territory, so creating one takes
the same authority that can grant access everywhere. If you don't see the
*New study* card, that's why.

## Copying requirements from another study

Most protocols expect the same things on file as the last one. The card's
**Copy requirement rules from** picker clones an existing study's
requirement rules into the new study, all in one step: the artifacts, the
scopes (per study, per site, per staff member), validity periods, and
signature requirements, exactly as the source study's admins wrote them.
Expected documents materialize immediately, so the new study's dashboard
shows its study-level placeholders as *missing* from the first second. That
is the point: the startup checklist starts honest.

Rules can also be added one at a time on the
[Admin page](/ctms-core/user-guide/administration/#requirement-rules),
whether or not you started from a template.

## The startup checklist

While the study is in *planning*, its dashboard leads with a **Study
startup** panel. Every line is computed from the record, the same way every
status in the app works: there are no checkboxes, and nothing to mark done.
An item completes when the fact behind it changes.

- **Sites**: how many are on the study, and how many still await
  activation. *Add sites* goes to the Admin page.
- **Principal investigator**: any pending or active site with no active PI
  is listed, each linking to that site's page where staff are assigned.
- **Requirement rules**: the count by scope, or a warning that the study
  expects nothing on file yet.
- **Expected documents**: whether the placeholders match the rules (a rule
  added after the last sync shows here, with a sync button), and how many
  are still missing.
- **Milestones**: once any milestone is planned, this line is done. Until
  then, the panel offers a planner: pick another study, and its study-level
  milestone *names* appear with a date field each. The names carry over;
  the dates never do — a date is a claim about this study, so you enter it
  yourself.
- **Access**: how many people hold access scoped to this study.
  Unscoped seats (like the administrator who created it) can already see
  it.

The checklist informs; it doesn't gate. **Mark study active** works with
items still open — it asks you to confirm first — because sometimes the
paperwork follows the site, not the other way around.

## Study settings

Title and phase are editable on the Admin page's *Study settings* card. The
protocol number and sponsor are not: they are the study's identity, fixed
at creation. Status only moves forward, *planning* to *active* to
*closed* (a study abandoned before activation can go straight to
*closed*), and every change lands in the audit trail like everything else.
