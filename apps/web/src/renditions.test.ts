import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderRendition, renditionKind } from "./renditions";

/**
 * Renditions (ADR-0030) are pure functions of bytes, so they test in node
 * exactly as they run in the browser. Fixtures are built in-test — a minimal
 * WordprocessingML package via jszip, a workbook via exceljs — so no binary
 * blobs live in the repo. The escaping cases matter most: the output goes
 * into an iframe, and a document is reviewer-supplied input.
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Smallest docx mammoth will open: content types, rels, one document part. */
async function makeDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(p)}</w:t></w:r></w:p>`)
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

/**
 * Fixtures come from exceljs — a different implementation than the reader
 * under test. useSharedStrings exercises both string storage modes the
 * format allows (exceljs writes inline strings by default; Excel itself
 * writes shared strings).
 */
async function makeXlsx(
  sheets: { name: string; rows: unknown[][] }[],
  opts: { useSharedStrings?: boolean } = {},
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) workbook.addWorksheet(sheet.name).addRows(sheet.rows);
  const buffer = await workbook.xlsx.writeBuffer(opts);
  return buffer as ArrayBuffer;
}

describe("renditionKind", () => {
  it("detects office formats by mime type", () => {
    expect(renditionKind(DOCX_MIME, "plan.docx")).toBe("docx");
    expect(renditionKind(XLSX_MIME, "log.xlsx")).toBe("xlsx");
  });

  it("falls back to the extension only when the mime says nothing", () => {
    expect(renditionKind("application/octet-stream", "plan.DOCX")).toBe("docx");
    expect(renditionKind(undefined, "log.xlsx")).toBe("xlsx");
    // a real mime type wins over the extension
    expect(renditionKind("application/pdf", "misnamed.docx")).toBe(null);
  });

  it("leaves everything else as a download offer", () => {
    expect(renditionKind("application/pdf", "doc.pdf")).toBe(null);
    expect(renditionKind("application/msword", "legacy.doc")).toBe(null);
    expect(renditionKind("application/vnd.ms-excel", "legacy.xls")).toBe(null);
    expect(renditionKind("application/octet-stream", "archive.zip")).toBe(null);
  });
});

describe("renderRendition docx", () => {
  it("converts paragraphs to a self-contained HTML document", async () => {
    const html = await renderRendition(
      "docx",
      await makeDocx(["Trial Management Plan", "Scope and responsibilities."]),
    );
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("Trial Management Plan");
    expect(html).toContain("Scope and responsibilities.");
  });

  it("escapes markup smuggled in document text", async () => {
    const html = await renderRendition(
      "docx",
      await makeDocx(['<script>alert("x")</script>', "<img src=x onerror=y>"]),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects bytes that are not a docx", async () => {
    await expect(
      renderRendition("docx", new TextEncoder().encode("not a zip").buffer),
    ).rejects.toThrow();
  });
});

describe("renderRendition xlsx", () => {
  it("renders every sheet as a named table", async () => {
    const html = await renderRendition(
      "xlsx",
      await makeXlsx([
        {
          name: "Enrollment",
          rows: [
            ["Subject", "Enrolled"],
            ["001-014", "2026-05-02"],
          ],
        },
        { name: "Notes", rows: [["Follow-up in June"]] },
      ]),
    );
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<h2>Enrollment</h2>");
    expect(html).toContain("<h2>Notes</h2>");
    expect(html).toContain("<td>001-014</td>");
    expect(html).toContain("<td>Follow-up in June</td>");
  });

  it("escapes markup smuggled in cells and sheet names", async () => {
    const html = await renderRendition(
      "xlsx",
      await makeXlsx([
        { name: "a<b>c", rows: [['<script>alert("x")</script>', 'quote"and&amp']] },
      ]),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<h2>a&lt;b&gt;c</h2>");
  });

  it("reads shared-string workbooks (how Excel itself writes strings)", async () => {
    const html = await renderRendition(
      "xlsx",
      await makeXlsx(
        [{ name: "Ranges", rows: [["Analyte", "Low"], ["Hemoglobin<i>", 13.5]] }],
        { useSharedStrings: true },
      ),
    );
    expect(html).toContain("<td>Analyte</td>");
    expect(html).toContain("<td>Hemoglobin&lt;i&gt;</td>");
    expect(html).toContain("<td>13.5</td>");
  });

  it("caps huge sheets and says so", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => [`row ${i + 1}`]);
    const html = await renderRendition("xlsx", await makeXlsx([{ name: "Big", rows }]));
    expect(html).toContain("<td>row 200</td>");
    expect(html).not.toContain("<td>row 201</td>");
    expect(html).toContain("first 200 rows");
  });
});
