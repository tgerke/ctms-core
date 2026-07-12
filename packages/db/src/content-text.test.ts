import { describe, expect, it } from "vitest";
import { extractContentText } from "./content-text.js";
import { makePdf } from "./seed/pdf.js";

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
