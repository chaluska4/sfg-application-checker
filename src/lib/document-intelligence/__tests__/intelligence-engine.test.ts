import { describe, it, expect } from "vitest";
import { applyPageClassification } from "../page-classification";
import { classifyPageHierarchical } from "../hierarchical-classifier";
import { runScopedSearch } from "../scoped-validation";
import { computeEvidenceScore } from "../evidence-scorer";
import { enrichPageWithClassification } from "../classify-pages";
import type { PageAnalysis } from "../types";

function pageFromText(text: string, pageNumber = 1): PageAnalysis {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return enrichPageWithClassification(
    {
      pageNumber,
      rawText: text,
      normalizedText: normalized,
      charCount: text.length,
      hasEmbeddedText: text.length >= 20,
      textSource: "embedded",
    },
    normalized
  );
}

describe("hierarchical page classification", () => {
  it("classifies application owner info with multiple indicators", () => {
    const result = classifyPageHierarchical(
      "individual annuity application owner information section a annuitant name"
    );
    expect(result.documentType).toBe("individual_application");
    expect(result.pageSubtype).toBe("owner_info");
    expect(result.matchedIndicators.length).toBeGreaterThan(1);
    expect(result.isIgnored).toBe(false);
  });

  it("classifies administrative fax confirmation as ignored", () => {
    const result = classifyPageHierarchical("fax confirmation transmittal cover sheet");
    expect(result.documentType).toBe("administrative");
    expect(result.isIgnored).toBe(true);
  });

  it("does not classify transfer page as application", () => {
    const result = applyPageClassification(
      "1035 exchange transfer request relinquishing company".toLowerCase()
    );
    expect(result.classification).toBe("transfer_1035_form");
    expect(result.documentType).toBe("transfer_1035");
  });

  it("classifies allocation table by required header", () => {
    const result = applyPageClassification(
      "initial premium allocation - required fixed account 40%".toLowerCase()
    );
    expect(result.documentType).toBe("initial_premium_allocation");
    expect(result.pageSubtype).toBe("allocation_table");
  });
});

describe("scoped validation", () => {
  it("locates signature section within application only", () => {
    const pages = [
      pageFromText("fax confirmation privacy notice", 1),
      pageFromText(
        "Individual Annuity Application Section I Owner Signature Date",
        2
      ),
    ];
    pages[0].isIgnored = true;

    const context = runScopedSearch(pages, {
      requiredDocument: "individual_application",
      expectedPageSubtype: "signatures",
      sectionPatterns: [/section i|owner.{0,30}signature/i],
    });

    expect(context.pageNumber).toBe(2);
    expect(context.stages[0]?.success).toBe(true);
    expect(context.stages.some((stage) => stage.stage === "locate_section" && stage.success)).toBe(
      true
    );
  });

  it("skips ignored administrative pages", () => {
    const pages = [pageFromText("privacy notice administrative only", 1)];
    pages[0].isIgnored = true;

    const context = runScopedSearch(pages, {
      requiredDocument: "individual_application",
    });

    expect(context.stages[0]?.success).toBe(false);
  });
});

describe("evidence scoring", () => {
  it("returns higher score when value evidence and scoped stages pass", () => {
    const high = computeEvidenceScore({
      ocrConfidence: "high",
      classificationConfidence: "high",
      classificationScore: 95,
      hasValueEvidence: true,
      hasSelectionMark: true,
      status: "present",
      scopedContext: {
        pageNumber: 3,
        stages: [
          { stage: "locate_document", success: true, detail: "doc" },
          { stage: "locate_section", success: true, detail: "section", snippet: "Owner Name John" },
          { stage: "validate_evidence", success: true, detail: "validated" },
        ],
      },
    });

    const low = computeEvidenceScore({
      ocrConfidence: "low",
      classificationConfidence: "low",
      status: "low_confidence",
    });

    expect(high.confidenceScore).toBeGreaterThan(80);
    expect(low.confidenceScore).toBeLessThan(70);
  });
});
