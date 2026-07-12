import { XMLParser } from "fast-xml-parser";

// CDISC eTMF-EMS v1.0.2 import (ADR-0025): parse a partner's exchange.xml and
// plan its filing through the ADR-0011 endpoint. The receiving-side checks are
// the ones spec §4.1 names — XML validation and checksum verification — and
// artifact mapping follows §3.2.1: UNIQUEID "never changes and ... is
// considered the primary method for mapping artifacts". Nothing is invented:
// an object that cannot be mapped against the imported taxonomy, resolved to
// a known site, or honestly represented in the schema blocks the batch, with
// every problem reported at once (the ADR-0024 refusal pattern).

/** Everything that blocks an import, reported at once. */
export class EmsImportError extends Error {
  constructor(public problems: string[]) {
    super(`exchange.xml cannot be imported:\n  - ${problems.join("\n  - ")}`);
    this.name = "EmsImportError";
  }
}

export interface EmsFile {
  integrity: string;
  fileName: string;
  contentUrl: string;
  fileDescription?: string;
  /** Partner-asserted records: retained with the package, never replayed. */
  signatureCount: number;
  auditRecordCount: number;
}

export interface EmsObject {
  objectId: string;
  objectLevel: "Trial" | "Country" | "Site";
  countryId?: string;
  siteSystemId?: string;
  siteId?: string;
  uniqueId: number;
  artifactNumber: string;
  personNames: string[];
  organizationName?: string;
  objectVersion: string;
  objectVersionState: "Current" | "Superseded" | "Obsolete";
  objectTitle?: string;
  objectCopy: "Yes" | "No";
  restricted?: "Yes" | "No";
  expiryDate?: string;
  files: EmsFile[];
  metadata: { name: string; value: string }[];
}

export interface EmsBatch {
  studySystemId?: string;
  studyId: string;
  eventId?: string;
  transferSourceId: string;
  transferId: string;
  specificationId: string;
  tmfRmVersion: string;
  objects: EmsObject[];
}

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const text = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : String(v);

/**
 * Parse exchange.xml into a typed batch. Structural gaps (missing mandatory
 * tags per XSD) are collected and thrown together — the parser is the guard
 * when xmllint is not available to run the official schema first.
 */
