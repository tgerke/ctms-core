# ADR-0015: Review has two outcomes — approve, or return with a recorded reason

Date: 2026-07-10. Status: accepted.

## Context

A `pending_review` version could only be approved or left pending. A reviewer
who spotted a wrong file — an unsigned copy, an illegible scan, a letter for
the wrong protocol version — had no in-system way to say so: the document sat
pending while the correction was chased by email, invisible to the record.
The roadmap (ADR-0014) ranked this the top build-next gap; incumbent eTMF
systems treat pre-approval QC with tracked outcomes as core workflow.

## Decision

1. **The return is a fact row.** `document_return` records who returned a
   version, when, and why (`reason` required and non-blank by CHECK). The row
   is immutable and audited exactly like a signature — the reason is part of
   the document's permanent record, not a comment that can be edited away.
2. **The document carries the state, views derive the rest.** The return sets
   `document.status = 'returned'` — the same stored-lifecycle mechanism every
   other transition uses (approval sets `effective`, supersede sets
   `superseded`) — and the derived views pass `returned` through: expected
   documents, site completeness (`returned_count`), and monitoring visits
   (a returned trip report drops the visit back to `awaiting_report`).
3. **A returned version can never be approved.** The fix is a corrected
   version, which reopens review — the same fix-forward stance as "no delete
   button". The sign path refuses `approval` on any version with a return
   fact, so the block survives even after a corrected version arrives.
4. **Returning takes `approve` permission but is not a signature.** It is the
   review decision, so it takes the same authority that could approve; it
   asserts nothing to a regulator, so it gets no §11.200 re-authentication
   ceremony — just an attributed, hash-chained audit event.
5. **Only the latest version of a pending_review document can be returned.**
   Returning an already-effective document or a superseded version has no
   meaning; the API refuses with a 409.

## Consequences

- The review loop closes in-system: the uploader sees the reason on the
  document page (and the site row grows its upload button back), and an
  auditor sees why version 1 was never approved.
- Per-visit records get the same treatment through their own path: trip
  reports can't take new versions (per-visit identity, ADR-0006), so a
  returned report is corrected by uploading a fresh report from the visit
  page; the returned document remains on the record.
- One more terminal-ish state exists: a returned document whose correction
  never arrives stays `returned`, which reads honestly (needs action) rather
  than as a stuck `pending_review`.
- The roadmap loses its top gap in the same change, per ADR-0014's rule.
