import { describe, expect, it } from "vitest";
import type { PageAnalysis } from "../types";
import {
  PACKET_FORMS_SECTION,
  buildPacketFormsReviewItems,
} from "../packet-forms-review";
import { validatePacketLogic } from "./test-helpers";

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

describe("packet forms review", () => {
  it("includes later-page form guidance for a 34-page scanned packet", () => {
    const pages: PageAnalysis[] = Array.from({ length: 34 }, (_, index) =>
      emptyScannedPage(index + 1)
    );

    const items = validatePacketLogic("", pages);
    const packetForms = items.filter((i) => i.section === PACKET_FORMS_SECTION);

    expect(packetForms.length).toBeGreaterThanOrEqual(8);

    const transfer = packetForms.find((i) => i.ruleId === "packet-form-transfer");
    const replacement = packetForms.find((i) => i.ruleId === "packet-form-replacement-notice");
    const comparison = packetForms.find((i) => i.ruleId === "packet-form-disclosure-comparison");
    const electronic = packetForms.find((i) => i.ruleId === "packet-form-electronic-transactions");
    const privacy = packetForms.find((i) => i.ruleId === "packet-form-privacy-notice");
    const fax = packetForms.find((i) => i.ruleId === "packet-form-fax-confirmation");

    expect(transfer?.status).toBe("conditional_review");
    expect(replacement?.status).toBe("conditional_review");
    expect(comparison?.status).toBe("conditional_review");
    expect(electronic?.status).toBe("needs_manual_verification");
    expect(privacy?.status).toBe("needs_manual_verification");
    expect(fax?.status).toBe("needs_manual_verification");

    expect(transfer?.expectedPageLabel).toBe("Typical Page Range 15-18");
    expect(replacement?.expectedPageLabel).toBe("Typical Page Range 19-22");
    expect(comparison?.expectedPageLabel).toBe("Typical Page Range 23-26");
    expect(electronic?.expectedPageLabel).toBe("Typical Page Range 28");
    expect(fax?.expectedPageLabel).toBe("Typical Page Range 34");

    expect(transfer?.actualPage).toBeNull();
    expect(packetForms.every((i) => i.status !== "missing")).toBe(true);
    expect(packetForms.every((i) => i.locationConfidence === "template")).toBe(true);
  });

  it("does not duplicate superseded conditional rules in the main sections", () => {
    const pages: PageAnalysis[] = Array.from({ length: 34 }, (_, index) =>
      emptyScannedPage(index + 1)
    );

    const items = validatePacketLogic("", pages);
    expect(items.find((i) => i.ruleId === "transfer-form")).toBeUndefined();
    expect(items.find((i) => i.ruleId === "replacement-notice")).toBeUndefined();
    expect(items.find((i) => i.ruleId === "disclosure-comparison")).toBeUndefined();
  });

  it("omits packet forms review for fully embedded-text packets", () => {
    const items = validatePacketLogic("short text without triggers");
    const packetForms = items.filter((i) => i.section === PACKET_FORMS_SECTION);
    expect(packetForms.length).toBe(0);
  });

  it("uses conditional review when replacement trigger is unreadable on scanned packets", () => {
    const pages = [emptyScannedPage(1)];
    const items = buildPacketFormsReviewItems({
      fileName: "scan.pdf",
      pageCount: 1,
      extractionMode: "image_only",
      hasEmbeddedText: false,
      pages,
      fullText: "",
      checkboxes: [],
      signatures: [],
      dates: [],
      values: [],
      flags: {
        replacementSelected: false,
        transferSelected: false,
        sourceOfFundsOther: false,
      },
    });

    const replacement = items.find((i) => i.ruleId === "packet-form-replacement-notice");
    expect(replacement?.status).toBe("conditional_review");
    expect(replacement?.isConditional).toBe(true);
  });
});
