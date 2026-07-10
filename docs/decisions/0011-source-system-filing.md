# ADR-0011: A generic source-system filing interface; EDC integration stays outside the data boundary

**Status**: accepted · 2026-07-10

## Decision

1. Source systems (an EDC first, but any document-producing system) file into
   the TMF through the same audited upload endpoint people use, authenticated
   as **machine identities**: an OIDC client-credentials subject mapped to a
   provisioned `person` row via `API_SERVICE_SUBJECTS` (dev mode:
   `API_TOKEN_SERVICE`). No parallel ingestion path, no separate audit story.
2. Machine identities get the new `ingest` access role — read + upload only.
   A service can never sign or approve: signatures are a human ceremony
   (§11.200), and nothing about automation changes that.
3. Document versions carry optional **filing provenance**: `source_system`
   and `source_ref` (the filing system's native reference, e.g. an EDC
   casebook id). Null for human uploads. Additive columns only — versions
   stay immutable.
4. The subject-level data boundary is unchanged and is the point: documents
   and aggregates come *in*; subject-level clinical data never does. ctms-core
   remains not-an-EDC; the EDC keeps its own system of record.

## Rationale

- Filing timeliness is the top operational failure mode of real TMFs, and the
  documents most often filed late are the ones generated inside other systems
  (casebooks, database-lock evidence, study-build versions). Making those
  systems first-class filers — with attribution, grants, and provenance —
  turns "TMF contemporaneousness" from a chase into a property.
- One interface, many sources: the endpoint is plain multipart over the
  documented API, so any EDC or CTMS-adjacent system can file. The reference
  client is [edc-core](https://github.com/tgerke/edc-core) (AGPL-3.0, like
  this repo — deliberately license-compatible siblings), but nothing binds
  the interface to it.
- Reusing the person/grant model for machines keeps every existing guarantee:
  RBAC scoping, hash-chained audit attribution, and 403-not-fallback for
  unprovisioned identities all apply unchanged. The alternative — API keys
  with their own table and audit path — would duplicate Part 11 surface for
  no gain.

## Consequences

- TMF classification of incoming files is the *source system's* declaration
  (it says which artifact it is filing, by artifact id from the live
  taxonomy). Per ADR-0005, mappings are configured against the imported
  CDISC model, never generated from memory.
- Filed documents land as `pending_review` like any upload; a human still
  reviews and approves. Automation feeds the TMF; it does not bless it.
- A compromised service credential can file (spam) documents but cannot
  approve, sign, or alter anything — and every filing is in the audit chain.
  Rotate the subject mapping to revoke.
- Client-credentials tokens have no `auth_time`, so the signing re-auth path
  is structurally closed to services even before RBAC denies it.
