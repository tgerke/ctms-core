# ADR-0035: The digest and TMF export get a UI; the package zips in the browser

Date: 2026-07-31. Status: accepted.

## Context

The two flagship oversight outputs — the digest email (ADR-0017) and the
verifiable TMF export package (ADR-0020/0024) — existed only as CLI jobs.
A coordinator without a terminal could receive the digest but never look it
up, and could not produce a transfer package at all. The July product review
ranked this the largest remaining gap: the compliance features the system is
built around were invisible to the people they serve.

Both CLIs were already thin wrappers over `@ctms/core` functions
(`collectDigest`/`renderDigest`/`digestRecipients`, `collectTmfExport`), so
the substance of this change is surface, not logic.

## Decision

1. **`GET /studies/{id}/digest` serves the digest live.** The same
   `collectDigest` data the email job reads, plus the attention count, the
   rendered email (subject and text, from `renderDigest`), and the derived
   recipient list. The study dashboard renders it as an "Oversight digest"
   card, email preview included. No notification state exists on either
   path, so the card and the email cannot disagree; the card is the email,
   sooner. Scoping falls out of the existing route middleware: the site
   seat (ADR-0023) gets 403, the auditor (ADR-0028) reads it.

2. **`GET /studies/{id}/export` serves the package's data; the browser
   assembles the package.** The endpoint returns everything
   `collectTmfExport` collects — study, documents with versions, signatures
   and returns, the expected-status snapshot, the full audit trail, and the
   unique content hashes. The web client fetches each blob through the
   existing authenticated per-version content endpoint, **recomputes its
   sha256 locally**, refuses any mismatch, and writes the exact CLI layout
   (`files/`, `documents.json`, `expected-status.json`, `audit-trail.jsonl`,
   `manifest.json`, `manifest.sha256`) into a zip whose single root
   directory matches the CLI's output directory. `shasum -a 256 -c
   manifest.sha256` verifies either origin identically.

3. **eTMF-EMS serialization stays CLI-only.** `--ems` needs an exchange
   agreement id and the verbatim TMF RM import (ADR-0024); it belongs to
   the integration context where those exist, not a dashboard button that
   would invite exports claiming agreements nobody made.

## Alternatives considered

- **Server-side zip streaming.** One request, but it adds an archive
  dependency and a long-running memory-heavy endpoint to an API whose
  content path is deliberately per-version and small, and the client would
  have to take the server's word for the bytes. Client-side assembly reuses
  the byte path the app already trusts and extends ADR-0030's pattern
  (client-side renditions; jszip is already a web dependency) — and it puts
  the hash verification on the receiving machine, which is where ADR-0028
  put signature verification for the same reason.
- **Reusing the CLI on the server** (spawn `export-tmf`, serve the
  directory): a filesystem-writing child process inside the DML-only API
  runtime, plus cleanup state. Rejected on shape alone.

## Consequences

- Export integrity now has two independent implementations of the same
  layout. The web writer is tested against the CLI's format (file set,
  order, manifest shape, sidecar coverage) so they cannot drift silently;
  a format change must update both plus the tests.
- A package's `generated_at` and file order come from data the API serves,
  but the zip is built by an untrusted client. That is acceptable because
  the package was never self-certifying: its authority comes from the
  hashes and the audit chain, which the client cannot forge, not from who
  ran the zip step.
- Large studies download every blob to the browser before zipping. Fine at
  pilot scale (single-tenant, ADR-0032); a streaming server-side export can
  revisit this if a deployment outgrows it.
