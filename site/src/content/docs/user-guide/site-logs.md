---
title: "The site seat and its logs"
---

Most of this guide describes the oversight seat: the sponsor or CRO view
across many sites. This page is about the other side of the relationship: a
coordinator or investigator whose access is scoped to their own site.

## Signing in as site staff

A site person holds a **Site staff** grant limited to one site. When they sign
in, the app takes them straight to their site's page. There is no study
dashboard, portfolio, or admin surface to get lost in, because none of those
would show them anything they're permitted to see. What they get is their
site, whole: staff roster, the logs below, enrollment reporting, and every
expected document with an upload button where one is needed.

![The site seat: one site, its logs, its documents, and nothing else in the header.](../../../assets/screenshots/site-seat.png)

Site staff can upload documents and sign them (a PI signing their Form FDA
1572, for instance), and they record their site's enrollment counts. What
they cannot do is approve documents, administer the study, or read anything
beyond their site; those denials are immediate and name the missing
permission.

In the demo, the header's persona menu switches to **Dana Kim — site 001**
to try this seat.

## The delegation of authority log

Every site keeps a delegation of authority log: who the investigator has
delegated which study tasks to, from when. The paper (or PDF) log the PI
signs is still filed and signed as a document. What this page adds is the
*structured* entries beside it, so delegation becomes something the system
can check rather than a scan nobody reads.

![The delegation log: tasks, dates, the authorizing PI, and the checks the record makes possible.](../../../assets/screenshots/delegation-log.png)

Each entry names the delegate, the delegated tasks, the start date, and the
investigator who authorized it. Ending a delegation records an end date;
entries are never edited or deleted, and every change lands in the audit
trail. Because the entries are data, two checks run on every view:

- **Was the authorizer actually the PI?** If the authorizing person did not
  hold an active principal-investigator role at that site on the entry's
  start date, the entry says so, right on the log.
- **Is the delegate's file in order?** If the delegate has open credential
  items (an expired medical license, a missing GCP certificate), the entry
  carries the count. A delegation to someone whose license lapsed is exactly
  the finding a monitor wants surfaced before an inspector finds it.

## The training log

The training log records completions as dated facts: who, what topic, when,
and (when the training expires) until when. An entry can link to the filed
certificate document. As everywhere else, the status (current, expiring
soon, expired) is computed from the dates on every page load, never stored.

![The training log: completions with derived expiry status.](../../../assets/screenshots/training-log.png)

## The screening log

The screening log records the site's own screening activity as dated facts:
a site-assigned screening number, the screening date, and (once, when it
happens) the outcome: enrolled on a date, or screen-failed on a date with
a required reason. The number is a code like `S-017`, never a name; subject
clinical data stays in the EDC, and the reason field is for criterion
references, not clinical detail.

![The screening log: pseudonymous numbers, dated dispositions, and the reconciliation line against the site's own reports.](../../../assets/screenshots/screening-log.png)

Because the entries are data, the log reconciles itself against the
enrollment numbers the site reports: the summary line shows the log's
counts beside the latest report, and if the two disagree, the page says so
and points at the enrollment form. That is the point of the structured log:
the reconciliation a monitor does by hand across a paper log and a
spreadsheet happens on every page load instead.

## Signing log entries

Individual log entries — a delegation, a training completion, a screening
record — can now carry Part 11 e-signatures, through the same ceremony as
documents: choose a meaning (author, review, approval), confirm your
identity, and the system records your name, the date and time, and the
meaning, bound to the entry's facts at that moment.

The binding is a hash of the entry itself, and the page re-checks it on
every load. If a signed entry later changes in one of the few ways entries
can change (a delegation gains its end date, a screening entry gets its
outcome), the signature stays, and the log says, right on the entry, that
it covers the earlier facts. Nothing blocks the change, because the change
is itself an audited fact; a fresh signature can attest the updated entry.

## Who writes the logs

The logs are the site's record of itself. Site staff and administrators can
write entries; monitors and trial operations read them: oversight reviews
the log, it does not author it. Signing is attestation, not authorship: the
site seat signs its own entries (the PI approving a delegation, a
coordinator attesting a screening record), and a monitor can add a review
signature from oversight. The signed delegation log document remains the
authoritative Part 11 record; the structured entries and their signatures
are the layer growing up beside it.
