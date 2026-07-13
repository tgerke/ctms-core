import ExcelJS from "exceljs";
import JSZip from "jszip";

/**
 * Minimal but real office files, like pdf.ts's makePdf: seeded office-format
 * documents exercise the in-browser renditions (ADR-0030) and open fine in
 * Word/Excel. The docx is the smallest package the format allows — content
 * types, the package relationship, one document part.
 */

const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function makeDocx(paragraphs: string[]): Promise<Buffer> {
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
    .map(
      (p, i) =>
        `<w:p>${i === 0 ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ""}<w:r><w:t xml:space="preserve">${xmlEsc(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function makeXlsx(
  sheet: { name: string; rows: (string | number)[][] },
  aboutLines: string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet(sheet.name).addRows(sheet.rows);
  workbook.addWorksheet("About this file").addRows(aboutLines.map((l) => [l]));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