export function parseExchangeXml(xml: string): EmsBatch {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    throw new EmsImportError([`not well-formed XML: ${e instanceof Error ? e.message : e}`]);
  }
  const batch = doc.BATCH as Record<string, unknown> | undefined;
  if (!batch) throw new EmsImportError(["no <BATCH> root element (is this an exchange.xml?)"]);

  const problems: string[] = [];
  const batchAttr = (name: string): string => {
    const v = text(batch[`@${name}`]);
    if (!v) problems.push(`<BATCH> is missing mandatory attribute ${name}`);
    return v ?? "";
  };
  const studyId = batchAttr("STUDYID");
  const transferSourceId = batchAttr("TRANSFERSOURCEID");
  const transferId = batchAttr("TRANSFERID");
  const specificationId = batchAttr("SPECIFICATIONID");
  const tmfRmVersion = batchAttr("TMFRMVERSION");

  const objects: EmsObject[] = [];
  const rawObjects = asArray(batch.OBJECT as Record<string, unknown> | Record<string, unknown>[]);
  if (rawObjects.length === 0) problems.push("batch contains no <OBJECT> elements");

  rawObjects.forEach((raw, i) => {
    const label = () => text(raw.OBJECTID) ?? `#${i + 1}`;
    const mandatory = (tag: string): string => {
      const v = text(raw[tag]);
      if (v === undefined || v === "") {
        problems.push(`OBJECT ${label()}: missing mandatory <${tag}>`);
        return "";
      }
      return v;
    };
    const objectId = mandatory("OBJECTID");
    const objectLevel = mandatory("OBJECTLEVEL");
    const uniqueIdRaw = mandatory("UNIQUEID");
    const uniqueId = Number(uniqueIdRaw);
    if (uniqueIdRaw !== "" && !Number.isInteger(uniqueId)) {
      problems.push(`OBJECT ${label()}: <UNIQUEID> '${uniqueIdRaw}' is not an integer (XSD xs:int)`);
    }

    const files: EmsFile[] = asArray(
      raw.FILE as Record<string, unknown> | Record<string, unknown>[],
    ).map((f) => ({
      integrity: text(f.INTEGRITY) ?? "",
      fileName: text(f.FILENAME) ?? "",
      contentUrl: text(f.CONTENTURL) ?? "",
      fileDescription: text(f.FILEDESCRIPTION),
      signatureCount: asArray(f.SIGNATURE).length,
      auditRecordCount: asArray(f.AUDITRECORD).length,
    }));
    if (files.length === 0) problems.push(`OBJECT ${label()}: no <FILE> element`);
    for (const f of files) {
      if (!f.integrity) problems.push(`OBJECT ${label()}: <FILE> missing <INTEGRITY>`);
      if (!f.contentUrl) problems.push(`OBJECT ${label()}: <FILE> missing <CONTENTURL>`);
      if (!f.fileName) problems.push(`OBJECT ${label()}: <FILE> missing <FILENAME>`);
    }

    const metadata = asArray(raw.METADATA as Record<string, unknown> | Record<string, unknown>[])
      .map((m) =>
        typeof m === "object"
          ? { name: text(m["@NAME"]) ?? "", value: text(m["#text"]) ?? "" }
          : { name: "", value: String(m) },
      )
      .filter((m) => m.name !== "");

    objects.push({
      objectId,
      objectLevel: objectLevel as EmsObject["objectLevel"],
      countryId: text(raw.COUNTRYID),
      siteSystemId: text(raw.SITESYSTEMID),
      siteId: text(raw.SITEID),
      uniqueId,
      artifactNumber: mandatory("ARTIFACTNUMBER"),
      personNames: asArray(raw.PERSONNAME).map((p) => String(p)),
      organizationName: text(raw.ORGANIZATIONNAME),
      objectVersion: mandatory("OBJECTVERSION"),
      objectVersionState: mandatory("OBJECTVERSIONSTATE") as EmsObject["objectVersionState"],
      objectTitle: text(raw.OBJECTTITLE),
      objectCopy: mandatory("OBJECTCOPY") as EmsObject["objectCopy"],
      restricted: text(raw.RESTRICTED) as EmsObject["restricted"],
      expiryDate: text(raw.OBJECTEXPIRYDATE),
      files,
      metadata,
    });
  });

  if (problems.length > 0) throw new EmsImportError(problems);
  return {
    studySystemId: text(batch["@STUDYSYSTEMID"]),
    studyId,
    eventId: text(batch["@EVENTID"]),
    transferSourceId,
    transferId,
    specificationId,
    tmfRmVersion,
    objects,
  };
}

/** Parse an SRI value (§5.3.3) into its algorithm and hex digest. */
export function parseSri(integrity: string): { algorithm: string; hex: string } | null {
  const m = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(integrity.trim());
  if (!m) return null;
  return { algorithm: m[1]!, hex: Buffer.from(m[2]!, "base64").toString("hex") };
}

/** The version-row provenance that threads partner iterations (ADR-0025). */
export function emsSourceRef(objectId: string, objectVersion: string): string {
  return `${objectId}:${objectVersion}`;
}

export interface ImportContext {
  study: { id: string; protocol_number: string };
  /** tmf_artifact rows keyed by TMF RM unique ID (null until db:import-tmf). */
  artifactsByUniqueId: Map<number, { id: number; code: string; name: string }>;
  /** Active study sites keyed by site_number (the EMS SITEID). */
  sitesBySiteNumber: Map<string, { study_site_id: string; site_country: string | null }>;
  /**
   * What this source system already filed (GET /studies/{id}/filings):
   * source_ref → its content hash and document, for idempotent re-runs and
   * interim transfers.
   */
  existingFilings: Map<string, { document_id: string; sha256: string; document_status: string }>;
  /** sha-256/384/512 hex of every package file, keyed by CONTENTURL. */
  fileHashes: Map<string, { sha256: string; sha384: string; sha512: string }>;
}

