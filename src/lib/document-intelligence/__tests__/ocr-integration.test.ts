import { describe, expect, it } from "vitest";
import type { PageAnalysis } from "../types";
import { disabledOcrProvider } from "../ocr";
import { createMockOcrProvider, mockOcrBoundingBox } from "../ocr/mock-ocr-provider";
import { enrichPagesWithOcr } from "../ocr/enrich-pages-with-ocr";
import { validatePacketWithMockOcr } from "./test-helpers";
import { fillablePacketText } from "./fixtures/sample-text";

function emptyScannedPage(pageNumber: number): PageAnalysis {
  return {
    pageNumber,
    rawText: "",
    normalizedText: "",
    charCount: 0,
    hasEmbeddedText: false,
    textSource: "none",
    classification: "unknown",
    classificationConfidence: "low",
  };
}

describe("OCR integration", () => {
  it("keeps scanned-packet manual-review behavior when OCR is disabled", async () => {
    const pages = [emptyScannedPage(1), emptyScannedPage(2)];
    const enriched = await enrichPagesWithOcr(pages, "scan.pdf", disabledOcrProvider);
    expect(enriched.every((p) => !p.hasOcrText)).toBe(true);
    expect(enriched[0].rawText).toBe("");
  });

  it("feeds mocked OCR text into validation with actualPage, confidence, and boundingBox", async () => {
    const ownerLine = "Individual Annuity Application Owner Information First Name John Last Name Smith";
    const ownerBBox = mockOcrBoundingBox(2, { x: 0.15, y: 0.31, width: 0.5, height: 0.04 });

    const pages = [emptyScannedPage(1), emptyScannedPage(2), emptyScannedPage(3)];
    const items = await validatePacketWithMockOcr(pages, {
      pages: {
        2: {
          fullText: ownerLine,
          confidence: "medium",
          lines: [
            {
              text: ownerLine,
              confidence: "medium",
              boundingBox: ownerBBox,
            },
          ],
        },
      },
    });

    const owner = items.find((i) => i.ruleId === "owner-info");
    expect(owner?.actualPage).toBe(2);
    expect(owner?.locationConfidence).toBe("actual");
    expect(owner?.actualPageLabel).toBe("Page 2");
    expect(owner?.confidence).toBe("medium");
    expect(owner?.boundingBox).toEqual(ownerBBox);
    expect(owner?.expectedPageLabel).toBeNull();
    expect(owner?.pageLabel).toContain("Actual Page");
  });

  it("masks SSN from mocked OCR text in validation messages", async () => {
    const ssnLine = "Annuitant Social Security Number 123-45-6789";
    const pages = [emptyScannedPage(1), emptyScannedPage(2)];

    const items = await validatePacketWithMockOcr(pages, {
      pages: {
        2: {
          fullText: ssnLine,
          lines: [{ text: ssnLine, confidence: "high" }],
        },
      },
    });

    const ssn = items.find((i) => i.ruleId === "owner-ssn");
    expect(ssn?.message).toContain("***-**-6789");
    expect(ssn?.message).not.toContain("123-45-6789");
    expect(JSON.stringify(items)).not.toContain("123-45-6789");
  });

  it("falls back to expected location when OCR text cannot identify a page", async () => {
    const pages = Array.from({ length: 34 }, (_, index) => emptyScannedPage(index + 1));
    const items = await validatePacketWithMockOcr(pages, { pages: {} });

    const owner = items.find((i) => i.ruleId === "owner-info");
    expect(owner?.actualPage).toBeNull();
    expect(owner?.locationConfidence).toBe("template");
    expect(owner?.expectedPageLabel).toBe("Expected Page 2");
    expect(owner?.status).toBe("needs_manual_verification");
  });

  it("mock provider only OCRs pages without embedded text", async () => {
    const embedded: PageAnalysis = {
      pageNumber: 1,
      rawText: fillablePacketText,
      normalizedText: fillablePacketText.toLowerCase(),
      charCount: fillablePacketText.length,
      hasEmbeddedText: true,
      textSource: "embedded",
      classification: "application_page_1",
      classificationConfidence: "high",
    };
    const scanned = emptyScannedPage(2);

    const provider = createMockOcrProvider({
      pages: {
        2: { fullText: "OCR-only page text for beneficiary designation primary beneficiary" },
      },
    });

    const enriched = await enrichPagesWithOcr([embedded, scanned], "mixed.pdf", provider);
    expect(enriched[0].hasOcrText).toBeFalsy();
    expect(enriched[0].textSource).toBe("embedded");
    expect(enriched[1].hasOcrText).toBe(true);
    expect(enriched[1].rawText).toContain("beneficiary");
  });
});
