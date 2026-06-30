import { describe, it, expect } from "vitest";
import {
  formatExpectedPageLabel,
  PACKET_LEVEL_LABEL,
  resolveFindingLocation,
} from "../resolve-finding-page";
import type { DocumentPacket, ValidationRule } from "../types";
import { getLocationForRule } from "../templates/equitrust-template-metadata";

function emptyPacket(pages: { pageNumber: number; text?: string }[]): DocumentPacket {
  return {
    fileName: "test.pdf",
    pageCount: pages.length,
    extractionMode: "embedded_text",
    hasEmbeddedText: pages.some((p) => (p.text ?? "").trim().length >= 20),
    fullText: pages.map((p) => p.text ?? "").join("\n"),
    pages: pages.map((p) => ({
      pageNumber: p.pageNumber,
      rawText: p.text ?? "",
      normalizedText: (p.text ?? "").toLowerCase(),
      charCount: (p.text ?? "").length,
      hasEmbeddedText: (p.text ?? "").trim().length >= 20,
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

describe("resolveFindingLocation", () => {
  const ownerRule: ValidationRule = {
    id: "owner-info",
    locationKey: "ownerInformation",
    section: "Owner",
    label: "Owner",
    severity: "required",
    kind: "label_value",
    labelPatterns: [/owner information/i],
    pageTypes: ["application_page_1"],
  };

  it("prefers actual page evidence over template guidance", () => {
    const packet = emptyPacket([
      { pageNumber: 1, text: "Cover" },
      { pageNumber: 2, text: "Individual Annuity Application Owner Information complete" },
    ]);

    const location = resolveFindingLocation(ownerRule, packet, { valuePage: 2 });
    expect(location.locationConfidence).toBe("actual");
    expect(location.actualPage).toBe(2);
    expect(location.actualPageLabel).toBe("Page 2");
    expect(location.pageLabel).toContain("Found on Page");
    expect(location.expectedPageLabel).toBeNull();
  });

  it("uses template guidance when actual page is unknown", () => {
    const packet = emptyPacket(
      Array.from({ length: 34 }, (_, i) => ({ pageNumber: i + 1, text: "" }))
    );
    packet.extractionMode = "image_only";
    packet.hasEmbeddedText = false;

    const location = resolveFindingLocation(ownerRule, packet);
    expect(location.locationConfidence).toBe("template");
    expect(location.actualPage).toBeNull();
    expect(location.expectedDocument).toContain("Individual Annuity Application");
    expect(location.expectedPageLabel).toBe("Expected Page 2");
    expect(location.pageLabel).toContain("Expected Location");
    expect(location.manualReviewHint).toBeTruthy();
  });

  it("labels approximate template ranges as Typical Page Range", () => {
    const transferRule: ValidationRule = {
      id: "transfer-form",
      section: "Transfer",
      label: "Transfer",
      severity: "required",
      kind: "page_type",
      pageTypes: ["transfer_1035_form"],
    };
    const template = getLocationForRule("transfer-form");
    expect(template?.pageConfidence).toBe("approximate");
    expect(formatExpectedPageLabel(template!)).toBe("Typical Page Range 15-18");

    const packet = emptyPacket(Array.from({ length: 34 }, (_, i) => ({ pageNumber: i + 1, text: "" })));
    const location = resolveFindingLocation(transferRule, packet);
    expect(location.expectedPageLabel).toBe("Typical Page Range 15-18");
    expect(location.expectedPageLabel).not.toContain("Actual Page");
  });

  it("falls back to packet-level when no template guidance exists", () => {
    const unknownRule: ValidationRule = {
      id: "unknown-rule",
      section: "Other",
      label: "Unknown",
      severity: "required",
      kind: "label_value",
    };
    const location = resolveFindingLocation(unknownRule, emptyPacket([{ pageNumber: 1, text: "memo" }]));
    expect(location.locationConfidence).toBe("packet");
    expect(location.pageLabel).toBe(PACKET_LEVEL_LABEL);
  });
});
