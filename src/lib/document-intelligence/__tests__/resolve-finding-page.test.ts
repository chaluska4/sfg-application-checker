import { describe, it, expect } from "vitest";
import {
  PACKET_LEVEL_LABEL,
  formatPageLabel,
  resolveFindingPage,
} from "../resolve-finding-page";
import type { DocumentPacket, ValidationRule } from "../types";

function emptyPacket(pages: { pageNumber: number; text?: string }[]): DocumentPacket {
  return {
    fileName: "test.pdf",
    pageCount: pages.length,
    extractionMode: "embedded_text",
    hasEmbeddedText: true,
    fullText: pages.map((p) => p.text ?? "").join("\n"),
    pages: pages.map((p) => ({
      pageNumber: p.pageNumber,
      rawText: p.text ?? "",
      normalizedText: (p.text ?? "").toLowerCase(),
      charCount: (p.text ?? "").length,
      hasEmbeddedText: (p.text ?? "").length >= 20,
      classification: "unknown",
      classificationConfidence: "low",
    })),
    checkboxes: [],
    signatures: [],
    dates: [],
    values: [],
    flags: {
      replacementSelected: false,
      transferSelected: false,
      sourceOfFundsOther: false,
    },
  };
}

describe("resolveFindingPage", () => {
  it("formats packet-level label", () => {
    expect(formatPageLabel(null)).toBe(PACKET_LEVEL_LABEL);
    expect(formatPageLabel(7)).toBe("Page 7");
  });

  it("resolves label pattern to the correct page", () => {
    const packet = emptyPacket([
      { pageNumber: 1, text: "Cover" },
      { pageNumber: 2, text: "Individual Annuity Application Owner Information" },
    ]);
    const rule: ValidationRule = {
      id: "owner-info",
      section: "Owner",
      label: "Owner",
      severity: "required",
      kind: "label_value",
      labelPatterns: [/owner information/i],
      pageTypes: ["application_page_1"],
    };

    const resolved = resolveFindingPage(rule, packet);
    expect(resolved.page).toBe(2);
    expect(resolved.pageLabel).toBe("Page 2");
  });

  it("falls back to packet-level when page is unknown", () => {
    const packet = emptyPacket([{ pageNumber: 1, text: "Generic memo" }]);
    const rule: ValidationRule = {
      id: "allocation-page",
      section: "Allocation",
      label: "Allocation Form",
      severity: "required",
      kind: "page_type",
      pageTypes: ["initial_premium_allocation"],
    };

    const resolved = resolveFindingPage(rule, packet);
    expect(resolved.page).toBeNull();
    expect(resolved.pageLabel).toBe(PACKET_LEVEL_LABEL);
  });
});
