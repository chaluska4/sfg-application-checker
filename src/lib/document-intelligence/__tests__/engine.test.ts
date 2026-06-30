import { describe, it, expect } from "vitest";
import { classifyPage, hasPageType } from "../classify-pages";
import { extractDateMatches, hasDateNearLabels } from "../detect-dates";
import { detectSignatures } from "../detect-signatures";
import { detectCheckboxes, isCheckboxChecked } from "../detect-checkboxes";
import {
  computeAllocationTotal,
  extractKnownValues,
  hasSsnPresent,
} from "../extract-known-values";
import { validatePacketLogic } from "./test-helpers";
import {
  fillablePacketText,
  mixedEsignPacketText,
  replacementCaseText,
  transferCaseText,
} from "./fixtures/sample-text";
import type { PageAnalysis } from "../types";

function mockPage(text: string, pageNumber = 1): PageAnalysis {
  const normalized = text.toLowerCase();
  const { classification, confidence } = classifyPage(normalized, pageNumber);
  return {
    pageNumber,
    rawText: text,
    normalizedText: normalized,
    charCount: text.length,
    hasEmbeddedText: text.trim().length >= 20,
    classification,
    classificationConfidence: confidence,
  };
}

describe("page classification", () => {
  it("classifies application page 1", () => {
    const { classification } = classifyPage(
      "individual annuity application owner information annuitant",
      1
    );
    expect(classification).toBe("application_page_1");
  });

  it("classifies replacement notice", () => {
    const { classification } = classifyPage("replacement notice existing coverage", 5);
    expect(classification).toBe("replacement_notice");
  });

  it("detects page types in packet", () => {
    const pages = [mockPage(fillablePacketText, 1)];
    expect(hasPageType(pages, "application_page_1")).toBe(true);
  });
});

describe("date detection", () => {
  it("finds dates near labels", () => {
    const result = hasDateNearLabels("Owner Signature Date 03/15/2026");
    expect(result.present).toBe(true);
  });

  it("extracts date matches when signatureOnly is false", () => {
    expect(extractDateMatches("Signed 01/02/2026", false)).toContain("01/02/2026");
  });
});

describe("signature detection", () => {
  it("detects eSigned owner signature", () => {
    const pages = [mockPage("Owner Signature eSigned Signed By John Smith")];
    const sigs = detectSignatures(pages);
    expect(sigs.some((s) => s.label === "owner_signature" && s.signed)).toBe(true);
    expect(sigs.find((s) => s.signerPreview)?.signerPreview).not.toMatch(/John Smith/);
  });
});

describe("checkbox inference", () => {
  it("detects replacement yes", () => {
    const pages = [mockPage("Replacement existing coverage Yes [X]")];
    const boxes = detectCheckboxes(pages);
    expect(isCheckboxChecked(boxes, "replacement")).toBe(true);
  });
});

describe("allocation total", () => {
  const allocationTable = `
INITIAL PREMIUM ALLOCATION - REQUIRED
Fixed Account 40%
S&P Index 35%
Global Index 25%
Total 100%
`;

  it("equals 100 when allocation table percentages sum to 100", () => {
    expect(computeAllocationTotal(allocationTable)).toBe(100);
  });

  it("fails when allocation table does not total 100", () => {
    const partial = `
INITIAL PREMIUM ALLOCATION - REQUIRED
Fund A 50%
Fund B 30%
`;
    expect(computeAllocationTotal(partial)).toBe(80);
  });
});

describe("PII safety", () => {
  it("masks SSN preview only", () => {
    const pages = [mockPage("Owner Social Security Number 123-45-6789")];
    const values = extractKnownValues(pages, pages[0].rawText);
    const ssn = values.find((v) => v.key === "owner_ssn");
    expect(ssn?.present).toBe(true);
    expect(ssn?.maskedPreview).toBe("***-**-6789");
    expect(JSON.stringify(values)).not.toContain("123-45-6789");
  });

  it("does not expose raw SSN in detection helper", () => {
    expect(hasSsnPresent("123-45-6789")).toBe(true);
  });
});

describe("conditional rules", () => {
  it("requires replacement forms when replacement selected", () => {
    const items = validatePacketLogic(replacementCaseText);
    const replacementNotice = items.find((i) => i.ruleId === "replacement-notice");
    expect(replacementNotice?.status).not.toBe("not_applicable");
  });

  it("requires transfer form when 1035 selected", () => {
    const items = validatePacketLogic(transferCaseText);
    const transfer = items.find((i) => i.ruleId === "transfer-form");
    expect(transfer?.status).not.toBe("not_applicable");
  });
});

