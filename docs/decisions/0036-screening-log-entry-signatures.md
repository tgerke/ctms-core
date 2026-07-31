# ADR-0036: Screening log as facts; e-signatures land on log entries

Date: 2026-07-31. Status: accepted.

## Context

The site seat (ADR-0023) shipped with two of the coordinator's logs —
delegation of authority and training — and named the rest of the site-side
catalog as the remaining gap: screening logs, and an entry-level signing
ceremony reusing the §11.200 machinery. The roadmap kept both under "site-side
depth beyond the first logs." This change closes those two items.

Two design tensions had to be resolved first:

- **The subject-data boundary.** The vision declares subject-level *clinical*
  data a non-goal: the EDC owns it, and only as-reported aggregates come in
  (`enrollment_report`, ADR-0011). A screening log is subject-level in the
  sense that each row is one screened individual — but it is the site's
  operational record of its own screening activity (a standard site-file
  log), not clinical data. The line has to be drawn explicitly or the
  boundary erodes row by row.
- **What an entry signature attests.** Document signatures bind to immutable
  bytes (§11.70 copies the version's content hash). Log entries are fact rows
  with one permitted mutation each (a delegation's `end_date`, a screening
  entry's outcome), so a signature over "the entry" must say exactly which
  facts it covered, and a later permitted mutation must be detectable, not
  hidden.

## Decision

1. **`screening_entry` is a dated fact row carrying no clinical data.** Site,
   site-assigned screening number (unique per site, pseudonymous), screened
   date — then at most one outcome, recorded later as a dated fact: an
   `enrolled_on` date, or a `screen_failed_on` date with a required reason.
   No names, initials, birth dates, or clinical measurements; the reason
   field is for criterion references, not clinical detail. DB CHECKs enforce
   the shape (one outcome ever, ordered dates, reason exactly when failed);
   the audit trigger records every write; nothing is deleted. Status
   (`in_screening` / `enrolled` / `screen_failed`) is derived in
   `v_screening_log`, never stored (ADR-0006).

2. **The log cross-checks the site's own reported aggregates.**
   `v_screening_summary` puts the log's derived counts beside the latest
   `enrollment_report` numbers for the same site. A site whose log shows four
   enrollments but whose last report said three flags itself — the same
   derive-don't-trust move as the delegation log's PI check, pointed at
   enrollment reporting. The EDC boundary stands: aggregates still arrive by
   report; the log explains them rather than replacing them.

3. **Entry-level e-signatures are a new append-only `log_signature` table,
   signed through the same ceremony as documents.** A signature references
   exactly one log entry (delegation, training record, or screening entry —
   a CHECK enforces exactly one foreign key), and records signer, meaning
   (author/review/approval, the existing enum), timestamp, and the §11.200
   re-authentication evidence (`reauth_method`, `reauth_at`, NOT NULL from
   birth — this table needs no retrofit exemption). The API route verifies
   `reauth_token` exactly as document signing does.

4. **The signature binds to the entry's facts by hash, and drift is derived
   at read time.** `signed_sha256` is the SHA-256 of a canonical
   serialization of the entry's fact columns at signing (one implementation,
   in `@ctms/db`, used by signing, verification, and the seed). Every log
   read returns each entry's signatures with a derived `facts_match`: the
   current facts re-serialized and re-hashed against what was signed. Ending
   a signed delegation or recording an outcome on a signed screening entry
   is still legal — the record then honestly shows the signature no longer
   covers the current facts, and a fresh attestation can be added. Signature
   rows themselves are immutable (trigger) and audited, like `signature`.

5. **Signing a log entry takes the `sign` operation on the entry's site
   scope.** The site seat signs its own log (the PI's authorization and the
   coordinator's attestation are site acts); monitors, who hold `sign`, may
   add `review` attestations from oversight; the auditor's read-only seat
   cannot sign. Authorship of entries still requires `log` (ADR-0023) —
   signing attests an entry, it does not create one. Meanings are not gated
   by role: the row names who signed and as what, and the record speaks.

6. **The signed paper logs remain the authoritative Part 11 records where
   they exist.** ADR-0023's position stands for the DoA log document
   (artifact 05.03.01); entry signatures are the structured layer growing
   toward replacing it, not a claim that it is replaced.

## Alternatives considered

- **Reusing the `signature` table with a nullable entry reference.** One
  table, but every existing §11.70 guarantee is phrased over
  `document_version_id NOT NULL`, and the retrofit CHECK exemption for
  pre-auth rows would leak onto log signatures. A parallel table states the
  same discipline without weakening the original.
- **Storing a `signed` flag or signature status on the entry.** Stored
  workflow state, the exact thing ADR-0006 forbids; `facts_match` derived at
  read time cannot disagree with the row it describes.
- **Full screening detail (initials, demographics, criterion outcomes).**
  Incumbent site logs carry more; adding it would cross the subject-data
  boundary for UI convenience. Rejected — the pseudonymous number is enough
  to reconcile the log against reports and against the EDC on the site's
  side.

## Consequences

- The site page gains a screening section and signature chips on all three
  logs; the sign ceremony (re-auth included) now exists off the document
  page for the first time.
- A signed entry whose facts later changed shows `facts_match: false` rather
  than blocking the change. That is deliberate: the permitted mutations are
  themselves audited facts, and refusing them would push corrections into
  workarounds. Inspection reads the signature as "these facts, then," with
  the audit trail supplying "and this changed, when."
- The export package (ADR-0020) still does not serialize log rows or log
  signatures; the audit trail it carries records them. Unchanged from
  ADR-0023, and still honest.
- Screening data quality depends on site discipline in the free-text failure
  reason. The field is constrained to exist, not to be clinical-free; the
  stated convention (criterion references) is guidance, and a deployment
  that needs enforcement would add it as review practice, not schema.
