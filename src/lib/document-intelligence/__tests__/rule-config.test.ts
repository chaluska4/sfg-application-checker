import { describe, it, expect } from "vitest";
import {
  EQUITRUST_CONFIGURABLE_RULES,
  EQUITRUST_CORE_RULE_IDS,
  compileConfigurableRule,
  getConfigurableRuleById,
  getScopedTargetForRule,
} from "../rule-config";
import { equitrustMarketEarlyNjRules } from "../templates/equitrust-marketearly-nj";
import { enrichPageWithClassification } from "../classify-pages";
import { evaluateFieldWithEvidence } from "../finding-evidence";
import { validatePacketLogic } from "./test-helpers";
import { fillablePacketText } from "./fixtures/sample-text";
import type { DocumentPacket, PageAnalysis } from "../types";
import { detectCheckboxes } from "../detect-checkboxes";
import { detectSignatures } from "../detect-signatures";
import { detectDates } from "../detect-dates";
import { extractKnownValues, detectPacketFlags } from "../extract-known-values";
import { deriveExtractionMode } from "../ocr";

function page(text: string, pageNumber = 1): PageAnalysis {
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

function packetFromPages(pages: PageAnalysis[]): DocumentPacket {
  const fullText = pages.map((p) => p.rawText).join("\n\n");
  const checkboxes = detectCheckboxes(pages);
  return {
    fileName: "test.pdf",
    pageCount: pages.length,
    extractionMode: deriveExtractionMode(pages),
    hasEmbeddedText: true,
    pages,
    fullText,
    checkboxes,
    signatures: detectSignatures(pages),
    dates: detectDates(pages),
    values: extractKnownValues(pages, fullText),
    flags: detectPacketFlags(pages, fullText, checkboxes),
  };
}

describe("EQUITRUST_CONFIGURABLE_RULES migration", () => {
  it("defines all core EquiTrust checklist rule ids", () => {
    const expectedCore = [
      "owner-info",
      "annuitant-info",
      "owner-ssn",
      "product-name",
      "agent-info",
      "tax-qualification",
      "premium-payment",
      "existing-coverage",
      "beneficiary",
      "owner-signature",
      "owner-signature-date",
      "agent-signature",
      "agent-signature-date",
      "pds-signature",
      "pds-signature-date",
      "allocation-page",
      "allocation-100",
      "fna-page-1",
      "fna-risk",
      "fna-source",
      "fna-distribution",
      "fna-source-other-explain",
      "agent-disclosure",
      "acknowledgments",
      "replacement-notice",
      "disclosure-comparison",
      "transfer-form",
      "electronic-transactions",
      "hold-issue",
      "trail-commission",
      "privacy-notice",
    ];

    expect(EQUITRUST_CORE_RULE_IDS.sort()).toEqual(expectedCore.sort());
    expect(equitrustMarketEarlyNjRules).toHaveLength(expectedCore.length);
  });

  it("compiles every config rule with scoped document target", () => {
    for (const def of EQUITRUST_CONFIGURABLE_RULES.filter((r) => !r.imageOnlyOverlay)) {
      const compiled = compileConfigurableRule(def);
      const target = getScopedTargetForRule(def);
      expect(compiled.id).toBe(def.id);
      expect(target.requiredDocument).toBe(def.requiredDocument);
      expect(compiled.pageTypes?.length).toBeGreaterThan(0);
    }
  });

  it("equitrustMarketEarlyNjRules is compiled from configuration", () => {
    const ids = equitrustMarketEarlyNjRules.map((rule) => rule.id).sort();
    expect(ids).toEqual([...EQUITRUST_CORE_RULE_IDS].sort());
  });
});

describe("scoped rule evaluation by category", () => {
  it("owner-info passes with value evidence in scoped application", () => {
    const pages = [
      page(
        "Individual Annuity Application Owner Information Section A First Name John Last Name Smith",
        1
      ),
    ];
    const packet = packetFromPages(pages);
    const rule = equitrustMarketEarlyNjRules.find((r) => r.id === "owner-info")!;
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(result.status).toBe("present");
    expect(result.scopedContext?.stages[0]?.success).toBe(true);
  });

  it("owner-signature passes with eSigned evidence in scoped signatures section", () => {
    const pages = [
      page(
        "Individual Annuity Application Section I Owner Signature eSigned Signed By John Smith",
        1
      ),
    ];
    const packet = packetFromPages(pages);
    const rule = equitrustMarketEarlyNjRules.find((r) => r.id === "owner-signature")!;
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(result.status).toBe("present");
    expect(result.hasValueEvidence).toBe(true);
  });

  it("allocation-page requires INITIAL PREMIUM ALLOCATION - REQUIRED scoped document", () => {
    const pages = [
      page("INITIAL PREMIUM ALLOCATION - REQUIRED Fixed Account 50% Index 50% Total 100%", 1),
    ];
    const packet = packetFromPages(pages);
    const rule = equitrustMarketEarlyNjRules.find((r) => r.id === "allocation-page")!;
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(result.status).toBe("present");
  });

  it("fna-risk evaluates within financial needs analysis document", () => {
    const pages = [page("Financial Needs Analysis Risk Tolerance Moderate Question 6", 1)];
    const packet = packetFromPages(pages);
    const rule = equitrustMarketEarlyNjRules.find((r) => r.id === "fna-risk")!;
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(["present", "incomplete"]).toContain(result.status);
    expect(result.scopedContext?.documentType).toBe("financial_needs_analysis");
  });

  it("replacement-notice is conditional on replacement flag", () => {
    const def = getConfigurableRuleById("replacement-notice");
    expect(def?.condition?.dependsOn).toBe("replacement");
  });

  it("privacy-notice searches administrative pages only", () => {
    const def = getConfigurableRuleById("privacy-notice")!;
    expect(def.includeAdministrativePages).toBe(true);
    const pages = [page("Privacy Notice for customer information privacy policy", 1)];
    const packet = packetFromPages(pages);
    const rule = equitrustMarketEarlyNjRules.find((r) => r.id === "privacy-notice")!;
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(result.status).toBe("present");
    expect(pages[0].isIgnored).toBe(true);
    expect(pages[0].documentType).toBe("administrative");
  });

  it("does not mark owner-info MISSING without locating scoped document", () => {
    const pages = [page("fax confirmation transmission report only", 1)];
    pages[0].isIgnored = true;
    const packet = packetFromPages(pages);
    const rule = equitrustMarketEarlyNjRules.find((r) => r.id === "owner-info")!;
    const result = evaluateFieldWithEvidence(rule, packet);
    expect(result.status).not.toBe("missing");
    expect(["low_confidence", "ocr_unreadable"]).toContain(result.status);
  });

  it("fillable packet validates migrated core rules", () => {
    const pages = [
      page(fillablePacketText, 1),
      page(
        `INITIAL PREMIUM ALLOCATION - REQUIRED
Fixed Account 60%
Index Account 40%
Total 100%`,
        2
      ),
    ];
    const items = validatePacketLogic(
      pages.map((p) => p.rawText).join("\n\n"),
      pages
    );
    const ownerInfo = items.find((i) => i.ruleId === "owner-info");
    const ownerSig = items.find((i) => i.ruleId === "owner-signature");
    expect(ownerInfo?.status).toBe("present");
    expect(ownerSig?.status).toBe("present");
    expect(ownerInfo?.validationTrace?.length).toBeGreaterThan(0);
  });
});
