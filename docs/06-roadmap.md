# Feature gaps and roadmap

What a team gets from an incumbent CTMS or eBinder that this system does not
yet give them. The comparison was checked against the vendors' own public
documentation rather than assumed: Veeva Vault eTMF (sponsor/CRO-side eTMF),
Medidata CTMS (clinical operations), Florence eBinders (site-side
eBinder/eISF), and the CDISC eTMF Exchange Mechanism Standard for interchange.
Sources with access dates are listed at the bottom (ADR-0014).

Two ground rules for reading this page:

- **A gap is not a commitment.** This project is a product probe; the list
  below is an honest accounting of distance, not a delivery schedule.
- **A boundary is not a gap.** Several things incumbents sell are things this
  system has decided not to do. Those are restated first so the gap list
  stays clean.

## Deliberate boundaries (not gaps)

Recorded in docs/01-vision.md and the decision log; restated here because a
feature comparison is meaningless without them.

- **Subject-level clinical data.** The EDC owns it. Documents and as-reported
  aggregates come in through the filing interface (ADR-0011); subject data
  never does. Incumbent CTMS suites advertise EDC-populated enrollment and
  cross-system data flow; here the boundary is the feature.
- **Site payments and budgeting.** Medidata sells site payments as a CTMS
  module you can switch on. A non-goal here (docs/01-vision.md): payments are
  an accounting workflow, not a regulatory-document one.
- **eConsent.** Non-goal; consent form versions are filed as documents, the
  consenting workflow itself belongs elsewhere.
- **Expedited safety reporting.** Pharmacovigilance systems own SAE
  processing and regulatory submission clocks. Safety concerns at a site are
  recorded here as issues (dated facts, derived status) and safety
  correspondence files as documents — oversight, not case processing.
- **The validation program.** The software generates its raw material (IQ/OQ
  reports, traceability matrix — ADR-0010); SOPs, risk assessment, and
  training are the deploying organization's work (docs/03-compliance.md,
  honest gap #1).
- **Multi-tenancy and blinded-role scoping** are current-phase non-goals:
  pilots deploy single-tenant (docs/05-deployment.md), and no role yet hides
  unblinded material. Florence ships in-app PHI redaction; nothing comparable
  exists here yet, and won't until a blinded seat is designed.

## Closed since first written

- **Review outcomes beyond approval** — shipped as return-for-correction
  (ADR-0015): a reviewer sends a pending version back with a required,
  immutable reason; the document shows `returned` until a corrected version
  reopens review, and the returned version can never be approved. What
  remains of the original gap is the narrower QC tooling incumbents layer on
  top (checklists, tracked quality-issue workflows à la Veeva) — real, but no
  longer the daily-use hole.
- **Study, site, and staff administration** — shipped as the admin write
  surface (ADR-0016): organizations, sites, study-site activation, people,
  role assignments, access grants, and requirement rules are all creatable
  through the API and the admin page, with endings as dated facts and every
  step in the audit trail. What remains is the startup *workflow* incumbents
  layer on top (Medidata's site-specific startup milestones and task
  checklists) — the write surface exists; the guided process does not.
- **Expected-document waivers** — shipped as waiver fact rows (ADR-0016): an
  admin records why an expected document is not applicable; the row shows
  `waived` instead of `missing`, leaves the completeness denominator, and a
  filed document always wins over the waiver. Lifting a waiver is itself a
  recorded fact, never a delete.

## Genuine gaps

### Multi-study operation in the UI

The schema is multi-study; the web app assumes the first study returned.
Cross-study portfolio views are a standard CTMS selling point (Medidata
Visual Analytics combines data across studies). A study switcher is the
small version; portfolio rollups across `v_study_site_completeness` are the
real version, and the views make them queries.

### Notifications and scheduled reports

Nothing emails anyone. Expiring credentials, overdue action items, overdue
visits, and broken-chain alerts are all visible in the UI and the views, but
only to someone who looks. Veeva schedules flash reports at any frequency;
Medidata sends automatic notifications; Florence notifies on workflow
distribution. A digest job consuming the existing `v_*` views is the obvious
shape — the derived-status design means there is no state to sync, only a
query to run and send.

### TMF transfer and inspection export

There is no bulk export: no way to hand the TMF to a successor system, an
archive, or an inspector as a package. CDISC publishes the eTMF Exchange
Mechanism Standard (exchange.xml inventory + XSD + per-file checksums)
precisely because sponsor–CRO transfers between vendor systems kept failing.
The content-addressed store makes this tractable — every version already has
the sha256 the standard's checksum verification wants. Related and smaller:
inspectors currently get the `read_only` role and the audit endpoints, where
Veeva advertises purpose-built auditor access and an inspection-ready flag.

### Document search

No full-text or metadata search. Navigation is the site matrix, status
filters, and URL-addressable lists — good for "what is missing," weak for
"find the signed protocol amendment 2 from site 03." Veeva's TMF Viewer
searches all document versions and exports to Excel. The data team has
`ctms_readonly` SQL for metadata questions; clinical operations users have
nothing comparable in the UI, and nothing indexes document text.

### Task assignment and review queues

Pending-review documents are a list, not a queue: no assignment, no due
date, no "my work" view. Action items exist but only attached to monitoring
visits. Florence builds placeholders, due dates, and task assignments into
the binder itself; Veeva routes documents through named review workflows.
The oversight seat needs at least "assign this pending version to a
reviewer" before a team larger than a few people can share the work.

### Site-seat log workflows

Florence's bread and butter — delegation-of-authority logs, training
attestation logs, screening logs, certified copies routed from the EMR —
is the site coordinator's seat, which ADR-0001 deliberately did not build
for. Partial coverage exists where the oversight seat needs it: per-person
credential expiry (CV, GCP training) falls out of person-scoped requirement
rules, and enrollment aggregates are first-class. A future site-facing
surface (ADR-0001 names it as a possibility) would reuse the same schema;
structured DoA/training logs would be its first real test.

## If we built next

1. **Expiry/overdue digest notifications.** Highest oversight value per unit
   effort — the views already compute everything; a scheduled job formats
   and sends.
2. **Task assignment and review queues.** With onboarding solved, the next
   daily-use hole: pending review is a list, not a queue, and nothing is
   assignable to a named reviewer with a due date.
3. **Document search.** Metadata search first (the views make it a query);
   full-text over document content is the larger second step.

## Sources

Vendor and standards pages verified 2026-07-10 (ADR-0014):

- Veeva, "Top 28 Vault eTMF Features to Drive Inspection Readiness" —
  https://www.veeva.com/blog/top-28-vault-etmf-features-to-drive-inspection-readiness/
- Medidata CTMS product page —
  https://www.medidata.com/en/clinical-trial-products/clinical-operations/ctms/
- Florence eBinders product page — https://www.florencehc.com/products/ebinders/
- Florence eBinders FAQ — https://www.florencehc.com/florence-ebinders-faq/
- TMF Reference Model, "Exchange Mechanism Standard" — https://tmfrefmodel.com/ems
- CDISC, "Exchange Mechanism" — https://www.cdisc.org/standards/exchange-mechanism
