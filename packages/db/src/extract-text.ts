/**
 * Backfill extracted text (ADR-0022) for stored versions that have no
 * content row yet — first deployment of content search, or retries after
 * blob-store hiccups — then OCR image-only PDFs (ADR-0031) unless --no-ocr.
 * Idempotent: uploads extract inline and OCR marks what it has read, so
 * this normally finds nothing to do.
 */
import { createDb } from "./client.js";
import { backfillContentText, backfillOcr } from "./content-text.js";

const { sql } = createDb();
const counts = await backfillContentText(sql);
console.log(
  `content text backfill: ${counts.extracted} extracted, ` +
    `${counts.unsupported} unsupported, ${counts.failed} failed, ` +
    `${counts.missing_blob} blobs missing`,
);
if (!process.argv.includes("--no-ocr")) {
  const ocr = await backfillOcr(sql);
  console.log(
    `ocr backfill: ${ocr.recognized} recognized, ${ocr.blank} blank, ` +
      `${ocr.failed} failed, ${ocr.missing_blob} blobs missing`,
  );
}
await sql.end();
