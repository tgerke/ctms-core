# ADR-0018: Review assignments resolve themselves — the queue is derived

Date: 2026-07-11. Status: accepted.

## Context

Pending-review documents were a list, not a queue: no assignment, no due
date, no "my work" view. A team larger than a few people could not share
review work without a spreadsheet on the side. Incumbents route documents
through named review workflows (Veeva) or build task assignment into the
binder (Florence) — and those workflow engines carry their own completion
state, which is one more thing that can disagree with the documents.

The record already knows when a review is finished: ADR-0015 made approval
and return the only two review outcomes, and both are facts on the version.

## Decision

1. **An assignment is a fact row** (`review_assignment`): which document
   version, assigned to whom, by whom, due when, optional note. It has no
   status column and no completion flag.
2. **The queue is a view** (`v_review_queue`): every document whose status
   is `pending_review`, its latest version, that version's latest
   assignment, and a derived `queue_status` —
   `unassigned | assigned | overdue`. An approval signature or a return
   moves the document off `pending_review`, which is what empties the
   queue: an assignment is finished exactly when its version stops being
   the reviewable one, and there is nothing to mark done or forget.
3. **Reassignment inserts a new row; the latest one stands.** Assignment
   history accumulates on the document (shown on the document page and in
   the audit trail); nothing is deleted. A corrected version starts
   unassigned — it is new work, and the queue makes that visible.
4. **Routing takes `approve` authority** (the same authority that could
   return, ADR-0015), **and the assignee must hold a grant that can approve
   the document** — assigning review to someone who cannot finish it is an
   error, caught at assignment time.
5. **Overdue assignments join the digest** (ADR-0017), so a routed review
   nobody finished reaches the oversight seat's inbox without anyone
   checking the queue page.

## Consequences

- "My work" is a filter (`?assigned_to=`), not a feature: the queue view
  serves the whole team and each reviewer with the same query, over the
  API or read-only SQL like every other `v_*` view.
- The queue can never disagree with the documents — there is no workflow
  state to reconcile, the exact drift ADR-0004/0006 exist to prevent.
- No per-assignment notification is sent at assignment time; the digest
  carries overdue reviews. Real-time "you've been assigned" pings remain
  future work along with the rest of per-user notification preferences.
- What remains of the incumbents' gap is multi-step named workflows
  (route to A, then B, then C). Deliberate: two outcomes per version
  (approve or return) is the review model this system commits to.
