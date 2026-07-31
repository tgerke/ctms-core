import { describe, expect, it } from "vitest";
import type { TmfExport } from "./api";
import { buildTmfPackage } from "./tmf-export";

/**
 * The in-browser package writer (ADR-0035) must produce the exact layout
 * tools/export-tmf.ts writes: same file set and order, same manifest shape,
 * and a manifest.sha256 sidecar that shasum -c would pass — including the
 * manifest.json entry the manifest itself cannot list.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const pdfBytes = enc.encode("%PDF-1.4 fixture");
const txtBytes = enc.encode("a plain text fixture");

async function fixture(): Promise<{ data: TmfExport; bytesBySha: Map<string, Uint8Array> }> {
  const pdfSha = await sha256Hex(pdfBytes);
  const txtSha = await sha256Hex(txtBytes);
  const data: TmfExport = {
    study: { id: "s1", protocol_number: "TEST-0001", title: "Fixture study" },
    documents: [
      {
        id: "d1",
        title: "Protocol",
        versions: [
          { id: "v1", sha256: pdfSha },
          { id: "v2", sha256: txtSha },
        ],
      },
      // A second document reusing the same bytes: content-addressing means
      // one file in the package, two versions pointing at it.
      { id: "d2", title: "Copy", versions: [{ id: "v3", sha256: pdfSha }] },
    ],
    expected: [{ expected_document_id: "e1" }],
    audit_events: [
      { id: 1, hash: "aa" },
      { id: 2, hash: "bb" },
    ],
    chain: { events: 2, valid: true, head_hash: "bb" },
    blobs: [
      { sha256: pdfSha, size_bytes: pdfBytes.length, mime_type: "application/pdf" },
      { sha256: txtSha, size_bytes: txtBytes.length, mime_type: "text/plain" },
    ],
    tmf_rm_version: null,
  };
  return {
    data,
    bytesBySha: new Map([
      [pdfSha, pdfBytes],
      [txtSha, txtBytes],
    ]),
  };
}

describe("buildTmfPackage (ADR-0035)", () => {
  it("writes the CLI's file set, in the CLI's order", async () => {
    const { data, bytesBySha } = await fixture();
    const { files, missing } = await buildTmfPackage(
      data,
      async (sha) => bytesBySha.get(sha) ?? null,
      "2026-07-31T12:00:00.000Z",
    );
    expect(missing).toBe(0);
    expect(files.map((f) => f.path)).toEqual([
      `files/${data.blobs[0]!.sha256}.pdf`,
      `files/${data.blobs[1]!.sha256}.bin`,
      "documents.json",
      "expected-status.json",
      "audit-trail.jsonl",
      "manifest.json",
      "manifest.sha256",
    ]);
    const trail = dec.decode(files.find((f) => f.path === "audit-trail.jsonl")!.bytes);
    expect(trail).toBe('{"id":1,"hash":"aa"}\n{"id":2,"hash":"bb"}\n');
  });

  it("writes the CLI's manifest shape, listing every file but itself", async () => {
    const { data, bytesBySha } = await fixture();
    const { files } = await buildTmfPackage(
      data,
      async (sha) => bytesBySha.get(sha) ?? null,
      "2026-07-31T12:00:00.000Z",
    );
    const manifest = JSON.parse(
      dec.decode(files.find((f) => f.path === "manifest.json")!.bytes),
    ) as {
      format: string;
      generated_at: string;
      counts: Record<string, number>;
      audit_chain: unknown;
      files: { path: string; sha256: string; bytes: number }[];
    };
    expect(manifest.format).toBe("ctms-core-tmf-export/1");
    expect(manifest.generated_at).toBe("2026-07-31T12:00:00.000Z");
    expect(manifest.counts).toEqual({
      documents: 2,
      expected_documents: 1,
      unique_files: 2,
      audit_events: 2,
    });
    expect(manifest.audit_chain).toEqual(data.chain);
    expect(manifest.files.map((f) => f.path)).toEqual([
      `files/${data.blobs[0]!.sha256}.pdf`,
      `files/${data.blobs[1]!.sha256}.bin`,
      "documents.json",
      "expected-status.json",
      "audit-trail.jsonl",
    ]);
  });

  it("emits a shasum -c compatible sidecar covering manifest.json too", async () => {
    const { data, bytesBySha } = await fixture();
    const { files } = await buildTmfPackage(
      data,
      async (sha) => bytesBySha.get(sha) ?? null,
      "2026-07-31T12:00:00.000Z",
    );
    const byPath = new Map(files.map((f) => [f.path, f.bytes]));
    const sidecar = dec.decode(byPath.get("manifest.sha256")!).trimEnd().split("\n");
    expect(sidecar.length).toBe(files.length - 1); // everything but itself
    for (const line of sidecar) {
      const [sha, path] = line.split("  ");
      expect(await sha256Hex(byPath.get(path!)!)).toBe(sha);
    }
    expect(sidecar.some((l) => l.endsWith("  manifest.json"))).toBe(true);
  });

  it("refuses to include bytes that fail verification, and reports them", async () => {
    const { data, bytesBySha } = await fixture();
    const tampered = new Map(bytesBySha);
    tampered.set(data.blobs[0]!.sha256, enc.encode("tampered bytes"));
    const { files, missing } = await buildTmfPackage(
      data,
      async (sha) => tampered.get(sha) ?? null,
      "2026-07-31T12:00:00.000Z",
    );
    expect(missing).toBe(1);
    expect(files.some((f) => f.path.startsWith(`files/${data.blobs[0]!.sha256}`))).toBe(false);
    const manifest = JSON.parse(
      dec.decode(files.find((f) => f.path === "manifest.json")!.bytes),
    ) as { counts: { unique_files: number } };
    expect(manifest.counts.unique_files).toBe(1);
  });
});
