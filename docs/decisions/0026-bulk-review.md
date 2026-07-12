# ADR-0026: Bulk review is a series of signings, not a lighter signature

Date: 2026-07-12. Status: accepted.

## Context

ADR-0025's import files a partner's whole TMF as `pending_review`, and
nothing here becomes effective without a human — so a 74-document batch
meant 74 separate sign ceremonies. The queue (ADR-0018) already lists the
work; what was missing is acting on a selection.

The regulation anticipated exactly this. 21 CFR §11.200(a)(1)(i): "When an
individual executes a series of signings during a single, continuous period
of controlled system access, the first signing shall be executed using all
electronic signature components; subsequent signings shall be executed
using at least one electronic signature component that is only executable
by, and designed to be used only by, the individual." (Verified against the
full text in the source library, per ADR-0012.) Bulk approval is not a
shortcut around the ceremony; it is the ceremony the rule describes for a
series.

## Decision

1. **`POST /document-versions/bulk-approve` is one §11.200(a)(1)(i) series.**
   One verified re-authentication (`reauth_token`, the all-components first
   signing) opens the series; the authenticated session is the component
   that carries the subsequent signings. Every version still gains its own
   signature row — signer, meaning, timestamp, re-auth method and time, and
   the content hash of *its* bytes (§11.70). Nothing about the manifestation
   (§11.50) is batched: the record shows N signatures, not one signature
   waved over N documents.
2. **`POST /document-versions/bulk-return` is the other outcome over a
   selection** (ADR-0015), with one shared, immutable, documented reason.
   Same `approve` authority; not a signature, so no re-authentication.
3. **All-or-nothing, every blocker at once.** Each selected version must be
   the latest of a `pending_review` document inside the caller's approve
   scope, and (for approval) never returned. One transaction: every version
   in the selection signs or returns, or none do — the reviewer unchecks
   the problem rows, listed by title, and tries again.
4. **Bulk approval is deliberately narrower than the single ceremony.** The
   single sign endpoint accepts `author`/`review` attestations and per-
   document effective/expiry dates; bulk is approval only, sharing at most
   one `effective_date`. Per-document nuance belongs on the document page.
5. **The queue page is the surface**: checkboxes on the ADR-0018 queue, a
   selection bar stating exactly what will happen ("one signature ceremony,
   N signatures, each bound to its version's hash"), and an explicit
   confirmation step before the re-authentication.
6. **Selections behave like sequential approvals.** Two pending siblings of
   the same artifact and scope approved together end with the later one
   effective and the earlier superseded — the same outcome as approving
   them one at a time, because it is the same code path
   (`applySignature`), now shared by both ceremonies.

## Consequences

- Reviewing an imported batch is now one filter, one select-all, one
  re-authentication — with the audit trail recording every individual
  signature, hash-bound, exactly as before. The rubber-stamp risk is real
  and owned: the surface makes the reviewer's diligence cheaper, not
  optional, and the confirmation step says how many signatures are about
  to exist.
- docs/03-compliance.md's §11.200 row now cites the series provision; the
  claim shipped with the control, not ahead of it.
- The refusal path teaches the model: a selection containing anything
  unreviewable refuses whole, so partial batches cannot half-happen and
  the queue never lies about what remains.
- `signDocumentVersion` and `returnDocumentVersion` are unchanged in
  behavior; both now delegate to the shared transaction bodies the bulk
  paths reuse, so single and series ceremonies cannot drift.
