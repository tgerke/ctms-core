import { blobExtension, type TmfExportData } from "./export.js";

// CDISC eTMF-EMS v1.0.2 exchange.xml serialization (ADR-0024) over the
// ADR-0020 export package. Every tag, attribute, order, and allowed value
// below follows the spec text and XSD in the verified source library
// (eTMF-EMS Specification v1.0.2 §5.2–5.3; TmfReferenceModelExchange.xsd) —
// nothing here is written from model memory (ADR-0012). Two XSD spellings
// differ from the spec's tables and the XSD wins, because it is what
// receiving systems validate against: RENTENTIONDATE (§5.3.2 says
// RETENTIONDATE) and USEROID (§5.3.4 says USERID).

export interface EmsOptions {
  /** SPECIFICATIONID — ID of the exchange agreement (spec §4.3, §5.3.1). */
  agreementId: string;
  /** TRANSFERSOURCEID — identifies the producing system (§5.3.1). */
  transferSourceId?: string;
  /** EVENTID — optional study event the batch belongs to (§5.3.1). */
  eventId?: string;
  /** Batch timestamp; drives TRANSFERID (timestamp-based per §5.3.1). */
  generatedAt?: Date;
}

/** Everything that blocks a conformant batch, reported at once. */
export class EmsMappingError extends Error {
  constructor(public problems: string[]) {
    super(`exchange.xml cannot be produced:\n  - ${problems.join("\n  - ")}`);
    this.name = "EmsMappingError";
  }
}

const XSD_NAMESPACE = "https://tmfrefmodel.com/ems";
// XSD: 2 digits per dot-delimited component.
const ARTIFACT_NUMBER = /^\d{2}\.\d{2}\.\d{2}$/;
// XSD TMFRMVERSION: two or three components, 1–2 digits, no leading zeros.
const TMFRM_VERSION = /^(([1-9][0-9]|[0-9])\.){1,2}([1-9][0-9]|[0-9])$/;

