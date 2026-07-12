/**
 * TMF transfer / inspection export (ADR-0020): write one study's complete,
 * verifiable TMF package to a directory.
 *
 *   pnpm export-tmf -- --study CORC-2201            # into ./tmf-export-…
 *   pnpm export-tmf -- --study CORC-2201 --out /tmp/handover
 *
 * Package layout:
 *   manifest.json        study, counts, audit-chain head, format marker
 *   documents.json       every document with versions, signatures, returns
 *   expected-status.json v_expected_document_status snapshot (incl. waivers)
 *   audit-trail.jsonl    the full hash-chained audit trail, one event/line
 *   files/<sha256>.<ext> content-addressed document bytes
 *   manifest.sha256      shasum -c compatible checksums of every file above
 *
 * Verify on the receiving side:  shasum -a 256 -c manifest.sha256
 *
 * Not CDISC eTMF-EMS output (deliberately unclaimed — ADR-0020): the
 * manifest carries the metadata and per-file checksums a conformant
 * exchange.xml serializer would map once the standard's text is in the
 * verified source library.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectTmfExport } from "@ctms/core";
import { createDb, getBlob, loadEnv } from "@ctms/db";

loadEnv();

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const studyFilter = flag("--study");
if (!studyFilter) {
  console.error("usage: pnpm export-tmf -- --study <protocol_number|id> [--out <dir>]");
  process.exit(1);
}

const { sql } = createDb();
const [study] = await sql`
  SELECT id, protocol_number FROM study
  WHERE protocol_number = ${studyFilter} OR id::text = ${studyFilter}`;
if (!study) {
  console.error(`no study matches '${studyFilter}'`);
  await sql.end();
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 10);
const out = resolve(flag("--out") ?? `tmf-export-${study.protocol_number}-${stamp}`);
mkdirSync(join(out, "files"), { recursive: true });

const data = await collectTmfExport(sql, study.id as string);
const sha256Of = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

const written: { path: string; sha256: string; bytes: number }[] = [];
const writeFile = (rel: string, content: Uint8Array | string) => {
  writeFileSync(join(out, rel), content);
  const bytes = typeof content === "string" ? Buffer.byteLength(content) : content.length;
  written.push({ path: rel, sha256: sha256Of(content), bytes });
};

// Content-addressed bytes: the file name IS the checksum the manifest lists.
let missing = 0;
for (const blob of data.blobs) {
  const bytes = await getBlob(blob.sha256);
  if (!bytes) {
    console.error(`MISSING BLOB ${blob.sha256} — store does not have it`);
    missing++;
    continue;
  }
  const ext = blob.mime_type === "application/pdf" ? "pdf" : "bin";
  const actual = sha256Of(new Uint8Array(bytes));
  if (actual !== blob.sha256) {
    console.error(`HASH MISMATCH ${blob.sha256}: store returned ${actual}`);
    missing++;
    continue;
  }
  writeFile(join("files", `${blob.sha256}.${ext}`), new Uint8Array(bytes));
}

writeFile("documents.json", JSON.stringify(data.documents, null, 2));
writeFile("expected-status.json", JSON.stringify(data.expected, null, 2));
writeFile("audit-trail.jsonl", data.auditEvents.map((e) => JSON.stringify(e)).join("\n") + "\n");

const manifest = {
  format: "ctms-core-tmf-export/1",
  generated_at: new Date().toISOString(),
  study: data.study,
  counts: {
    documents: data.documents.length,
    expected_documents: data.expected.length,
    unique_files: data.blobs.length - missing,
    audit_events: data.chain.events,
  },
  audit_chain: data.chain,
  files: written,
};
writeFile("manifest.json", JSON.stringify(manifest, null, 2));

// shasum -c compatible sidecar, written last so it covers manifest.json too.
writeFileSync(
  join(out, "manifest.sha256"),
  written.map((f) => `${f.sha256}  ${f.path}`).join("\n") + "\n",
);

console.log(
  `${study.protocol_number}: ${manifest.counts.documents} documents, ` +
    `${manifest.counts.unique_files} files, ${manifest.counts.audit_events} audit events ` +
    `(chain ${data.chain.valid ? "verified" : "BROKEN"}) → ${out}`,
);
console.log(`verify with:  cd ${out} && shasum -a 256 -c manifest.sha256`);
if (missing > 0) {
  console.error(`${missing} blob(s) missing or mismatched — package is INCOMPLETE`);
  process.exitCode = 1;
}
if (!data.chain.valid) process.exitCode = 1;

await sql.end();
