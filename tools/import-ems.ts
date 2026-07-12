/**
 * eTMF-EMS import (ADR-0025): read a partner's CDISC eTMF-EMS v1.0.2 package
 * and file it through the ADR-0011 filing interface — the same audited
 * multipart endpoint every source system uses, authenticated as a machine
 * identity holding the ingest role. Everything lands pending_review; a human
 * still reviews and approves.
 *
 *   pnpm import-ems -- --package <dir>                    # dir holds exchange.xml
 *   pnpm import-ems -- --package <dir> --dry-run          # plan only, file nothing
 *   pnpm import-ems -- --package <dir> --study CORC-2201  # override batch STUDYID
 *
 * Env / flags: --api (default http://localhost:8787), --token or
 * CTMS_API_TOKEN (dev: dev-service-token, the seeded ingest identity).
 *
 * Receiving-side checks per spec §4.1, before anything is filed: the XML is
 * validated against the official XSD (tools/ems/), every referenced file's
 * SRI checksum is verified, and every mapping blocker is reported at once —
 * unknown UNIQUEIDs, unresolvable sites, country-level or RESTRICTED objects.
 * Artifact mapping is by TMF RM UNIQUEID (§3.2.1) against the verbatim-
 * imported taxonomy; nothing is ever invented (ADR-0005/0012). Re-runs are
 * idempotent: GET /studies/{id}/filings says what this source already filed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmsImportError,
  executeEmsImport,
  parseExchangeXml,
  planEmsImport,
  type ImportContext,
} from "@ctms/core";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const packageDir = flag("--package");
if (!packageDir) {
  console.error(
    "usage: pnpm import-ems -- --package <dir> [--api <url>] [--token <bearer>] [--study <protocol|id>] [--dry-run]",
  );
  process.exit(1);
}
const root = resolve(packageDir);
const apiBase = flag("--api") ?? "http://localhost:8787";
const token = flag("--token") ?? process.env.CTMS_API_TOKEN;
const dryRun = args.includes("--dry-run");
// Even a dry run reads the taxonomy, sites, and prior filings over the API.
if (!token) {
  console.error("no API token: pass --token or set CTMS_API_TOKEN (dev: dev-service-token)");
  process.exit(1);
}

// Package files are addressed by CONTENTURL relative paths; never let one
// escape the package directory.
function packagePath(contentUrl: string): string {
  const p = resolve(root, contentUrl);
  if (p !== root && !p.startsWith(root + sep)) {
    console.error(`CONTENTURL '${contentUrl}' escapes the package directory — refusing`);
    process.exit(1);
  }
  return p;
}

const xmlPath = join(root, "exchange.xml");
let xml: string;
try {
  xml = readFileSync(xmlPath, "utf8");
} catch {
  console.error(`no exchange.xml in ${root}`);
  process.exit(1);
}

// §4.1 check one: validate against the official XSD (the conformance target,
// ADR-0024). A failure refuses; a missing xmllint only downgrades to the
// structural checks the parser performs itself.
const xsd = join(dirname(fileURLToPath(import.meta.url)), "ems", "TmfReferenceModelExchange.xsd");
try {
  execFileSync("xmllint", ["--noout", "--schema", xsd, xmlPath], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  console.log("exchange.xml: valid against the official eTMF-EMS 1.0.2 XSD");
} catch (e) {
  const err = e as NodeJS.ErrnoException & { stderr?: Buffer };
  if (err.code === "ENOENT") {
    console.warn("xmllint not found — skipping XSD validation (structural checks still apply)");
  } else {
    console.error(`exchange.xml FAILS XSD validation:\n${err.stderr?.toString() ?? err}`);
    process.exit(1);
  }
}

let batch;
try {
  batch = parseExchangeXml(xml);
} catch (e) {
  if (e instanceof EmsImportError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
console.log(
  `batch ${batch.transferId} from ${batch.transferSourceId}: study ${batch.studyId}, ` +
    `agreement ${batch.specificationId}, TMF RM ${batch.tmfRmVersion}, ${batch.objects.length} object(s)`,
);

const api = async (path: string, init?: { method?: string; body?: FormData }) => {
  const res = await fetch(new URL(path, apiBase), {
    method: init?.method ?? "GET",
    body: init?.body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (init === undefined && res.status !== 200) {
    console.error(`GET ${path} → ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res;
};

// Resolve the study: the batch's STUDYID, unless the exchange agreement maps
// the partner's identifier onto a different local protocol (--study).
const studyFilter = flag("--study") ?? batch.studyId;
const studies = (await (await api("/studies")).json()) as {
  id: string;
  protocol_number: string;
}[];
const study = studies.find((s) => s.protocol_number === studyFilter || s.id === studyFilter);
if (!study) {
  console.error(
    `no study matches '${studyFilter}' — if the partner's STUDYID differs from the local protocol number, map it with --study`,
  );
  process.exit(1);
}

const artifacts = (await (await api("/tmf-artifacts")).json()) as {
  id: number;
  code: string;
  name: string;
  unique_id: number | null;
}[];
const artifactsByUniqueId = new Map(
  artifacts.filter((a) => a.unique_id !== null).map((a) => [a.unique_id!, a]),
);

const sites = (await (await api(`/studies/${study.id}/sites`)).json()) as {
  study_site_id: string;
  site_number: string;
  country: string | null;
}[];
const sitesBySiteNumber = new Map(
  sites.map((s) => [s.site_number, { study_site_id: s.study_site_id, site_country: s.country }]),
);

const filings = (await (
  await api(
    `/studies/${study.id}/filings?source_system=${encodeURIComponent(batch.transferSourceId)}`,
  )
).json()) as {
  document_id: string;
  document_status: string;
  source_ref: string | null;
  sha256: string;
}[];
const existingFilings = new Map(
  filings
    .filter((f) => f.source_ref !== null)
    .map((f) => [
      f.source_ref!,
      { document_id: f.document_id, sha256: f.sha256, document_status: f.document_status },
    ]),
);

// §4.1 check two: verify every referenced file's checksum before filing.
const fileHashes = new Map<string, { sha256: string; sha384: string; sha512: string }>();
const fileBytes = new Map<string, Uint8Array>();
for (const obj of batch.objects) {
  for (const f of obj.files) {
    if (fileHashes.has(f.contentUrl)) continue;
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(packagePath(f.contentUrl));
    } catch {
      continue; // planEmsImport reports the missing CONTENTURL
    }
    fileBytes.set(f.contentUrl, bytes);
    fileHashes.set(f.contentUrl, {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sha384: createHash("sha384").update(bytes).digest("hex"),
      sha512: createHash("sha512").update(bytes).digest("hex"),
    });
  }
}

const ctx: ImportContext = {
  study,
  artifactsByUniqueId,
  sitesBySiteNumber,
  existingFilings,
  fileHashes,
};
let plan;
try {
  plan = planEmsImport(batch, ctx);
} catch (e) {
  if (e instanceof EmsImportError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

for (const w of plan.warnings) console.warn(`WARNING: ${w}`);
for (const s of plan.skipped) console.log(`already filed, skipping: ${s}`);
for (const a of plan.actions) {
  console.log(
    `${dryRun ? "would file" : "filing"}: ${a.sourceRef} → ${a.artifactCode} ` +
      `(${a.existingDocumentId ? "new version" : "new document"}${a.studySiteId ? ", site-level" : ""}) "${a.title}"`,
  );
}
if (dryRun) {
  console.log(
    `dry run: ${plan.actions.length} version(s) would be filed, ${plan.skipped.length} already filed`,
  );
  process.exit(0);
}
if (plan.actions.length === 0) {
  console.log(`nothing to file: all ${plan.skipped.length} version(s) already filed`);
  process.exit(0);
}

const result = await executeEmsImport(
  plan,
  (contentUrl) => fileBytes.get(contentUrl)!,
  (path, init) => api(path, init),
);
console.log(
  `${study.protocol_number}: ${result.documentsCreated} document(s) created, ` +
    `${result.versionsAdded} version(s) added, ${plan.skipped.length} skipped — ` +
    "all pending_review; filing feeds the TMF, review blesses it (ADR-0011)",
);