const escapeXml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Spec date format DD-MON-YYYY (§5.3.2), e.g. 20-JAN-2019. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function emsDate(value: unknown): string {
  const d = new Date(value as string);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

const isoDateTime = (value: unknown) => new Date(value as string).toISOString();

/** INTEGRITY: SRI-format checksum (§5.3.3) over the content-addressed hash. */
export function sriSha256(hex: string): string {
  return `sha256-${Buffer.from(hex, "hex").toString("base64")}`;
}

interface Version {
  id: string;
  version_number: number;
  sha256: string;
  file_name: string;
  mime_type: string;
  uploaded_at: string;
  source_system: string | null;
  source_ref: string | null;
}
interface Sig {
  version_number: number;
  meaning: string;
  signer: string;
  signer_email: string;
  signed_at: string;
}

export function buildExchangeXml(data: TmfExportData, opts: EmsOptions): string {
  const problems: string[] = [];

  if (!data.tmfRmVersion) {
    problems.push(
      "no TMF RM version on record (app_meta.tmf_rm_version) — run `pnpm db:import-tmf` with the official spreadsheet first",
    );
  } else if (!TMFRM_VERSION.test(data.tmfRmVersion)) {
    problems.push(
      `recorded TMF RM version '${data.tmfRmVersion}' does not match the XSD TMFRMVERSION pattern`,
    );
  }
  if (!opts.agreementId?.trim()) {
    problems.push("SPECIFICATIONID is mandatory — pass the exchange agreement id");
  }

  // XSD: a BATCH holds one or more OBJECTs; an empty batch cannot validate.
  if (!data.documents.some((d) => ((d.versions as unknown[]) ?? []).length > 0)) {
    problems.push("no document versions to exchange — an EMS batch cannot be empty");
  }

  const missingUniqueId = new Set<string>();
  const missingCountry = new Set<string>();
  const badArtifactNumber = new Set<string>();
  for (const doc of data.documents) {
    const code = doc.artifact_code as string;
    if (doc.artifact_unique_id == null) missingUniqueId.add(code);
    if (!ARTIFACT_NUMBER.test(code)) badArtifactNumber.add(code);
    if (doc.study_site_id && !doc.site_country) missingCountry.add(doc.site_name as string);
  }
  if (missingUniqueId.size > 0) {
    problems.push(
      `artifact(s) without a TMF RM unique ID (mandatory <UNIQUEID>): ${[...missingUniqueId].sort().join(", ")} — ` +
        "run `pnpm db:import-tmf` with the official spreadsheet (the seeded subset carries none, ADR-0005)",
    );
  }
  if (badArtifactNumber.size > 0) {
    problems.push(
      `artifact number(s) outside the XSD xx.xx.xx pattern: ${[...badArtifactNumber].sort().join(", ")}`,
    );
  }
  if (missingCountry.size > 0) {
    problems.push(
      `site(s) without an ISO 3166-1 alpha-3 country (mandatory <COUNTRYID> for site-level objects, §5.3.2): ${[...missingCountry].sort().join(", ")}`,
    );
  }
  if (problems.length > 0) throw new EmsMappingError(problems);

  const generatedAt = opts.generatedAt ?? new Date();
  // Timestamp-based TRANSFERID as §5.3.1 suggests (e.g. 20171105083421).
  const transferId = generatedAt.toISOString().replace(/\D/g, "").slice(0, 14);

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const attr = (name: string, value: string) => `${name}="${escapeXml(value)}"`;
  const el = (indent: string, name: string, value: string) =>
    lines.push(`${indent}<${name}>${escapeXml(value)}</${name}>`);

  const batchAttrs = [
    attr("xmlns", XSD_NAMESPACE),
    attr("STUDYSYSTEMID", String(data.study.id)),
    attr("STUDYID", String(data.study.protocol_number)),
    ...(opts.eventId ? [attr("EVENTID", opts.eventId)] : []),
    attr("TRANSFERSOURCEID", opts.transferSourceId ?? "ctms-core"),
    attr("TRANSFERID", transferId),
    attr("SPECIFICATIONID", opts.agreementId),
    attr("TMFRMVERSION", data.tmfRmVersion as string),
  ];
  lines.push(`<BATCH ${batchAttrs.join(" ")}>`);

  for (const doc of data.documents) {
    const versions = (doc.versions as Version[]) ?? [];
    const signatures = (doc.signatures as Sig[]) ?? [];
    const latest = Math.max(...versions.map((v) => v.version_number));
    for (const version of versions) {
      lines.push("  <OBJECT>");
      // Element order is the XSD <xs:sequence>; do not reorder.
      el("    ", "OBJECTID", String(doc.id));
      el("    ", "OBJECTLEVEL", doc.study_site_id ? "Site" : "Trial");
      if (doc.study_site_id) {
        el("    ", "COUNTRYID", String(doc.site_country));
        el("    ", "SITESYSTEMID", String(doc.study_site_id));
        el("    ", "SITEID", String(doc.site_number));
      }
      el("    ", "UNIQUEID", String(doc.artifact_unique_id));
      el("    ", "ARTIFACTNUMBER", String(doc.artifact_code));
      if (doc.person_given_name) {
        el("    ", "PERSONNAME", `${doc.person_given_name} ${doc.person_family_name}`);
      }
      if (doc.site_name) el("    ", "ORGANIZATIONNAME", String(doc.site_name));
      el("    ", "OBJECTVERSION", String(version.version_number));
      // Current = the latest iteration of a record still standing (effective
      // or awaiting review); Superseded = replaced (older iteration, or the
      // document itself superseded); Obsolete = the latest iteration of a
      // returned document — no longer applicable from a TMF perspective.
      // The exact ctms-core status rides in <METADATA> below.
      const state =
        version.version_number < latest || doc.status === "superseded"
          ? "Superseded"
          : doc.status === "returned"
            ? "Obsolete"
            : "Current";
      el("    ", "OBJECTVERSIONSTATE", state);
      el("    ", "OBJECTTITLE", String(doc.title));
      el("    ", "OBJECTCOPY", "No"); // authoritative source records, not shadow copies
      if (doc.expires_at) el("    ", "OBJECTEXPIRYDATE", emsDate(doc.expires_at));
      if (doc.effective_date) {
        el("    ", "ARTIFACTDATE", emsDate(doc.effective_date));
        el("    ", "DATEDESCRIPTION", "Effective date");
      }

      const ext = blobExtension(version.mime_type);
      lines.push("    <FILE>");
      el("      ", "INTEGRITY", sriSha256(version.sha256));
      // The package is content-addressed (ADR-0020): the physical file name
      // is the checksum. §5.1 makes the folder layout agreement-defined.
      el("      ", "FILENAME", `${version.sha256}.${ext}`);
      el("      ", "CONTENTURL", `files/${version.sha256}.${ext}`);
      el("      ", "FILEDESCRIPTION", "Record");

      for (const sig of signatures.filter((s) => s.version_number === version.version_number)) {
        lines.push("      <SIGNATURE>");
        el("        ", "SIGNATUREMETHODOLOGY", "Electronic");
        el("        ", "USEROID", sig.signer_email);
        el("        ", "SIGNATURENAME", sig.signer);
        el("        ", "SIGNATUREDATETIME", isoDateTime(sig.signed_at));
        el("        ", "SIGNATUREREASON", sig.meaning);
        lines.push("      </SIGNATURE>");
      }

      // File-scoped audit entries: events on this version row and on rows
      // that reference it (signatures, returns). The full hash-chained trail
      // rides beside this file in audit-trail.jsonl (ADR-0020).
      const auditEntries = data.auditEvents.filter((e) => {
        if (e.entity_type === "document_version") return e.entity_id === version.id;
        if (e.entity_type === "signature" || e.entity_type === "document_return") {
          const row = (e.after ?? e.before) as Record<string, unknown> | null;
          return row?.document_version_id === version.id;
        }
        return false;
      });
      for (const event of auditEntries) {
        const op = String(event.action).split(".").pop();
        lines.push("      <AUDITRECORD>");
        el("        ", "AUDITID", String(event.id));
        el("        ", "DATETIMESTAMP", isoDateTime(event.occurred_at));
        el("        ", "USERREF", String(event.actor_label));
        el(
          "        ",
          "AUDITENTRYTYPE",
          op === "insert" ? "New" : op === "update" ? "Change" : op === "delete" ? "Delete" : "Other",
        );
        el("        ", "AUDITEVENT", String(event.action));
        lines.push("      </AUDITRECORD>");
      }
      lines.push("    </FILE>");

      // Agreement-defined metadata (§5.3.6): the facts the standard tags
      // cannot carry, so the receiving side loses nothing in the mapping.
      const meta: [string, string][] = [
        ["CTMS_DOCUMENT_STATUS", String(doc.status)],
        ["CTMS_ORIGINAL_FILENAME", version.file_name],
      ];
      if (version.source_system) meta.push(["CTMS_SOURCE_SYSTEM", version.source_system]);
      if (version.source_ref) meta.push(["CTMS_SOURCE_REF", version.source_ref]);
      for (const [name, value] of meta) {
        lines.push(`    <METADATA ${attr("NAME", name)}>${escapeXml(value)}</METADATA>`);
      }
      lines.push("  </OBJECT>");
    }
  }
  lines.push("</BATCH>");
  return lines.join("\n") + "\n";
}
