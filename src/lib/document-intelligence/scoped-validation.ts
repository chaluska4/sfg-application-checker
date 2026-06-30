import type { ConfidenceLevel, OcrBoundingBox, PageAnalysis } from "./types";
import type { DocumentTypeId, PageSubtypeId } from "./document-taxonomy";
import { DOCUMENT_TYPE_LABELS, PAGE_SUBTYPE_LABELS } from "./document-taxonomy";
import { pageHasUsableText } from "./ocr";
import { maskEvidenceSnippet } from "./finding-evidence";

export type ValidationStage =
  | "locate_document"
  | "locate_section"
  | "locate_field"
  | "locate_value"
  | "validate_evidence";

export interface ValidationStageResult {
  stage: ValidationStage;
  success: boolean;
  detail: string;
  pageNumber?: number;
  boundingBox?: OcrBoundingBox;
  snippet?: string;
}

export interface ScopedSearchContext {
  documentType?: DocumentTypeId;
  pageSubtype?: PageSubtypeId;
  pageNumber?: number;
  sectionLabel?: string;
  fieldLabel?: string;
  stages: ValidationStageResult[];
}

export interface ScopedFieldTarget {
  requiredDocument: DocumentTypeId;
  expectedPageSubtype?: PageSubtypeId;
  sectionPatterns?: RegExp[];
  fieldPatterns?: RegExp[];
  valuePatterns?: RegExp[];
  includeAdministrativePages?: boolean;
}

function pagesForDocument(
  pages: PageAnalysis[],
  documentType: DocumentTypeId,
  pageSubtype?: PageSubtypeId,
  includeAdministrativePages = false
): PageAnalysis[] {
  return pages.filter((page) => {
    if (includeAdministrativePages) {
      if (!page.isIgnored || page.documentType !== documentType) return false;
    } else {
      if (page.isIgnored) return false;
      if (page.documentType !== documentType) return false;
    }
    if (pageSubtype && page.pageSubtype !== pageSubtype) return false;
    return pageHasUsableText(page);
  });
}

function findLineMatch(
  page: PageAnalysis,
  patterns: RegExp[]
): { text: string; confidence: ConfidenceLevel; boundingBox?: OcrBoundingBox } | null {
  const lines: { text: string; confidence: ConfidenceLevel; boundingBox?: OcrBoundingBox }[] =
    page.ocrLines ??
    page.rawText.split("\n").map((text) => ({ text, confidence: "medium" as ConfidenceLevel }));

  for (const line of lines) {
    if (patterns.some((pattern) => pattern.test(line.text))) {
      return {
        text: line.text,
        confidence: line.confidence ?? "medium",
        boundingBox: line.boundingBox,
      };
    }
  }
  return null;
}

