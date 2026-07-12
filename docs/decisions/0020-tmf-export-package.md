# ADR-0020: TMF transfer is a verifiable package; EMS conformance waits for the source text

Date: 2026-07-11. Status: accepted.

## Context

There was no bulk export: no way to hand the TMF to a successor system, an
archive, or an inspector as a package. CDISC publishes the eTMF Exchange
Mechanism Standard (exchange.xml inventory + XSD + per-file checksums)
precisely because sponsor–CRO transfers between vendor systems kept
failing, and the content-addressed store already gives every version the
sha256 such a transfer wants to verify.

The obvious move — emitting EMS-conformant exchange.xml — hits ADR-0012:
the EMS specification is not in the verified source library
(`~/claude-clinical-skills/sources/` has the TMF Reference Model, not the
EMS), and this project does not write a standard's file layout from model
memory. A plausible-looking exchange.xml that misnames one element is
worse than an honest package that never claimed conformance.

## Decision

1. **`pnpm export-tmf -- --study <protocol>` writes a complete, verifiable
   package**: `manifest.json` (study, counts, audit-chain head, format
   marker `ctms-core-tmf-export/1`), `documents.json` (every document with
   versions, signatures — including `signed_sha256`, so the §11.70
   record↔signature binding verifies inside the package — returns, and
   provenance), `expected-status.json` (the completeness snapshot,
   waivers included), `audit-trail.jsonl` (the full hash chain), and
   `files/<sha256>.<ext>` content-addressed bytes.
2. **Verification needs no ctms-core software.** `manifest.sha256` is a
   `shasum -a 256 -c` compatible sidecar covering every file including the
   manifest; the file names of the bytes *are* their checksums. The
   export re-hashes each blob as it copies and fails loudly on any
   mismatch or missing blob, and refuses a clean exit if the audit chain
   does not verify.
3. **The audit trail exports whole**, not as a per-study slice: the chain
   only verifies end to end, and pilots deploy single-tenant. A
   multi-tenant deployment would need chain-per-study before this changes.
4. **No CDISC eTMF-EMS conformance is claimed.** The manifest deliberately
   carries the metadata and per-file checksums an EMS serializer needs;
   writing the actual exchange.xml is a mapping step that starts the day
   the EMS v1.0.x text (spec + XSD) lands in the verified source library —
   the same posture ADR-0005 took for the licensed taxonomy spreadsheet.
5. **CLI, not an API endpoint.** A transfer is an operator act on the
   deployment host (like validation artifacts and the digest), not a
   runtime capability; inspectors keep the `read_only` seat for live
   access and receive this package for offline work.

## Consequences

- "Hand the TMF to an inspector" is one command plus one `shasum -c` on
  the receiving side; a single flipped byte fails verification.
- The format marker versions the package; EMS output, when it comes, is an
  additional serialization of the same collected data, not a rework.
- Action for the source library: obtaining eTMF-EMS v1.0.2 (tmfrefmodel.com/ems)
  and adding it under `sources/CDISC/TMF/` is the unblock for conformance.
