import { describe, it, expect } from "vitest";
import {
  buildDocumentIntelligenceNotice,
  isRedundantFindingMessage,
  shouldShowStandaloneDisclaimer,
} from "../review-display";
import type { ReviewResult } from "@/lib/validation/types";

function mockResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    formName: "Test Form",
    fileName: "test.pdf",
    completionScore: 0,
    status: "manual-review",
    statusLabel: "Manual Review Needed",
    extractionMode: "image_only",
    hasEmbeddedText: false,
    pageCount: 34,
    disclaimer:
      "Automated review supports manual due diligence. Final submission readiness must be confirmed by an authorized SFG reviewer.",
    summary: {
      present: 0,
      missing: 0,
      incomplete: 0,
      needsManualVerification: 0,
      conditionalReview: 0,
      lowConfidence: 10,
      ocrUnreadable: 0,
      notApplicable: 0,
      total: 10,
    },
    items: [],
    groupedItems: [],
    ...overrides,
  };
}

describe("review-display", () => {
  it("identifies redundant scanned-packet finding messages", () => {
    expect(
      isRedundantFindingMessage(
        "Image-only or low-confidence extraction. 34-page scanned packet — verify using Expected Location: Individual Annuity Application (ICC19-ET-APP), Expected Page 2. Manual verification required — not marked missing."
      )
    ).toBe(true);
    expect(isRedundantFindingMessage("Allocation total is 80%, expected 100%.")).toBe(false);
    expect(isRedundantFindingMessage(undefined)).toBe(true);
  });

  it("builds a consolidated intelligence notice for scanned packets", () => {
    const notice = buildDocumentIntelligenceNotice(mockResult());
    expect(notice).toContain("Scanned packet reviewed from OCR evidence");
    expect(notice).toContain("34-page packet");
    expect(notice).toContain("LOW_CONFIDENCE");
    expect(notice).toContain("Automated review supports manual due diligence");
    expect(notice).toContain("authorized SFG reviewer");
  });

  it("shows standalone disclaimer only for embedded-text packets", () => {
    expect(shouldShowStandaloneDisclaimer("embedded_text")).toBe(true);
    expect(shouldShowStandaloneDisclaimer("image_only")).toBe(false);
    expect(shouldShowStandaloneDisclaimer("mixed")).toBe(false);
  });
});
