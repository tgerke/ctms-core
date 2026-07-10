import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "./env.js";

/** Content-addressed blob store: files keyed by sha256, dev-local directory. */
export function storageDir(): string {
  loadEnv();
  if (process.env.STORAGE_DIR) return process.env.STORAGE_DIR;
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return join(dir, "storage");
    const parent = dirname(dir);
    if (parent === dir) return join(process.cwd(), "storage");
    dir = parent;
  }
}

export function putBlob(bytes: Uint8Array): { sha256: string; sizeBytes: number } {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dir = storageDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, sha256);
  if (!existsSync(path)) writeFileSync(path, bytes);
  return { sha256, sizeBytes: bytes.byteLength };
}

export function blobPath(sha256: string): string {
  return join(storageDir(), sha256);
}

export function hasBlob(sha256: string): boolean {
  return existsSync(blobPath(sha256));
}
