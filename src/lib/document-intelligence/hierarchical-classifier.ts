import type { ConfidenceLevel } from "./types";
import type { DocumentTypeId, PageSubtypeId } from "./document-taxonomy";
import { isAdministrativeDocument } from "./document-taxonomy";

export interface ClassificationIndicator {
  id: string;
  pattern: RegExp;
  weight: number;
}

export interface DocumentClassifierSpec {
  documentType: DocumentTypeId;
  pageSubtype: PageSubtypeId;
  /** Minimum weighted score to accept this classification */
  minScore: number;
  requiredIndicators: ClassificationIndicator[];
  supportingIndicators: ClassificationIndicator[];
  /** If any match, this spec is disqualified */
  disqualifiers?: RegExp[];
}

export interface HierarchicalClassification {
  documentType: DocumentTypeId;
  pageSubtype: PageSubtypeId;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  score: number;
  reason: string;
  matchedIndicators: string[];
  isIgnored: boolean;
}

const ADMIN_SPECS: DocumentClassifierSpec[] = [
  {
    documentType: "administrative",
    pageSubtype: "fax_confirmation",
    minScore: 4,
    requiredIndicators: [{ id: "fax", pattern: /fax confirmation|fax transmittal/i, weight: 4 }],
    supportingIndicators: [{ id: "cover", pattern: /transmittal|cover sheet/i, weight: 1 }],
  },
  {
    documentType: "administrative",
    pageSubtype: "privacy_notice",
    minScore: 4,
    requiredIndicators: [{ id: "privacy", pattern: /privacy notice|privacy policy/i, weight: 4 }],
    supportingIndicators: [],
  },
  {
    documentType: "administrative",
    pageSubtype: "transmission_report",
    minScore: 4,
    requiredIndicators: [
      { id: "transmission", pattern: /transmission report|scanner report|email cover/i, weight: 4 },
    ],
    supportingIndicators: [],
  },
  {
    documentType: "administrative",
    pageSubtype: "carrier_confirmation",
    minScore: 4,
    requiredIndicators: [
      { id: "carrier", pattern: /carrier confirmation|carrier receipt|processing confirmation/i, weight: 4 },
    ],
    supportingIndicators: [],
  },
];

const DOCUMENT_SPECS: DocumentClassifierSpec[] = [
  {
    documentType: "packet_cover",
    pageSubtype: "cover_sheet",
    minScore: 5,
    requiredIndicators: [
      { id: "sfg", pattern: /sfg annuity advisors/i, weight: 3 },
      { id: "checklist", pattern: /submission checklist|cover sheet/i, weight: 3 },
    ],
    supportingIndicators: [{ id: "packet", pattern: /packet review|advisor checklist/i, weight: 1 }],
    disqualifiers: [/individual annuity application/i],
  },
  {
    documentType: "transfer_1035",
    pageSubtype: "transfer_page_1",
    minScore: 5,
    requiredIndicators: [
      { id: "1035", pattern: /\b1035\b|1035 exchange/i, weight: 3 },
      { id: "transfer", pattern: /transfer request|transfer authorization|transfer\/1035/i, weight: 3 },
    ],
    supportingIndicators: [{ id: "relinquishing", pattern: /relinquishing|surrendering company/i, weight: 1 }],
    disqualifiers: [/individual annuity application/i],
  },
  {
    documentType: "replacement_notice",
    pageSubtype: "generic",
    minScore: 4,
    requiredIndicators: [{ id: "replacement_notice", pattern: /replacement notice/i, weight: 4 }],
    supportingIndicators: [{ id: "existing", pattern: /existing coverage|replacing/i, weight: 2 }],
  },
  {
    documentType: "disclosure_comparison",
    pageSubtype: "generic",
    minScore: 4,
    requiredIndicators: [
      { id: "comparison", pattern: /comparison of products|disclosure.{0,20}comparison/i, weight: 4 },
    ],
    supportingIndicators: [],
  },
  {
    documentType: "initial_premium_allocation",
    pageSubtype: "allocation_table",
    minScore: 4,
    requiredIndicators: [
      {
        id: "allocation_required",
        pattern: /initial premium allocation.{0,25}required/i,
        weight: 5,
      },
    ],
    supportingIndicators: [{ id: "total_100", pattern: /total\s*100\s*%/i, weight: 2 }],
  },
  {
    documentType: "individual_application",
    pageSubtype: "signatures",
    minScore: 5,
    requiredIndicators: [
      { id: "app_header", pattern: /individual annuity application/i, weight: 3 },
      { id: "signatures", pattern: /owner.{0,30}signature|agent.{0,30}signature|section i/i, weight: 3 },
    ],
    supportingIndicators: [{ id: "date", pattern: /signature.{0,15}date|date signed/i, weight: 1 }],
    disqualifiers: [/1035 exchange|transfer request|replacement notice/i],
  },
  {
    documentType: "individual_application",
    pageSubtype: "beneficiary",
    minScore: 5,
    requiredIndicators: [
      { id: "app_header", pattern: /individual annuity application/i, weight: 3 },
      { id: "beneficiary", pattern: /beneficiary designation|primary beneficiary/i, weight: 3 },
    ],
    supportingIndicators: [{ id: "tax", pattern: /tax qualification/i, weight: 1 }],
    disqualifiers: [/1035 exchange|transfer request/i],
  },
  {
    documentType: "individual_application",
    pageSubtype: "premium",
    minScore: 5,
    requiredIndicators: [
      { id: "app_header", pattern: /individual annuity application/i, weight: 3 },
      { id: "premium", pattern: /premium payment|initial premium/i, weight: 3 },
    ],
    supportingIndicators: [],
    disqualifiers: [/1035 exchange|transfer request/i],
  },
  {
    documentType: "individual_application",
    pageSubtype: "owner_info",
    minScore: 6,
    requiredIndicators: [
      { id: "app_header", pattern: /individual annuity application/i, weight: 4 },
      { id: "owner", pattern: /owner information|owner name|section a/i, weight: 3 },
    ],
    supportingIndicators: [{ id: "annuitant", pattern: /annuitant information|annuitant name/i, weight: 2 }],
    disqualifiers: [/1035 exchange|transfer request|submission checklist|cover sheet/i],
  },
  {
    documentType: "financial_needs_analysis",
    pageSubtype: "suitability",
    minScore: 4,
    requiredIndicators: [
      { id: "fna", pattern: /financial needs analysis/i, weight: 3 },
      { id: "risk", pattern: /risk tolerance|investment objective/i, weight: 2 },
    ],
    supportingIndicators: [],
  },
  {
    documentType: "financial_needs_analysis",
    pageSubtype: "objectives",
    minScore: 4,
    requiredIndicators: [
      { id: "fna", pattern: /financial needs analysis/i, weight: 3 },
      { id: "source", pattern: /source of funds|distribution objectives/i, weight: 2 },
    ],
    supportingIndicators: [],
  },
  {
    documentType: "product_disclosure",
    pageSubtype: "disclosure_body",
    minScore: 4,
    requiredIndicators: [
      { id: "pds", pattern: /product disclosure statement/i, weight: 4 },
    ],
    supportingIndicators: [{ id: "product", pattern: /marketearly|certainty select/i, weight: 2 }],
  },
  {
    documentType: "agent_disclosure",
    pageSubtype: "generic",
    minScore: 4,
    requiredIndicators: [
      { id: "agent", pattern: /insurance agent|producer disclosure|agent disclosure/i, weight: 4 },
    ],
    supportingIndicators: [],
    disqualifiers: [/individual annuity application/i],
  },
  {
    documentType: "electronic_delivery",
    pageSubtype: "generic",
    minScore: 4,
    requiredIndicators: [
      { id: "electronic", pattern: /electronic transactions|electronic delivery/i, weight: 4 },
    ],
    supportingIndicators: [],
  },
  {
    documentType: "hold_issue",
    pageSubtype: "generic",
    minScore: 4,
    requiredIndicators: [
      {
        id: "hold_issue",
        pattern: /authorization to hold issue|hold issue for multiple premiums/i,
        weight: 4,
      },
    ],
    supportingIndicators: [{ id: "flexible", pattern: /flexible premium|multiple premiums/i, weight: 2 }],
  },
  {
    documentType: "commission_election",
    pageSubtype: "generic",
    minScore: 4,
    requiredIndicators: [
      {
        id: "commission",
        pattern: /trail commission election|commission election form|commission payment option/i,
        weight: 4,
      },
    ],
    supportingIndicators: [],
  },
];