describe("page number mapping", () => {
  it("maps findings to the page where label text appears in multi-page PDFs", () => {
    const pages = [
      mockPage("", 1),
      mockPage("Individual Annuity Application Owner Information Annuitant", 2),
      mockPage("Beneficiary Designation Tax Qualification Premium Payment", 3),
      mockPage("Replacement Notice existing coverage", 12),
    ];
    const items = validatePacketLogic(
      pages.map((p) => p.rawText).join("\n"),
      pages
    );

    const owner = items.find((i) => i.ruleId === "owner-info");
    const beneficiary = items.find((i) => i.ruleId === "beneficiary");
    const replacement = items.find((i) => i.ruleId === "replacement-notice");

    expect(owner?.page).toBe(2);
    expect(owner?.locationConfidence).toBe("actual");
    expect(owner?.actualPageLabel).toBe("Page 2");
    expect(owner?.pageLabel).toContain("Found on Page");
    expect(beneficiary?.page).toBe(3);
    expect(items.filter((i) => i.page === 1 && i.status !== "not_applicable").length).toBe(0);
    expect(replacement?.locationConfidence === "actual" ? replacement.page : replacement?.expectedPageLabel).toBeTruthy();
  });

  it("uses expected document guidance for a 34-page scanned packet", () => {
    const pages: PageAnalysis[] = Array.from({ length: 34 }, (_, index) => ({
      pageNumber: index + 1,
      rawText: "",
      normalizedText: "",
      charCount: 0,
      hasEmbeddedText: false,
      classification: "unknown" as const,
      classificationConfidence: "low" as const,
    }));

    const items = validatePacketLogic("", pages);
    const unreadable = items.filter((i) => i.status === "ocr_unreadable" || i.status === "low_confidence");
    expect(unreadable.length).toBeGreaterThan(0);
    expect(unreadable.every((i) => i.locationConfidence === "template")).toBe(true);
    expect(unreadable.every((i) => i.expectedDocument)).toBe(true);
    expect(unreadable.some((i) => i.pageLabel.includes("Unable to determine"))).toBe(true);
    expect(unreadable.every((i) => i.pageLabel !== "Packet-level review")).toBe(true);
  });

  it("does not display template page ranges as actual pages for scanned packets", () => {
    const pages: PageAnalysis[] = Array.from({ length: 34 }, (_, index) => ({
      pageNumber: index + 1,
      rawText: "",
      normalizedText: "",
      charCount: 0,
      hasEmbeddedText: false,
      classification: "unknown" as const,
      classificationConfidence: "low" as const,
    }));

    const items = validatePacketLogic("", pages);
    const owner = items.find((i) => i.ruleId === "owner-info");
    expect(owner?.actualPage).toBeNull();
    expect(owner?.expectedPageLabel).toBe("Expected Page 2");
    expect(owner?.pageLabel).not.toContain("Actual Page");
  });

  it("labels approximate locations after page 14 as Typical Page Range", () => {
    const pages: PageAnalysis[] = Array.from({ length: 34 }, (_, index) => ({
      pageNumber: index + 1,
      rawText: "",
      normalizedText: "",
      charCount: 0,
      hasEmbeddedText: false,
      classification: "unknown" as const,
      classificationConfidence: "low" as const,
    }));

    const items = validatePacketLogic(transferCaseText, pages);
    const transfer = items.find((i) => i.ruleId === "packet-form-transfer");
    expect(transfer?.status).not.toBe("not_applicable");
    expect(transfer?.expectedPageLabel).toBe("Typical Page Range 15-18");
    expect(transfer?.expectedPageLabel).toContain("Typical");
    expect(transfer?.actualPage).toBeNull();
    expect(transfer?.pageLabel).not.toContain("Actual Page");
  });

  it("uses template guidance when embedded text cannot identify allocation page", () => {
    const pages = [mockPage("Unrelated cover memo only", 1)];
    const items = validatePacketLogic(pages[0].rawText, pages);
    const allocationPage = items.find((i) => i.ruleId === "allocation-page");
    expect(allocationPage?.page).toBeNull();
    expect(allocationPage?.locationConfidence).toBe("template");
    expect(allocationPage?.expectedPageLabel).toBe("Expected Page 9");
    expect(allocationPage?.pageLabel).toContain("Unable to determine");
  });
});

describe("scanned PDF behavior", () => {
  it("marks items ocr_unreadable not missing for image-only without text", () => {
    const pages: PageAnalysis[] = [
      {
        pageNumber: 1,
        rawText: "",
        normalizedText: "",
        charCount: 0,
        hasEmbeddedText: false,
        classification: "unknown",
        classificationConfidence: "low",
      },
    ];
    const items = validatePacketLogic("", pages);
    const missingOnlyBecauseNoFields = items.filter((i) => i.status === "missing");
    expect(missingOnlyBecauseNoFields.length).toBe(0);
    expect(items.some((i) => i.status === "ocr_unreadable")).toBe(true);
  });
});

describe("mixed equitrust packet", () => {
  it("processes without marking everything missing", () => {
    const items = validatePacketLogic(mixedEsignPacketText);
    const present = items.filter((i) => i.status === "present");
    expect(present.length).toBeGreaterThan(0);
  });
});