export interface PlannedVersion {
  objectId: string;
  objectVersion: string;
  sourceRef: string;
  tmfArtifactId: number;
  artifactCode: string;
  studySiteId: string | null;
  title: string;
  contentUrl: string;
  fileName: string;
  objectVersionState: string;
  /** Set when an earlier transfer already created the thread's document. */
  existingDocumentId: string | null;
}

export interface EmsImportPlan {
  transferSourceId: string;
  study: { id: string; protocol_number: string };
  /** Version filings in order; versions of one object thread consecutively. */
  actions: PlannedVersion[];
  /** source_refs already filed with identical content — nothing to do. */
  skipped: string[];
  warnings: string[];
}

/**
 * Map a parsed batch onto the filing endpoint: which document versions to
 * file, in what order, against which artifact and scope. Throws with every
 * blocker at once; files nothing itself — execution is the caller's HTTP.
 */
export function planEmsImport(batch: EmsBatch, ctx: ImportContext): EmsImportPlan {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (ctx.artifactsByUniqueId.size === 0) {
    problems.push(
      "no artifact in the live taxonomy carries a TMF RM unique ID — run `pnpm db:import-tmf` " +
        "with the official spreadsheet first (mapping by UNIQUEID is never invented, ADR-0005/0012)",
    );
  }

  // Group by OBJECTID: one partner object = one document thread here.
  const threads = new Map<string, EmsObject[]>();
  for (const obj of batch.objects) {
    threads.set(obj.objectId, [...(threads.get(obj.objectId) ?? []), obj]);
  }

  const actions: PlannedVersion[] = [];
  const skipped: string[] = [];

  for (const [objectId, versions] of threads) {
    // OBJECTVERSION is text (§5.3.2); order numerically when the thread
    // allows it, lexicographically (with a warning) when it does not.
    const numeric = versions.every((v) => /^\d+$/.test(v.objectVersion));
    versions.sort((a, b) =>
      numeric
        ? Number(a.objectVersion) - Number(b.objectVersion)
        : a.objectVersion.localeCompare(b.objectVersion),
    );
    if (!numeric && versions.length > 1) {
      warnings.push(
        `OBJECT ${objectId}: non-numeric OBJECTVERSIONs ordered lexicographically (${versions.map((v) => v.objectVersion).join(", ")})`,
      );
    }

    const first = versions[0]!;
    let threadDocumentId: string | null = null;
    let threadDocumentStatus: string | null = null;
    for (const ref of ctx.existingFilings.keys()) {
      if (ref.startsWith(`${objectId}:`)) {
        const filing = ctx.existingFilings.get(ref)!;
        threadDocumentId = filing.document_id;
        threadDocumentStatus = filing.document_status;
      }
    }

    // Scope: the schema has trial and site levels. Country-level objects have
    // no honest home — refusing beats silently refiling them at trial level.
    let studySiteId: string | null = null;
    if (first.objectLevel === "Country") {
      problems.push(
        `OBJECT ${objectId}: OBJECTLEVEL Country — this schema has no country scope; ` +
          "file the object at trial or site level under the exchange agreement",
      );
    } else if (first.objectLevel === "Site") {
      const site = first.siteId ? ctx.sitesBySiteNumber.get(first.siteId) : undefined;
      if (!site) {
        problems.push(
          `OBJECT ${objectId}: SITEID '${first.siteId ?? "(missing)"}' matches no site on study ${ctx.study.protocol_number}`,
        );
      } else {
        studySiteId = site.study_site_id;
        if (first.countryId && site.site_country && first.countryId !== site.site_country) {
          warnings.push(
            `OBJECT ${objectId}: COUNTRYID ${first.countryId} differs from site ${first.siteId}'s recorded country ${site.site_country}`,
          );
        }
      }
    }

    // Artifact mapping: UNIQUEID is primary (§3.2.1) and survives model
    // version drift; the ARTIFACTNUMBER cross-check surfaces that drift.
    const artifact = ctx.artifactsByUniqueId.get(first.uniqueId);
    if (!artifact && ctx.artifactsByUniqueId.size > 0) {
      problems.push(
        `OBJECT ${objectId}: UNIQUEID ${first.uniqueId} matches no artifact in the imported taxonomy ` +
          `(ARTIFACTNUMBER ${first.artifactNumber})`,
      );
    } else if (artifact && artifact.code !== first.artifactNumber) {
      warnings.push(
        `OBJECT ${objectId}: ARTIFACTNUMBER ${first.artifactNumber} disagrees with the imported ` +
          `taxonomy's ${artifact.code} for UNIQUEID ${first.uniqueId} (TMF RM version drift?) — UNIQUEID wins`,
      );
    }

    for (const obj of versions) {
      const ref = emsSourceRef(objectId, obj.objectVersion);

      if (obj.restricted === "Yes") {
        // ADR-0014 boundary: no blinded/restricted seat exists. Filing the
        // object would silently drop a restriction the partner declared.
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: RESTRICTED=Yes — no restricted-access scoping ` +
            "exists here yet (roadmap boundary); it cannot be honored, so it is not imported",
        );
        continue;
      }
      if (obj.files.length > 1) {
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: ${obj.files.length} <FILE> elements — one record ` +
            "file per version is supported; split the object or constrain it in the exchange agreement",
        );
        continue;
      }
      const file = obj.files[0]!;

      // §4.1: the receiving system verifies checksums before importing.
      const sri = parseSri(file.integrity);
      const hashes = ctx.fileHashes.get(file.contentUrl);
      if (!sri) {
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: INTEGRITY '${file.integrity}' is not an SRI ` +
            "sha256/sha384/sha512 value (§5.3.3)",
        );
      } else if (!hashes) {
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: CONTENTURL '${file.contentUrl}' not found in the package`,
        );
      } else if (hashes[sri.algorithm as keyof typeof hashes] !== sri.hex) {
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: checksum mismatch for '${file.contentUrl}' — ` +
            "the file does not match its declared INTEGRITY",
        );
      }

      const existing = ctx.existingFilings.get(ref);
      if (existing && hashes) {
        if (existing.sha256 === hashes.sha256) {
          skipped.push(ref);
          continue;
        }
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: already filed by ${batch.transferSourceId} ` +
            `with different content (filed ${existing.sha256.slice(0, 12)}…, package ${hashes.sha256.slice(0, 12)}…) — ` +
            "versions are immutable; the partner must issue a new OBJECTVERSION",
        );
        continue;
      }
      if (threadDocumentStatus === "superseded" && !existing) {
        problems.push(
          `OBJECT ${objectId} v${obj.objectVersion}: its document here is superseded — ` +
            "a closed record cannot grow new versions; resolve under the exchange agreement",
        );
        continue;
      }

      if (obj.personNames.length > 0) {
        warnings.push(
          `OBJECT ${objectId} v${obj.objectVersion}: PERSONNAME '${obj.personNames.join("; ")}' not mapped — ` +
            "a name is not an identity; the document files without a person scope",
        );
      }
      if (!obj.objectTitle) {
        warnings.push(
          `OBJECT ${objectId} v${obj.objectVersion}: no OBJECTTITLE — titled by its artifact (${artifact?.name ?? first.artifactNumber})`,
        );
      }

      actions.push({
        objectId,
        objectVersion: obj.objectVersion,
        sourceRef: ref,
        tmfArtifactId: artifact?.id ?? -1,
        artifactCode: artifact?.code ?? first.artifactNumber,
        studySiteId,
        title: obj.objectTitle ?? artifact?.name ?? first.artifactNumber,
        contentUrl: file.contentUrl,
        fileName: file.fileName,
        objectVersionState: obj.objectVersionState,
        existingDocumentId: threadDocumentId,
      });
    }
  }

  if (problems.length > 0) throw new EmsImportError(problems);

  // Partner-asserted records travel with the retained package; this system's
  // audit chain records only the filings it witnesses (ADR-0025).
  const asserted = batch.objects
    .flatMap((o) => o.files)
    .reduce(
      (n, f) => ({
        signatures: n.signatures + f.signatureCount,
        audits: n.audits + f.auditRecordCount,
      }),
      { signatures: 0, audits: 0 },
    );
  if (asserted.signatures + asserted.audits > 0) {
    warnings.push(
      `the batch asserts ${asserted.signatures} signature(s) and ${asserted.audits} audit record(s) — ` +
        "they stay in the retained package as the partner's record, not replayed into this one (ADR-0025)",
    );
  }
  return {
    transferSourceId: batch.transferSourceId,
    study: ctx.study,
    actions,
    skipped,
    warnings,
  };
}

