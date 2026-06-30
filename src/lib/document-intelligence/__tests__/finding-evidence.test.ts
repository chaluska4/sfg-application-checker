import { describe, expect, it } from "vitest";
import {
  evaluateFieldWithEvidence,
  maskEvidenceSnippet,
  searchOcrSnippetNearLabel,
  packetHasUsableText,
} from "../finding-evidence";
import { detectCheckboxes } from "../detect-checkboxes";
import { detectSignatures } from "../detect-signatures";
import { classifyPage } from "../classify-pages";
import type { DocumentPacket, PageAnalysis, ValidationRule } from "../types";

function basePacket(pages: PageAnalysis[], overrides: Partial<DocumentPacket> = {}): DocumentPacket {
  return {
    fileName: "test.pdf",
    pageCount: pages.length,
    extractionMode: "embedded_text",
    hasEmbeddedText: pages.some((p) => p.hasEmbeddedText),
    hasOcrText: pages.some((p) => p.hasOcrText),
    pages,
    fullText: pages.map((p) => p.rawText).join("\n"),
    checkboxes: detectCheckboxes(pages),
    signatures: detectSignatures(pages),
    dates: [],
    values: [],
    flags: {
      replacementSelected: false,
      transferSelected: false,
      sourceOfFundsOther: false,
    },
    ...overrides,
  };
}

function mockPage(text: string, pageNumber = 1, ocr = false): PageAnalysis {
  const normalized = text.toLowerCase();
  const { classification, confidence } = classifyPage(normalized, pageNumber);
  return {
    pageNumber,
    rawText: text,
    normalizedText: normalized,
    charCount: text.length,
    hasEmbeddedText: !ocr && text.trim().length >= 20,
    hasOcrText: ocr,
    textSource: ocr ? "ocr" : text.trim().length >= 20 ? "embedded" : "none",
    classification,
    classificationConfidence: confidence,
    ocrLines: ocr ? [{ text, confidence: "medium" }] : undefined,
  };
}

describe("page type detection", () => {
  it("detects Individual Annuity Application from OCR text", () => {
    const page = mockPage("Individual Annuity Application Owner Information", 2, true);
    const rule: ValidationRule = {
      id: "app-page",
      section: "Application",
      label: "Application Page 1",
      severity: "required",
      kind: "page_type",
      pageTypes: ["application_page_1"],
    };
    const result = evaluateFieldWithEvidence(rule, basePacket([page]));
    expect(result.status).toBe("present");
    expect(result.disposition).toBe("found_complete");
    expect(result.detectedFormName).toContain("Individual Annuity Application");
  });

  it("detects replacement notice page", () => {
    const page = mockPage("Replacement Notice existing coverage", 5);
    const { classification } = classifyPage(page.normalizedText, 5);
    expect(classification).toBe("replacement_notice");
  });
});

describe("field matching by OCR text", () => {
  it("marks present when label and value appear near each other", () => {
    const page = mockPage("Owner Information First Name John Last Name Smith", 2, true);
    const rule: ValidationRule = {
      id: "owner-info",
      section: "Owner",
      label: "Owner name",
      severity: "required",
      kind: "label_value",
      labelPatterns: [/owner information/i],
      valuePatterns: [/first name|last name/i],
    };
    const snippet = searchOcrSnippetNearLabel(page, rule.labelPatterns, rule.valuePatterns);
    expect(snippet?.snippet).toBeTruthy();
    const result = evaluateFieldWithEvidence(rule, basePacket([page]));
    expect(["present", "incomplete"]).toContain(result.status);
  });

  it("masks SSN in evidence snippets", () => {
    const masked = maskEvidenceSnippet("Social Security Number 123-45-6789");
    expect(masked).toContain("[redacted]");
    expect(masked).not.toContain("123-45-6789");
  });
});

describe("checkbox and selection mark mapping", () => {
  it("uses Azure selection marks when available", () => {
    const page: PageAnalysis = {
      ...mockPage("Replacement existing coverage Yes No", 4, true),
      ocrSelectionMarks: [{ state: "selected", confidence: "high" }],
    };
    const boxes = detectCheckboxes([page]);
    expect(boxes.find((b) => b.label === "replacement")?.checked).toBe(true);
    expect(boxes.find((b) => b.label === "replacement")?.source).toBe("selection_mark");
  });
});

describe("conservative missing vs low confidence", () => {
  it("does not mark missing when OCR cannot locate section", () => {
    const pages = Array.from({ length: 5 }, (_, i) => mockPage("", i + 1));
    const rule: ValidationRule = {
      id: "owner-info",
      section: "Owner",
      label: "Owner name",
      severity: "required",
      kind: "label_value",
      labelPatterns: [/owner information/i],
    };
    const result = evaluateFieldWithEvidence(rule, basePacket(pages));
    expect(result.status).not.toBe("missing");
    expect(["ocr_unreadable", "low_confidence"]).toContain(result.status);
    expect(result.disposition).toBe("unable_to_determine");
  });

  it("marks incomplete when section label found but value missing", () => {
    const page = mockPage("Owner Information section with no name values present", 2);
    const rule: ValidationRule = {
      id: "owner-info",
      section: "Owner",
      label: "Owner name",
      severity: "required",
      kind: "label_value",
      labelPatterns: [/owner information/i],
      valuePatterns: [/first name/i],
    };
    const result = evaluateFieldWithEvidence(rule, basePacket([page]));
    expect(result.status).toBe("incomplete");
    expect(result.disposition).toBe("found_incomplete");
  });

  it("marks missing only with positive evidence of absent value", () => {
    const page = mockPage("Owner Signature _________________________", 3);
    const rule: ValidationRule = {
      id: "owner-signature",
      section: "Signatures",
      label: "Owner signature",
      severity: "required",
      kind: "signature",
      signatureLabel: "owner_signature",
      pageTypes: ["application_page_3_signatures"],
      labelPatterns: [/owner.?s signature/i],
    };
    const packet = basePacket([page]);
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(result.status).toBe("missing");
    expect(result.disposition).toBe("not_found");
  });
});

describe("conditional and unreadable fallbacks", () => {
  it("reports ocr_unreadable when packet has no usable text", () => {
    const pages = [{ ...mockPage("", 1), hasEmbeddedText: false, hasOcrText: false }];
    expect(packetHasUsableText(basePacket(pages))).toBe(false);
    const rule: ValidationRule = {
      id: "owner-info",
      section: "Owner",
      label: "Owner",
      severity: "required",
      kind: "label_value",
    };
    const result = evaluateFieldWithEvidence(rule, basePacket(pages));
    expect(result.status).toBe("ocr_unreadable");
  });

  it("uses low_confidence when text exists but section not found", () => {
    const page = mockPage("Unrelated memo cover sheet only", 1);
    const rule: ValidationRule = {
      id: "owner-info",
      section: "Owner",
      label: "Owner",
      severity: "required",
      kind: "label_value",
      labelPatterns: [/owner information/i],
    };
    const result = evaluateFieldWithEvidence(rule, basePacket([page]));
    expect(result.status).toBe("low_confidence");
  });
});
