/**
 * In-browser renditions of office-format bytes (ADR-0030). Nothing here runs
 * on or is stored by the server: these functions convert the exact signed
 * bytes the content endpoint returned, in the viewer's browser, the way the
 * browser's own viewer renders a PDF. The output is a self-contained HTML
 * document meant for a fully sandboxed iframe (no scripts, no origin), so a
 * hostile file can render text and tables and nothing else.
 *
 * mammoth and exceljs are imported dynamically: they live in lazy chunks
 * loaded the first time an office file is actually previewed.
 */

export type RenditionKind = "docx" | "xlsx";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Beyond this the iframe stops being a preview and starts being a worse
// spreadsheet; the truncation note points at the download instead.
const ROW_CAP = 200;
const COL_CAP = 40;

/**
 * Which rendition, if any, fits these bytes. Mime type first; extension only
 * when the uploader sent nothing usable (partner packages and generic HTTP
 * clients often say application/octet-stream). Legacy binary formats
 * (.doc/.xls) and everything else return null — those stay a download offer.
 */
export function renditionKind(
  mime: string | undefined,
  fileName: string | undefined,
): RenditionKind | null {
  if (mime === DOCX_MIME) return "docx";
  if (mime === XLSX_MIME) return "xlsx";
  if (!mime || mime === "application/octet-stream") {
    const name = fileName?.toLowerCase() ?? "";
    if (name.endsWith(".docx")) return "docx";
    if (name.endsWith(".xlsx")) return "xlsx";
  }
  return null;
}

/** Convert the signed bytes to a sandbox-ready HTML document. */
export async function renderRendition(
  kind: RenditionKind,
  bytes: ArrayBuffer,
): Promise<string> {
  return kind === "docx" ? renderDocx(bytes) : renderXlsx(bytes);
}

async function renderDocx(bytes: ArrayBuffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  // mammoth's browser build reads {arrayBuffer}; its node build (used by the
  // tests) only reads {buffer}. Feed whichever this runtime is.
  const NodeBuffer = (globalThis as { Buffer?: { from(b: ArrayBuffer): unknown } })
    .Buffer;
  const input = (
    NodeBuffer ? { buffer: NodeBuffer.from(bytes) } : { arrayBuffer: bytes }
  ) as { arrayBuffer: ArrayBuffer };
  const result = await mammoth.convertToHtml(input);
  return htmlDocument(
    result.value || `<p class="note">(The document has no readable body.)</p>`,
  );
}

/*
 * The xlsx reader below is deliberately ours: exceljs (which the importer
 * uses server-side) silently never resolves `xlsx.load` under a bundler, and
 * a preview needs only cell text — so we read the OOXML parts directly with
 * jszip + fast-xml-parser and keep the lazy chunk ~10× smaller. Handles
 * shared strings, inline strings, rich-text runs, formula results, and
 * booleans; dates and styled numbers show as their stored raw values.
 */

// XML element/attribute shapes as fast-xml-parser hands them to us.
type XmlNode = any;

async function renderXlsx(bytes: ArrayBuffer): Promise<string> {
  const [{ default: JSZip }, { XMLParser }] = await Promise.all([
    import("jszip"),
    import("fast-xml-parser"),
  ]);
  const zip = await JSZip.loadAsync(bytes);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false, // cell values stay verbatim strings
    trimValues: false,
    isArray: (name) => ["sheet", "Relationship", "si", "row", "c", "r"].includes(name),
  });
  const part = async (path: string): Promise<XmlNode | null> => {
    const file = zip.file(path.replace(/^\//, ""));
    return file ? parser.parse(await file.async("string")) : null;
  };

  const workbook = await part("xl/workbook.xml");
  if (!workbook) throw new Error("not a spreadsheet: xl/workbook.xml missing");
  const rels: XmlNode[] =
    (await part("xl/_rels/workbook.xml.rels"))?.Relationships?.Relationship ?? [];
  const targetOf = new Map(rels.map((r) => [r["@_Id"], String(r["@_Target"])]));
  const sharedStrings: string[] = ((await part("xl/sharedStrings.xml"))?.sst?.si ?? []).map(
    (si: XmlNode) => runText(si),
  );

  const sheets: XmlNode[] = workbook.workbook?.sheets?.sheet ?? [];
  const parts: string[] = [];
  for (let i = 0; i < sheets.length; i++) {
    const target = targetOf.get(sheets[i]["@_id"]) ?? `worksheets/sheet${i + 1}.xml`;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const rows: XmlNode[] = (await part(path))?.worksheet?.sheetData?.row ?? [];
    parts.push(`<h2>${esc(String(sheets[i]["@_name"] ?? `Sheet ${i + 1}`))}</h2>`);
    const body: string[] = [];
    let clippedCols = false;
    for (const row of rows.slice(0, ROW_CAP)) {
      const cells: string[] = [];
      for (const c of row.c ?? []) {
        const col = colIndex(c["@_r"], cells.length);
        if (col >= COL_CAP) {
          clippedCols = true;
          break;
        }
        while (cells.length < col) cells.push("");
        cells.push(cellText(c, sharedStrings));
      }
      body.push(`<tr>${cells.map((t) => `<td>${esc(t)}</td>`).join("")}</tr>`);
    }
    parts.push(`<table>${body.join("")}</table>`);
    if (rows.length > ROW_CAP || clippedCols) {
      parts.push(
        `<p class="note">Showing the first ${Math.min(rows.length, ROW_CAP)} rows × ${COL_CAP} columns — download the file for the rest.</p>`,
      );
    }
  }
  if (parts.length === 0) parts.push(`<p class="note">(The workbook has no sheets.)</p>`);
  return htmlDocument(parts.join("\n"));
}

/** Text of a <si>/<is> node: plain <t>, or rich-text runs <r><t>. */
function runText(node: XmlNode): string {
  if (node == null) return "";
  if (node.t !== undefined) return textOf(node.t);
  if (node.r) return node.r.map((run: XmlNode) => textOf(run.t)).join("");
  return "";
}

function textOf(t: XmlNode): string {
  if (t == null) return "";
  return typeof t === "object" ? String(t["#text"] ?? "") : String(t);
}

function cellText(c: XmlNode, sharedStrings: string[]): string {
  switch (c["@_t"]) {
    case "s":
      return sharedStrings[Number(textOf(c.v))] ?? "";
    case "inlineStr":
      return runText(c.is);
    case "b":
      return textOf(c.v) === "1" ? "TRUE" : "FALSE";
    default: // n, str, d, e — the stored value is the display
      return textOf(c.v);
  }
}

/** "C7" → 2; cells without a ref land after the previous one. */
function colIndex(ref: string | undefined, fallback: number): number {
  const letters = /^([A-Z]+)\d+$/.exec(ref ?? "")?.[1];
  if (!letters) return fallback;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Everything we emit ourselves goes through this; mammoth escapes its own. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlDocument(body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5;
         color: #1a1a1a; background: #fff; margin: 1rem 1.25rem; }
  h1, h2, h3 { line-height: 1.25; }
  h2 { font-size: 1.05rem; }
  table { border-collapse: collapse; margin: 0.5rem 0 1rem; }
  td, th { border: 1px solid #d4d4d4; padding: 2px 8px; vertical-align: top;
           white-space: pre-wrap; }
  tr:first-child td { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; }
  .note { color: #737373; font-style: italic; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
