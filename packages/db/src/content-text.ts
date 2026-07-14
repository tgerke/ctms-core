import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createIsomorphicCanvasFactory,
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";
import type { Sql } from "./client.js";
import { getBlob } from "./storage.js";

/**
 * Extracted document text (ADR-0022): derived search state keyed by the same
 * content hash as the blob store. Because versions are immutable, extracted
 * text of a sha256 can never go stale — extract once, keep forever, rebuild
 * at will (`pnpm db:extract-text`). Extraction failures are recorded as rows,
 * not hidden, and must never block the upload that triggered them: the
 * record is the bytes, the text is derived from it.
 */
export interface ExtractedContent {
  status: "extracted" | "unsupported" | "failed";
  content: string | null;
  extractor: string | null;
}

export async function extractContentText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractedContent> {
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  try {
    if (mime === "application/pdf") {
      // pdf.js may take ownership of the buffer it is handed; give it a copy.
      const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
      return { status: "extracted", content: normalize(text), extractor: "unpdf" };
    }
    if (mime.startsWith("text/")) {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { status: "extracted", content: normalize(text), extractor: "utf-8" };
    }
    return { status: "unsupported", content: null, extractor: null };
  } catch {
    return { status: "failed", content: null, extractor: null };
  }
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Extract text for every stored version that has no content row yet — new
 * deployments of this feature, re-seeds, or retries after a missing blob
 * reappears. Idempotent; safe to run any time.
 */
export async function backfillContentText(sql: Sql) {
  const missing = await sql`
    SELECT DISTINCT ON (dv.sha256) dv.sha256, dv.mime_type
    FROM document_version dv
    LEFT JOIN document_content_text ct ON ct.sha256 = dv.sha256
    WHERE ct.sha256 IS NULL
    ORDER BY dv.sha256`;
  const counts = { extracted: 0, unsupported: 0, failed: 0, missing_blob: 0 };
  for (const row of missing) {
    const bytes = await getBlob(row.sha256 as string);
    if (!bytes) {
      // No row is written, so a later run retries once the blob is back.
      counts.missing_blob++;
      continue;
    }
    const res = await extractContentText(bytes, row.mime_type as string);
    await sql`
      INSERT INTO document_content_text (sha256, status, content, extractor, char_count)
      VALUES (${row.sha256}, ${res.status}, ${res.content}, ${res.extractor},
              ${res.content?.length ?? null})
      ON CONFLICT (sha256) DO NOTHING`;
    counts[res.status]++;
  }
  return counts;
}

/**
 * OCR for image-only PDFs (ADR-0031). A scanned PDF extracts to an empty
 * text layer; these are re-read with tesseract.js (WASM — no system binary)
 * from pages rendered via pdf.js + @napi-rs/canvas. OCR output is a reading
 * of the pixels, not the record: it lands in the same derived table, marked
 * by its extractor, and is rebuildable like everything else here.
 */
// A real text layer has more than this; under it, treat the PDF as image-only.
const OCR_TEXT_LAYER_MAX_CHARS = 20;
const OCR_PAGE_CAP = 20;
const OCR_SCALE = 2; // ~144 dpi for a letter page

export interface Ocr {
  recognizePdf(bytes: Uint8Array): Promise<string>;
  close(): Promise<unknown>;
}

export async function createOcr(): Promise<Ocr> {
  const { createWorker } = await import("tesseract.js");
  // eng traineddata downloads once from the tesseract.js CDN, then lives here;
  // the dir must exist or tesseract.js silently skips the cache write.
  const cachePath = fileURLToPath(
    new URL("../node_modules/.cache/tesseract.js", import.meta.url),
  );
  await mkdir(cachePath, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath });
  return {
    async recognizePdf(bytes) {
      // The canvas factory binds when the document proxy is created, not at
      // render time; pdf.js may also take ownership of the buffer — copy it.
      const CanvasFactory = await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"));
      const pdf = await getDocumentProxy(new Uint8Array(bytes), { CanvasFactory });
      const pageCount = Math.min(pdf.numPages, OCR_PAGE_CAP);
      const pages: string[] = [];
      for (let page = 1; page <= pageCount; page++) {
        const png = await renderPageAsImage(pdf, page, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: OCR_SCALE,
        });
        const { data } = await worker.recognize(Buffer.from(png));
        pages.push(data.text);
      }
      return normalize(pages.join(" "));
    },
    close: () => worker.terminate(),
  };
}

/**
 * OCR every stored PDF whose extracted text layer came back (near-)empty.
 * Runs from `pnpm db:extract-text` and the seed — never the upload request:
 * OCR costs seconds per page, and extraction must not block an upload.
 * The updated row keeps status 'extracted' with extractor 'tesseract.js' —
 * a genuinely blank scan included, so nothing is retried forever. A render
 * or OCR failure leaves the text-layer row in place (it is still the honest
 * extraction of the bytes) and is retried on the next run.
 */
export async function backfillOcr(sql: Sql) {
  const candidates = await sql`
    SELECT ct.sha256
    FROM document_content_text ct
    WHERE ct.status = 'extracted'
      AND ct.extractor = 'unpdf'
      AND ct.char_count < ${OCR_TEXT_LAYER_MAX_CHARS}
      AND EXISTS (
        SELECT 1 FROM document_version dv
        WHERE dv.sha256 = ct.sha256
          AND lower(dv.mime_type) LIKE 'application/pdf%')
    ORDER BY ct.sha256`;
  const counts = { recognized: 0, blank: 0, failed: 0, missing_blob: 0 };
  if (candidates.length === 0) return counts;
  const ocr = await createOcr();
  try {
    for (const row of candidates) {
      const bytes = await getBlob(row.sha256 as string);
      if (!bytes) {
        counts.missing_blob++;
        continue;
      }
      try {
        const text = await ocr.recognizePdf(bytes);
        await sql`
          UPDATE document_content_text
          SET content = ${text}, char_count = ${text.length},
              extractor = 'tesseract.js', extracted_at = now()
          WHERE sha256 = ${row.sha256}`;
        counts[text.length > 0 ? "recognized" : "blank"]++;
      } catch {
        counts.failed++;
      }
    }
  } finally {
    await ocr.close();
  }
  return counts;
}
