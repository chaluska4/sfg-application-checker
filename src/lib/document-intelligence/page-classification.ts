import type { ConfidenceLevel, PageClassification } from "./types";
import type { DocumentTypeId, PageSubtypeId } from "./document-taxonomy";
import { toLegacyPageClassification } from "./document-taxonomy";
import { classifyPageHierarchical } from "./hierarchical-classifier";

export interface PageClassificationResult {
  classification: PageClassification;
  confidence: ConfidenceLevel;
  documentType: DocumentTypeId;
  pageSubtype: PageSubtypeId;
  classificationReason: string;
  classificationScore: number;
  isIgnored: boolean;
  matchedIndicators: string[];
}

export function applyPageClassification(
  normalizedText: string
): PageClassificationResult {
  const hierarchical = classifyPageHierarchical(normalizedText);

  return {
    classification: toLegacyPageClassification(
      hierarchical.documentType,
      hierarchical.pageSubtype
    ),
    confidence: hierarchical.confidence,
    documentType: hierarchical.documentType,
    pageSubtype: hierarchical.pageSubtype,
    classificationReason: hierarchical.reason,
    classificationScore: hierarchical.confidenceScore,
    isIgnored: hierarchical.isIgnored,
    matchedIndicators: hierarchical.matchedIndicators,
  };
}