/** Content types the importer can name from a file extension; everything
 *  else files as application/octet-stream (the bytes are the record). */
export function mimeFromFileName(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "pdf"
    ? "application/pdf"
    : ext === "txt"
      ? "text/plain"
      : ext === "xml"
        ? "text/xml"
        : "application/octet-stream";
}

export interface EmsImportResult {
  documentsCreated: number;
  versionsAdded: number;
  filed: { sourceRef: string; documentId: string; versionNumber: number }[];
}

/**
 * Execute a plan against the ADR-0011 filing surface: the first version of a
 * new thread creates its own document (force_new — a partner record is never
 * merged into a local one), later iterations land on that document. The
 * request function is the only I/O: the CLI passes fetch against a live API,
 * tests pass the app itself.
 */
export async function executeEmsImport(
  plan: EmsImportPlan,
  readFile: (contentUrl: string) => Uint8Array | Promise<Uint8Array>,
  request: (
    path: string,
    init: { method: string; body: FormData },
  ) => Promise<{ status: number; json(): Promise<unknown> }>,
): Promise<EmsImportResult> {
  const threadDoc = new Map<string, string>();
  for (const a of plan.actions) {
    if (a.existingDocumentId) threadDoc.set(a.objectId, a.existingDocumentId);
  }

  const result: EmsImportResult = { documentsCreated: 0, versionsAdded: 0, filed: [] };
  for (const action of plan.actions) {
    const bytes = await readFile(action.contentUrl);
    const file = new File([bytes as BlobPart], action.fileName, {
      type: mimeFromFileName(action.fileName),
    });
    const form = new FormData();
    form.set("file", file);
    form.set("source_system", plan.transferSourceId);
    form.set("source_ref", action.sourceRef);

    const documentId = threadDoc.get(action.objectId);
    let path: string;
    if (documentId) {
      path = `/documents/${documentId}/versions`;
    } else {
      path = "/documents";
      form.set("tmf_artifact_id", String(action.tmfArtifactId));
      form.set("study_id", plan.study.id);
      if (action.studySiteId) form.set("study_site_id", action.studySiteId);
      form.set("title", action.title);
      form.set("force_new", "true");
    }
    const res = await request(path, { method: "POST", body: form });
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status !== 201) {
      throw new Error(
        `filing ${action.sourceRef} failed (${res.status}): ${String(body?.error ?? "unknown error")}`,
      );
    }
    if (documentId) {
      result.versionsAdded++;
    } else {
      result.documentsCreated++;
      threadDoc.set(action.objectId, body.document_id as string);
    }
    result.filed.push({
      sourceRef: action.sourceRef,
      documentId: (body.document_id as string) ?? documentId!,
      versionNumber: body.version_number as number,
    });
  }
  return result;
}
