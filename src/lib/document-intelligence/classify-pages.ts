import type { ConfidenceLevel, PageClassification } from "./types";

interface ClassifierRule {
  type: PageClassification;
  patterns: RegExp[];
  weight: number;
}

const EXCLUSIVE_CLASSIFIERS: {
  type: PageClassification;
  patterns: RegExp[];
  confidence?: ConfidenceLevel;
}[] = [
  {
    type: "sfg_cover_sheet",
    patterns: [/sfg annuity advisors/i, /submission checklist/i, /cover sheet/i],
    confidence: "high",
  },
  {
    type: "transfer_1035_form",
    patterns: [/1035 exchange/i, /transfer request/i, /transfer\/1035/i, /transfer authorization/i],
    confidence: "high",
  },
  {
    type: "replacement_notice",
    patterns: [/replacement notice/i],
    confidence: "high",
  },
  {
    type: "disclosure_comparison",
    patterns: [/comparison of products/i, /disclosure.{0,20}comparison/i],
    confidence: "high",
  },
  {
    type: "initial_premium_allocation",
    patterns: [/initial premium allocation.{0,25}required/i],
    confidence: "high",
  },
];

const CLASSIFIERS: ClassifierRule[] = [
  { type: "application_page_1", patterns: [/individual annuity application/i], weight: 6 },
  {
    type: "application_page_1",
    patterns: [/owner information/i, /annuitant information|annuitant name/i],
    weight: 4,
  },
  { type: "application_page_2", patterns: [/beneficiary/i, /tax qualification/i, /premium payment/i], weight: 2 },
  {
    type: "application_page_3_signatures",
    patterns: [/owner.{0,30}signature/i, /agent.{0,30}signature/i, /application page 3/i],
    weight: 3,
  },
  { type: "product_disclosure", patterns: [/product disclosure statement/i, /certainty select|marketearly/i], weight: 3 },
  { type: "fna_page_1", patterns: [/financial needs analysis/i, /risk tolerance/i], weight: 2 },
  { type: "fna_page_2", patterns: [/source of funds/i, /distribution objectives/i], weight: 2 },
  { type: "fna_page_3", patterns: [/financial needs analysis/i, /client acknowledgment/i], weight: 1 },
  {
    type: "agent_producer_disclosure",
    patterns: [/insurance agent|producer disclosure/i, /agent disclosure/i, /electronic transactions/i],
    weight: 3,
  },
  {
    type: "acknowledgments_signatures",
    patterns: [/acknowledgments and signatures/i, /applicant acknowledgment/i, /important notice/i],
    weight: 3,
  },
  {
    type: "transfer_1035_form",
    patterns: [/\b1035\b/i, /transfer.{0,40}exchange/i],
    weight: 2,
  },
  { type: "initial_premium_allocation", patterns: [/initial premium allocation/i], weight: 2 },
  { type: "replacement_notice", patterns: [/existing coverage/i, /replacing/i], weight: 2 },
];

const APPLICATION_DISQUALIFIERS =
  /1035 exchange|transfer request|transfer\/1035|submission checklist|cover sheet|sfg annuity advisors|replacement notice|comparison of products/i;

function matchesExclusive(
  normalizedText: string
): { classification: PageClassification; confidence: ConfidenceLevel } | null {
  for (const rule of EXCLUSIVE_CLASSIFIERS) {
    const hits = rule.patterns.filter((pattern) => pattern.test(normalizedText)).length;
    if (hits === 0) continue;
    if (rule.type === "initial_premium_allocation" && hits < 1) continue;
    if (rule.type === "transfer_1035_form" && !/(1035|transfer)/i.test(normalizedText)) continue;
    return {
      classification: rule.type,
      confidence: rule.confidence ?? "high",
    };
  }
  return null;
}

function scoreClassifiers(normalizedText: string): {
  best: PageClassification;
  bestScore: number;
} {
  let best: PageClassification = "unknown";
  let bestScore = 0;

  for (const rule of CLASSIFIERS) {
    if (rule.type === "application_page_1" && APPLICATION_DISQUALIFIERS.test(normalizedText)) {
      continue;
    }

    let score = 0;
    let matchedPatterns = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(normalizedText)) {
        score += rule.weight;
        matchedPatterns += 1;
      }
    }

    if (rule.type === "application_page_1" && rule.patterns.length > 1 && matchedPatterns < 2) {
      score = 0;
    }

    if (score > bestScore) {
      bestScore = score;
      best = rule.type;
    }
  }

  return { best, bestScore };
}

export function classifyPage(
  normalizedText: string,
  pageNumber = 0
): { classification: PageClassification; confidence: ConfidenceLevel } {
  void pageNumber;
  if (!normalizedText || normalizedText.length < 15) {
    return { classification: "unknown", confidence: "low" };
  }

  const exclusive = matchesExclusive(normalizedText);
  if (exclusive) return exclusive;

  const { best, bestScore } = scoreClassifiers(normalizedText);
  if (bestScore === 0) return { classification: "unknown", confidence: "low" };

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
