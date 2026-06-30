import { describe, it, expect } from "vitest";
import { applyPageClassification } from "../../page-classification";
import { validatePacketLogic } from "../test-helpers";
import {
  fillablePacketText,
  transferCaseText,
} from "../fixtures/sample-text";
import { equitrustMarketEarlyNjRules } from "../../templates/equitrust-marketearly-nj";
import type { PageAnalysis } from "../../types";
import { enrichPageWithClassification } from "../../classify-pages";

export interface RegressionPacketFixture {
  id: string;
  description: string;
  pages: { pageNumber: number; text: string }[];
  expectedClassifications: { pageNumber: number; documentType: string; isIgnored?: boolean }[];
  expectedFindings: { ruleId: string; status: string; minConfidence?: number }[];
}

function buildPages(
  fixture: RegressionPacketFixture["pages"]
): PageAnalysis[] {
  return fixture.map(({ pageNumber, text }) => {
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
  });
}

const REGRESSION_FIXTURES: RegressionPacketFixture[] = [
  {
    id: "fillable-complete",
    description: "Complete fillable packet passes core required items",
    pages: [
      { pageNumber: 1, text: fillablePacketText },
      {
        pageNumber: 2,
        text: `
INITIAL PREMIUM ALLOCATION - REQUIRED
Fixed Account 60%
Index Account 40%
Total 100%
`,
      },
    ],
    expectedClassifications: [
      { pageNumber: 1, documentType: "individual_application" },
      { pageNumber: 2, documentType: "initial_premium_allocation" },
    ],
    expectedFindings: [
      { ruleId: "owner-info", status: "present", minConfidence: 60 },
      { ruleId: "owner-signature", status: "present", minConfidence: 60 },
      { ruleId: "allocation-page", status: "present", minConfidence: 50 },
    ],
  },
  {
    id: "replacement-conditional",
    description: "Replacement packet triggers replacement notice when flagged",
    pages: [
      {
        pageNumber: 1,
        text: `Individual Annuity Application
Existing coverage replacement Yes replacing annuity
Owner Signature eSigned Signed By Owner Name Date 03/15/2026`,
      },
      {
        pageNumber: 2,
        text: "Replacement Notice existing coverage Section E Replacement = YES",
      },
    ],
    expectedClassifications: [
      { pageNumber: 1, documentType: "individual_application" },
      { pageNumber: 2, documentType: "replacement_notice" },
    ],
    expectedFindings: [
      { ruleId: "replacement-notice", status: "present" },
      { ruleId: "owner-signature", status: "present" },
    ],
  },
  {
    id: "transfer-conditional",
    description: "Transfer packet locates 1035 form when transfer selected",
    pages: [
      { pageNumber: 1, text: "Individual Annuity Application Premium Payment $250,000" },
      { pageNumber: 2, text: transferCaseText.replace(/Individual Annuity Application\n/, "") },
    ],
    expectedClassifications: [
      { pageNumber: 2, documentType: "transfer_1035" },
    ],
    expectedFindings: [{ ruleId: "transfer-form", status: "present" }],
  },
  {
    id: "admin-ignored",
    description: "Administrative pages are classified as ignored",
    pages: [
      { pageNumber: 1, text: "Fax Confirmation transmittal report scanner" },
      { pageNumber: 2, text: "Privacy Notice for customer information" },
    ],
    expectedClassifications: [
      { pageNumber: 1, documentType: "administrative", isIgnored: true },
      { pageNumber: 2, documentType: "administrative", isIgnored: true },
    ],
    expectedFindings: [],
  },
];

describe("regression fixtures", () => {
  for (const fixture of REGRESSION_FIXTURES) {
    it(`${fixture.id}: ${fixture.description}`, () => {
      const pages = buildPages(fixture.pages);

      for (const expected of fixture.expectedClassifications) {
        const page = pages.find((p) => p.pageNumber === expected.pageNumber)!;
        expect(page.documentType).toBe(expected.documentType);
        if (expected.isIgnored !== undefined) {
          expect(page.isIgnored).toBe(expected.isIgnored);
        }
      }

      const fullText = pages.map((p) => p.rawText).join("\n\n");
      const items = validatePacketLogic(fullText, pages, equitrustMarketEarlyNjRules);

      for (const expected of fixture.expectedFindings) {
        const finding = items.find((item) => item.ruleId === expected.ruleId);
        expect(finding, `missing finding ${expected.ruleId}`).toBeDefined();
        expect(finding!.status).toBe(expected.status);
        if (expected.minConfidence !== undefined) {
          expect(finding!.confidenceScore ?? 0).toBeGreaterThanOrEqual(expected.minConfidence);
        }
      }
    });
  }
});

describe("classification regression snapshots", () => {
  it("stable hierarchical labels for key form headers", () => {
    const samples = [
      "individual annuity application owner information annuitant",
      "replacement notice existing coverage",
      "initial premium allocation - required total 100%",
      "financial needs analysis risk tolerance",
    ];

    const results = samples.map((text) => {
      const classified = applyPageClassification(text.toLowerCase());
      return {
        documentType: classified.documentType,
        pageSubtype: classified.pageSubtype,
        legacy: classified.classification,
      };
    });

    expect(results).toEqual([
      {
        documentType: "individual_application",
        legacy: "application_page_1",
        pageSubtype: "owner_info",
      },
      {
        documentType: "replacement_notice",
        legacy: "replacement_notice",
        pageSubtype: "generic",
      },
      {
        documentType: "initial_premium_allocation",
        legacy: "initial_premium_allocation",
        pageSubtype: "allocation_table",
      },
      {
        documentType: "financial_needs_analysis",
        legacy: "fna_page_1",
        pageSubtype: "suitability",
      },
    ]);
  });
});
