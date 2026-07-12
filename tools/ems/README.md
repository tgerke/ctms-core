# eTMF-EMS exchange.xsd (vendored)

`TmfReferenceModelExchange.xsd` is the official XML schema for the CDISC
eTMF Exchange Mechanism Standard, copied verbatim (do not edit) from
https://github.com/TmfRef/exchange-framework — the repository the
eTMF-EMS Specification v1.0.2 §2 designates for the schema.

Vendoring is permitted: the TMF Reference Model publishes the EMS materials
in the public domain, "free for use by anyone for any purpose without
restriction" (spec front matter; https://tmfrefmodel.com/about/ipr/). This
differs from the TMF Reference Model spreadsheet itself, which is licensed
and is never vendored (ADR-0005).

The export CLI validates every exchange.xml it writes against this schema
(`xmllint --schema`), per spec §4.1. Provenance, hashes, and the spec text
live in the verified source library (ADR-0012):
`~/claude-clinical-skills/sources/CDISC/TMF/`.
