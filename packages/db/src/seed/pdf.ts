import { createCanvas } from "@napi-rs/canvas";

/** Minimal single-page PDF so seeded documents are real, openable files. */
export function makePdf(lines: string[]): Buffer {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "";
  lines.forEach((line, i) => {
    const size = i === 0 ? 16 : 11;
    const y = 720 - i * 26;
    content += `BT /F1 ${size} Tf 72 ${y} Td (${esc(line)}) Tj ET\n`;
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/**
 * Single-page image-only PDF — a "scanned" document (ADR-0031). The lines are
 * rasterized onto a canvas and embedded as a JPEG, so the PDF has no text
 * layer at all: pdf.js extraction yields nothing and only OCR can read it.
 */
export function makeScannedPdf(lines: string[]): Buffer {
  // 612x792pt letter page at 2x, so OCR sees ~144 dpi.
  const W = 1224;
  const H = 1584;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f6f4ef"; // paper, not screen-white
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#222222";
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? "bold 34px sans-serif" : "26px sans-serif";
    ctx.fillText(line, 144, 180 + i * 58);
  });
  const jpeg = canvas.toBuffer("image/jpeg", 90);

  const content = "q 612 0 0 792 0 0 cm /Im1 Do Q\n";
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}endstream`),
  ];

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let pos = parts[0]!.length;
  objects.forEach((body, i) => {
    offsets.push(pos);
    const head = Buffer.from(`${i + 1} 0 obj\n`);
    const tail = Buffer.from("\nendobj\n");
    parts.push(head, body, tail);
    pos += head.length + body.length + tail.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}
