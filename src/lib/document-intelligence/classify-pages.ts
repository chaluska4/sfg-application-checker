import type { ConfidenceLevel, PageClassification } from "./types";

interface ClassifierRule {
  type: PageClassification;
  patterns: RegExp[];
  weight: number;
}

const CLASSIFIERS: ClassifierRule[] = [
  { type: "sfg_cover_sheet", patterns: [/sfg annuity advisors/i, /cover sheet/i, /submission checklist/i], weight: 3 },
  { type: "application_page_1", patterns: [/individual annuity application/i, /owner information/i, /annuitant/i], weight: 3 },
  { type: "application_page_2", patterns: [/beneficiary/i, /tax qualification/i, /premium payment/i], weight: 2 },
  { type: "application_page_3_signatures", patterns: [/owner.?s signature/i, /agent.?s signature/i, /application page 3/i], weight: 3 },
  { type: "product_disclosure", patterns: [/product disclosure statement/i, /certainty select|marketearly/i], weight: 3 },
  { type: "initial_premium_allocation", patterns: [/initial premium allocation/i, /allocation of premium/i, /100%/i], weight: 3 },
  { type: "fna_page_1", patterns: [/financial needs analysis/i, /risk tolerance/i], weight: 2 },
  { type: "fna_page_2", patterns: [/source of funds/i, /distribution objectives/i], weight: 2 },
  { type: "fna_page_3", patterns: [/financial needs analysis/i, /client acknowledgment/i], weight: 1 },
  { type: "agent_producer_disclosure", patterns: [/insurance agent|producer disclosure/i, /agent disclosure/i, /electronic transactions/i, /electronic delivery/i], weight: 3 },
  { type: "acknowledgments_signatures", patterns: [/acknowledgments and signatures/i, /applicant acknowledgment/i, /important notice/i, /right to review/i], weight: 3 },
  { type: "transfer_1035_form", patterns: [/transfer|1035 exchange/i, /transfer request/i], weight: 3 },
  { type: "replacement_notice", patterns: [/replacement notice/i, /existing coverage/i, /replacing/i], weight: 3 },
  { type: "disclosure_comparison", patterns: [/disclosure.{0,20}comparison/i, /comparison of products/i], weight: 3 },
];

export function classifyPage(
  normalizedText: string,
  pageNumber: number
): { classification: PageClassification; confidence: ConfidenceLevel } {
  if (!normalizedText || normalizedText.length < 15) {
    return { classification: "unknown", confidence: "low" };
  }

  let best: PageClassification = "unknown";
  let bestScore = 0;

  for (const rule of CLASSIFIERS) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(normalizedText)) score += rule.weight;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.type;
    }
  }

  if (bestScore === 0) return { classification: "unknown", confidence: "low" };
  if (pageNumber <= 2 && best === "unknown" && /equitrust|annuity/i.test(normalizedText)) {
    return { classification: "application_page_1", confidence: "medium" };
  }

  const confidence: ConfidenceLevel =
    bestScore >= 6 ? "high" : bestScore >= 3 ? "medium" : "low";
  return { classification: best, confidence };
}

export function hasPageType(
  pages: { classification: PageClassification }[],
  type: PageClassification
): boolean {
  return pages.some((p) => p.classification === type);
}
