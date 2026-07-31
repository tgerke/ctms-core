import { fetchTmfExport, fetchVersionBytes, type TmfExport } from "./api";

/**
 * In-browser TMF package assembly (ADR-0035): the same verifiable layout
 * tools/export-tmf.ts writes — content-addressed files/, documents.json,
 * expected-status.json, audit-trail.jsonl, manifest.json, and a shasum -c
 * compatible manifest.sha256 — zipped under one root directory so extraction
 * matches the CLI's output. Every blob is re-hashed here, in the browser,
 * before it enters the package; a mismatch or missing blob is reported, never
 * silently included. eTMF-EMS serialization stays CLI-side (ADR-0024).
 */

export interface PackageFile {
  path: string;
  bytes: Uint8Array;
}

const encoder = new TextEncoder();

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** One extension per mime, mirroring blobExtension in @ctms/core. */
const blobExtension = (mimeType: string) => (mimeType === "application/pdf" ? "pdf" : "bin");

/**
 * Assemble the package's files in the CLI's order. Pure over its inputs:
 * bytes come from the caller, the timestamp is a parameter, so tests can pin
 * the exact output.
 */
export async function buildTmfPackage(
  data: TmfExport,
  getBlobBytes: (sha256: string, versionId: string) => Promise<Uint8Array | null>,
  generatedAt: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: PackageFile[]; missing: number }> {
  // Any version carrying the hash can serve the bytes — content-addressed
  // storage means they are the same bytes by definition (verified below).
  const versionForSha = new Map<string, string>();
  for (const doc of data.documents) {
    for (const v of doc.versions) {
      if (!versionForSha.has(v.sha256)) versionForSha.set(v.sha256, v.id);
    }
  }

  const files: PackageFile[] = [];
  const written: { path: string; sha256: string; bytes: number }[] = [];
  const writeFile = async (path: string, content: Uint8Array | string) => {
    const bytes = typeof content === "string" ? encoder.encode(content) : content;
    files.push({ path, bytes });
    written.push({ path, sha256: await sha256Hex(bytes), bytes: bytes.length });
  };

  let missing = 0;
  let done = 0;
  onProgress?.(0, data.blobs.length);
  for (const blob of data.blobs) {
    const versionId = versionForSha.get(blob.sha256);
    const bytes = versionId ? await getBlobBytes(blob.sha256, versionId) : null;
    done++;
    if (!bytes || (await sha256Hex(bytes)) !== blob.sha256) {
      missing++;
      onProgress?.(done, data.blobs.length);
      continue;
    }
    await writeFile(`files/${blob.sha256}.${blobExtension(blob.mime_type)}`, bytes);
    onProgress?.(done, data.blobs.length);
  }

  await writeFile("documents.json", JSON.stringify(data.documents, null, 2));
  await writeFile("expected-status.json", JSON.stringify(data.expected, null, 2));
  await writeFile(
    "audit-trail.jsonl",
    data.audit_events.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );

  const manifest = {
    format: "ctms-core-tmf-export/1",
    generated_at: generatedAt,
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
  await writeFile("manifest.json", JSON.stringify(manifest, null, 2));

  // shasum -c compatible sidecar, written last so it covers manifest.json too.
  files.push({
    path: "manifest.sha256",
    bytes: encoder.encode(written.map((f) => `${f.sha256}  ${f.path}`).join("\n") + "\n"),
  });

  return { files, missing };
}

export interface TmfDownloadResult {
  zipName: string;
  documents: number;
  uniqueFiles: number;
  auditEvents: number;
  chainValid: boolean;
  missing: number;
}

/**
 * Fetch a study's export data, assemble the package, and hand the browser a
 * zip whose single root directory matches the CLI's default output directory,
 * so `cd <dir> && shasum -a 256 -c manifest.sha256` verifies either way.
 */
export async function downloadTmfPackage(
  studyId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<TmfDownloadResult> {
  const data = await fetchTmfExport(studyId);
  const { files, missing } = await buildTmfPackage(
    data,
    (_sha256, versionId) => fetchVersionBytes(versionId).catch(() => null),
    new Date().toISOString(),
    onProgress,
  );

  // Lazy like the renditions viewers (ADR-0030): jszip stays out of the main
  // bundle until someone actually exports.
  const { default: JSZip } = await import("jszip");
  const root = `tmf-export-${data.study.protocol_number}-${new Date().toISOString().slice(0, 10)}`;
  const zip = new JSZip();
  for (const f of files) zip.file(`${root}/${f.path}`, f.bytes);
  const blob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${root}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);

  return {
    zipName: `${root}.zip`,
    documents: data.documents.length,
    uniqueFiles: data.blobs.length - missing,
    auditEvents: data.chain.events,
    chainValid: data.chain.valid,
    missing,
  };
}
