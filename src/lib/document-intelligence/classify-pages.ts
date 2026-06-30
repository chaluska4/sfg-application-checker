import type { ConfidenceLevel, PageClassification, PageAnalysis } from "./types";
import type { DocumentTypeId } from "./document-taxonomy";
import { applyPageClassification } from "./page-classification";

export function classifyPage(
  normalizedText: string,
  pageNumber = 0
): { classification: PageClassification; confidence: ConfidenceLevel } {
  void pageNumber;
  const result = applyPageClassification(normalizedText);
  return { classification: result.classification, confidence: result.confidence };
}

export function enrichPageWithClassification(
  page: Omit<PageAnalysis, "classification" | "classificationConfidence"> & {
    classification?: PageClassification;
    classificationConfidence?: ConfidenceLevel;
  },
  normalizedText: string
): PageAnalysis {
  const result = applyPageClassification(normalizedText);
  return {
    ...page,
    classification: result.classification,
    classificationConfidence: result.confidence,
    documentType: result.documentType,
    pageSubtype: result.pageSubtype,
    classificationReason: result.classificationReason,
    classificationScore: result.classificationScore,
    isIgnored: result.isIgnored,
  };
}

export function hasPageType(
  pages: { classification: PageClassification }[],
  type: PageClassification
): boolean {
  return pages.some((p) => p.classification === type);
}

export function hasDocumentType(
  pages: { documentType?: DocumentTypeId; isIgnored?: boolean }[],
  documentType: DocumentTypeId
): boolean {
  return pages.some((p) => !p.isIgnored && p.documentType === documentType);
}

export function getNonIgnoredPages(pages: PageAnalysis[]): PageAnalysis[] {
  return pages.filter((p) => !p.isIgnored);
}
