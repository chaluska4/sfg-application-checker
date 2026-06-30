import { describe, it, expect } from "vitest";
import type { ValidationResultItem } from "@/lib/validation/types";
import {
  getFindingHighlightsForPage,
  getFindingTargetPage,
} from "@/lib/pdf-evidence-viewer";

function item(overrides: Partial<ValidationResultItem>): ValidationResultItem {
  return {
    ruleId: "test",
    label: "Test",
    section: "Section",
    documentType: "application_page_1",
    status: "present",
    severity: "required",
    confidence: "high",
    isConditional: false,
    actualPage: null,
    actualPageLabel: null,
    expectedDocument: null,
    typicalLocation: null,
    typicalPageRange: null,
    locationConfidence: "template",
    manualReviewHint: null,
    expectedPageLabel: null,
    page: null,
    pageLabel: "Not Found",
    ...overrides,
  };
}

describe("pdf-evidence-viewer helpers", () => {
  it("prefers actualPage over deprecated page", () => {
    expect(getFindingTargetPage(item({ actualPage: 4, page: 2 }))).toBe(4);
  });

  it("falls back to page when actualPage is null", () => {
    expect(getFindingTargetPage(item({ page: 3 }))).toBe(3);
  });

  it("returns highlight regions for matching page", () => {
    const highlights = getFindingHighlightsForPage(
      item({
        highlightRegions: [
          {
            pageNumber: 2,
            label: "locate_field",
            boundingBox: { page: 2, x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
          },
        ],
      }),
      2
    );
    expect(highlights).toHaveLength(1);
  });

  it("uses boundingBox when highlightRegions are absent", () => {
    const highlights = getFindingHighlightsForPage(
      item({
        boundingBox: { page: 5, x: 0.2, y: 0.3, width: 0.1, height: 0.1 },
      }),
      5
    );
    expect(highlights).toHaveLength(1);
    expect(highlights[0].label).toBe("Test");
  });
});