export function runScopedSearch(
  pages: PageAnalysis[],
  target: ScopedFieldTarget
): ScopedSearchContext {
  const stages: ValidationStageResult[] = [];

  const candidatePages = pagesForDocument(
    pages,
    target.requiredDocument,
    target.expectedPageSubtype,
    target.includeAdministrativePages
  );

  if (!candidatePages.length) {
    stages.push({
      stage: "locate_document",
      success: false,
      detail: `No readable pages classified as ${DOCUMENT_TYPE_LABELS[target.requiredDocument]}.`,
    });
    return { stages };
  }

  const documentPage = candidatePages[0];
  stages.push({
    stage: "locate_document",
    success: true,
    detail: `Located ${DOCUMENT_TYPE_LABELS[target.requiredDocument]} on page ${documentPage.pageNumber}.`,
    pageNumber: documentPage.pageNumber,
  });

  let workingPage = documentPage;

  if (target.sectionPatterns?.length) {
    const sectionHit = candidatePages
      .map((page) => ({ page, hit: findLineMatch(page, target.sectionPatterns!) }))
      .find((entry) => entry.hit);

    if (!sectionHit?.hit) {
      stages.push({
        stage: "locate_section",
        success: false,
        detail: `Section not found within ${DOCUMENT_TYPE_LABELS[target.requiredDocument]}.`,
        pageNumber: documentPage.pageNumber,
      });
      return {
        documentType: target.requiredDocument,
        pageNumber: documentPage.pageNumber,
        stages,
      };
    }

    workingPage = sectionHit.page;
    stages.push({
      stage: "locate_section",
      success: true,
      detail: `Section located on page ${workingPage.pageNumber}.`,
      pageNumber: workingPage.pageNumber,
      snippet: maskEvidenceSnippet(sectionHit.hit.text),
      boundingBox: sectionHit.hit.boundingBox,
    });
  }

  if (target.fieldPatterns?.length) {
    const fieldHit = findLineMatch(workingPage, target.fieldPatterns);
    if (!fieldHit) {
      stages.push({
        stage: "locate_field",
        success: false,
        detail: "Field label not found near expected section.",
        pageNumber: workingPage.pageNumber,
      });
      return {
        documentType: target.requiredDocument,
        pageSubtype: workingPage.pageSubtype,
        pageNumber: workingPage.pageNumber,
        stages,
      };
    }

    stages.push({
      stage: "locate_field",
      success: true,
      detail: "Field label located in scoped document text.",
      pageNumber: workingPage.pageNumber,
      snippet: maskEvidenceSnippet(fieldHit.text),
      boundingBox: fieldHit.boundingBox,
    });

    return {
      documentType: target.requiredDocument,
      pageSubtype: workingPage.pageSubtype,
      pageNumber: workingPage.pageNumber,
      fieldLabel: fieldHit.text,
      stages,
    };
  }

  if (target.valuePatterns?.length) {
    const valueHit = findLineMatch(workingPage, target.valuePatterns);
    if (!valueHit) {
      stages.push({
        stage: "locate_value",
        success: false,
        detail: "Label found but required value not detected in scoped region.",
        pageNumber: workingPage.pageNumber,
      });
      return {
        documentType: target.requiredDocument,
        pageSubtype: workingPage.pageSubtype,
        pageNumber: workingPage.pageNumber,
        stages,
      };
    }

    stages.push({
      stage: "locate_value",
      success: true,
      detail: "Value pattern matched within scoped document.",
      pageNumber: workingPage.pageNumber,
      snippet: maskEvidenceSnippet(valueHit.text),
      boundingBox: valueHit.boundingBox,
    });

    stages.push({
      stage: "validate_evidence",
      success: true,
      detail: "Value evidence validated in scoped search.",
      pageNumber: workingPage.pageNumber,
      snippet: maskEvidenceSnippet(valueHit.text),
      boundingBox: valueHit.boundingBox,
    });

    return {
      documentType: target.requiredDocument,
      pageSubtype: workingPage.pageSubtype,
      pageNumber: workingPage.pageNumber,
      stages,
    };
  }

  stages.push({
    stage: "validate_evidence",
    success: true,
    detail: `Scoped document ${PAGE_SUBTYPE_LABELS[workingPage.pageSubtype ?? "unknown"]} located.`,
    pageNumber: workingPage.pageNumber,
  });

  return {
    documentType: target.requiredDocument,
    pageSubtype: workingPage.pageSubtype,
    pageNumber: workingPage.pageNumber,
    stages,
  };
}

export function scopedSearchSucceeded(context: ScopedSearchContext): boolean {
  const last = context.stages[context.stages.length - 1];
  return Boolean(last?.success && last.stage === "validate_evidence");
}

export function scopedDocumentLocated(context?: ScopedSearchContext): boolean {
  return Boolean(context?.stages?.[0]?.success);
}

export function scopedSectionLocated(context?: ScopedSearchContext): boolean {
  if (!context?.stages?.length) return false;
  return context.stages.some(
    (stage) =>
      (stage.stage === "locate_section" || stage.stage === "locate_field") && stage.success
  );
}

export function getScopedBoundingBox(context?: ScopedSearchContext): OcrBoundingBox | undefined {
  if (!context?.stages?.length) return undefined;
  for (let i = context.stages.length - 1; i >= 0; i--) {
    if (context.stages[i].boundingBox) return context.stages[i].boundingBox;
  }
  return undefined;
}
