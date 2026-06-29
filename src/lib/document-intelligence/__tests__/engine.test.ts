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

  it("extracts date matches", () => {
    expect(extractDateMatches("Signed 01/02/2026")).toContain("01/02/2026");
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
  it("equals 100 when percentages sum to 100", () => {
    expect(computeAllocationTotal("Allocation 60% Fixed 40% Index")).toBe(100);
  });

  it("fails when not 100", () => {
    expect(computeAllocationTotal("50% 30%")).toBe(80);
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

describe("scanned PDF behavior", () => {
  it("marks items needs manual verification not missing for image-only", () => {
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
    expect(items.some((i) => i.status === "needs_manual_verification")).toBe(true);
  });
});

describe("mixed equitrust packet", () => {
  it("processes without marking everything missing", () => {
    const items = validatePacketLogic(mixedEsignPacketText);
    const present = items.filter((i) => i.status === "present");
    expect(present.length).toBeGreaterThan(0);
  });
});
