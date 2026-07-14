import { describe, expect, it } from "vitest";
import { createOcr, extractContentText } from "./content-text.js";
import { makePdf, makeScannedPdf } from "./seed/pdf.js";

/**
 * Extraction contract (ADR-0022): PDFs and text yield normalized text,
 * anything else is recorded as unsupported, and malformed input is recorded
 * as failed — never thrown, because extraction must not block an upload.
 */

describe("extractContentText (ADR-0022)", () => {
  it("extracts the text of a PDF", async () => {
    const pdf = makePdf(["Clinical Monitoring Plan", "Temperature excursion procedures"]);
    const res = await extractContentText(new Uint8Array(pdf), "application/pdf");
    expect(res.status).toBe("extracted");
    expect(res.content).toContain("Temperature excursion procedures");
    expect(res.extractor).toBe("unpdf");
  });

  it("passes text/* through with whitespace normalized", async () => {
    const bytes = new TextEncoder().encode("line one\n\n  line   two\t");
    const res = await extractContentText(bytes, "text/plain; charset=utf-8");
    expect(res.status).toBe("extracted");
    expect(res.content).toBe("line one line two");
    expect(res.extractor).toBe("utf-8");
  });

  it("records other mime types as unsupported", async () => {
    const res = await extractContentText(new Uint8Array([1, 2, 3]), "image/png");
    expect(res).toEqual({ status: "unsupported", content: null, extractor: null });
  });

  it("records malformed PDF bytes as failed, without throwing", async () => {
    const bytes = new TextEncoder().encode("not a pdf at all");
    const res = await extractContentText(bytes, "application/pdf");
    expect(res).toEqual({ status: "failed", content: null, extractor: null });
  });
});

/**
 * OCR contract (ADR-0031): a scanned image-only PDF has an empty text layer,
 * and the OCR pass recovers what exists only as pixels. Slowest test in the
 * suite; the first run on a machine also downloads the eng traineddata.
 */
describe("OCR of image-only PDFs (ADR-0031)", () => {
  it("recovers text that exists only as pixels", async () => {
    const pdf = makeScannedPdf([
      "Monitoring Visit Follow-up Letter",
      "Temperature excursion resolved for kit 88-A.",
    ]);
    const layer = await extractContentText(new Uint8Array(pdf), "application/pdf");
    expect(layer.status).toBe("extracted");
    expect(layer.content).toBe("");

    const ocr = await createOcr();
    try {
      const text = await ocr.recognizePdf(new Uint8Array(pdf));
      expect(text).toContain("Temperature excursion resolved");
    } finally {
      await ocr.close();
    }
  }, 120_000);
});
