/**
 * Backfill extracted text (ADR-0022) for stored versions that have no
 * content row yet — first deployment of content search, or retries after
 * blob-store hiccups. Idempotent: uploads extract inline, so this normally
 * finds nothing to do.
 */
import { createDb } from "./client.js";
import { backfillContentText } from "./content-text.js";

const { sql } = createDb();
const counts = await backfillContentText(sql);
console.log(
  `content text backfill: ${counts.extracted} extracted, ` +
    `${counts.unsupported} unsupported, ${counts.failed} failed, ` +
    `${counts.missing_blob} blobs missing`,
);
await sql.end();
