import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import {
  createLockedBucket,
  makeLocalStore,
  makeS3Store,
  sha256Of,
  type BlobStore,
} from "./storage.js";

/**
 * One contract, two drivers. The s3 suite runs against the MinIO service from
 * docker-compose and additionally proves the WORM property: with Object Lock
 * in COMPLIANCE mode, even the root credential cannot delete a stored version
 * before its retention date.
 */

const MINIO = {
  endpoint: process.env.S3_TEST_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  accessKeyId: "ctms",
  secretAccessKey: "ctms-minio",
  forcePathStyle: true,
};

async function minioAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${MINIO.endpoint}/minio/health/live`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function contract(name: string, make: () => Promise<BlobStore>) {
  describe(`${name} driver contract`, () => {
    it("stores content-addressed, round-trips bytes, reports presence", async () => {
      const store = await make();
      const bytes = new TextEncoder().encode(`storage contract probe ${name}`);
      const { sha256, sizeBytes } = await store.put(bytes);
      expect(sha256).toBe(sha256Of(bytes));
      expect(sizeBytes).toBe(bytes.byteLength);
      expect(await store.has(sha256)).toBe(true);
      expect(await store.get(sha256)).toEqual(bytes);
      // put is idempotent for identical content
      expect((await store.put(bytes)).sha256).toBe(sha256);
      expect(await store.has("0".repeat(64))).toBe(false);
      expect(await store.get("0".repeat(64))).toBeNull();
    });
  });
}

contract("local", async () => makeLocalStore(mkdtempSync(join(tmpdir(), "ctms-storage-"))));

const hasMinio = await minioAvailable();

describe.skipIf(!hasMinio)("s3 driver (MinIO, Object Lock)", () => {
  // Bucket names must be unique per run: locked objects cannot be removed, so
  // a fresh bucket keeps runs independent.
  const bucket = `ctms-test-${Date.now().toString(36)}`;
  const make = async () => {
    const store = makeS3Store({
      ...MINIO,
      bucket,
      objectLockMode: "COMPLIANCE",
      objectLockRetentionDays: 1,
    });
    await createLockedBucket(store.client, bucket).catch(() => {}); // exists on 2nd call
    return store;
  };

  contract("s3", make);

  it("WORM (§11.10(c)): a locked object version cannot be deleted, even by the root credential", async () => {
    const store = await make();
    const bytes = new TextEncoder().encode(`worm probe ${bucket}`);
    const { sha256 } = await store.put(bytes);

    // Version-targeted delete must be refused under COMPLIANCE lock.
    const { S3Client, ListObjectVersionsCommand } = await import("@aws-sdk/client-s3");
    const client = store.client as InstanceType<typeof S3Client>;
    const versions = await client.send(
      new ListObjectVersionsCommand({ Bucket: bucket, Prefix: sha256 }),
    );
    const versionId = versions.Versions?.[0]?.VersionId;
    expect(versionId).toBeTruthy();
    await expect(
      client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: sha256, VersionId: versionId }),
      ),
    ).rejects.toThrow();
    expect(await store.get(sha256)).toEqual(bytes);
  });
});

if (!hasMinio) {
  console.warn("[storage.test] MinIO not reachable — s3 driver suite skipped (pnpm db:up starts it)");
}