function scoreSpec(text: string, spec: DocumentClassifierSpec): {
  score: number;
  matched: string[];
} | null {
  if (spec.disqualifiers?.some((pattern) => pattern.test(text))) return null;

  let score = 0;
  const matched: string[] = [];

  for (const indicator of spec.requiredIndicators) {
    if (indicator.pattern.test(text)) {
      score += indicator.weight;
      matched.push(indicator.id);
    }
  }

  if (matched.length < Math.min(1, spec.requiredIndicators.length)) {
    const requiredHits = spec.requiredIndicators.filter((i) => i.pattern.test(text)).length;
    if (requiredHits === 0 && spec.minScore >= 4) return null;
  }

  for (const indicator of spec.supportingIndicators) {
    if (indicator.pattern.test(text)) {
      score += indicator.weight;
      matched.push(indicator.id);
    }
  }

  if (score < spec.minScore) return null;
  return { score, matched };
}

function scoreToConfidence(score: number, minScore: number): ConfidenceLevel {
  if (score >= minScore + 4) return "high";
  if (score >= minScore + 1) return "medium";
  return "low";
}

function scoreToPercent(score: number, minScore: number): number {
  const ratio = Math.min(1, score / (minScore + 5));
  return Math.round(50 + ratio * 50);
}

export function classifyPageHierarchical(normalizedText: string): HierarchicalClassification {
  if (!normalizedText || normalizedText.length < 15) {
    return {
      documentType: "unknown",
      pageSubtype: "unknown",
      confidence: "low",
      confidenceScore: 0,
      score: 0,
      reason: "Insufficient OCR text to classify.",
      matchedIndicators: [],
      isIgnored: false,
    };
  }

  let best: HierarchicalClassification | null = null;

  for (const spec of [...ADMIN_SPECS, ...DOCUMENT_SPECS]) {
    const result = scoreSpec(normalizedText, spec);
    if (!result) continue;

    const confidence = scoreToConfidence(result.score, spec.minScore);
    const candidate: HierarchicalClassification = {
      documentType: spec.documentType,
      pageSubtype: spec.pageSubtype,
      confidence,
      confidenceScore: scoreToPercent(result.score, spec.minScore),
      score: result.score,
      reason: `Matched indicators: ${result.matched.join(", ")} (score ${result.score}/${spec.minScore}).`,
      matchedIndicators: result.matched,
      isIgnored: isAdministrativeDocument(spec.documentType),
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (best) return best;

  return {
    documentType: "unknown",
    pageSubtype: "unknown",
    confidence: "low",
    confidenceScore: 20,
    score: 0,
    reason: "No document type met minimum indicator threshold.",
    matchedIndicators: [],
    isIgnored: false,
  };
}

export function getClassifierSpecs(): DocumentClassifierSpec[] {
  return [...ADMIN_SPECS, ...DOCUMENT_SPECS];
}
