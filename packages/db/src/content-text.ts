import { extractText } from "unpdf";
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
