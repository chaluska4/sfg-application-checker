import type { ConfidenceLevel, PageAnalysis, ValidationResultItem } from "../types";
import { getPageClassificationLabel } from "../page-classification-labels";
import { DOCUMENT_TYPE_LABELS, PAGE_SUBTYPE_LABELS } from "../document-taxonomy";
import { pageHasUsableText } from "./enrich-pages-with-ocr";
import type { OcrDiagnostics } from "./ocr-dev-log";
import type { ValidationStageResult } from "../scoped-validation";

const SNIPPET_MAX_LENGTH = 400;

const PII_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{3}\s\d{2}\s\d{4}\b/g,
  /\b\d{9}\b/g,
  /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g,
  /\b\d{8,}\b/g,
];

const CONFIDENCE_SCORE: Record<ConfidenceLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export interface OcrDebugPageInfo {
  pageNumber: number;
  detectedFormName: string;
  classificationLabel: string;
  documentType?: string;
  pageSubtype?: string;
  classificationReason?: string;
  classificationScore?: number;
  isIgnored?: boolean;
  textCharacterCount: number;
  lineCount: number;
  selectionMarkCount: number;
  averageConfidence: ConfidenceLevel;
  firstTextSnippetMasked: string;
  hasReadableText: boolean;
}

export interface OcrDebugRuleTrace {
  ruleId: string;
  label: string;
  status: string;
  confidenceScore?: number | null;
  stages?: ValidationStageResult[];
}

export interface OcrDebugInfo {
  ocrProvider: string;
  ocrAttempted: boolean;
  ocrReturnedPages: number;
  ocrError?: string;
  totalPages: number;
  pagesWithText: number;
  ignoredPageCount?: number;
  totalCharacters: number;
  totalLines: number;
  totalSelectionMarks: number;
  averageConfidence: ConfidenceLevel;
  ocrDurationMs?: number;
  validationDurationMs?: number;
  diagnosticSummary: string[];
  ruleTraces?: OcrDebugRuleTrace[];
  pages: OcrDebugPageInfo[];
}

/** Enabled in non-production by default; production requires ENABLE_OCR_DEBUG=true. */
export function isOcrDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.ENABLE_OCR_DEBUG === "true";
  }
  return true;
}

export function maskOcrDebugSnippet(text: string): string {
  let masked = text;
  for (const pattern of PII_PATTERNS) {
    masked = masked.replace(pattern, "[redacted]");
  }
  return masked.trim().slice(0, SNIPPET_MAX_LENGTH);
}

function averageConfidenceLevel(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (!levels.length) return "low";
  const average = levels.reduce((sum, level) => sum + CONFIDENCE_SCORE[level], 0) / levels.length;
  if (average >= 2.5) return "high";
  if (average >= 1.5) return "medium";
  return "low";
}

function pageLineCount(page: PageAnalysis): number {
  if (page.ocrLines?.length) return page.ocrLines.length;
  if (!page.rawText.trim()) return 0;
  return page.rawText.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function pageConfidenceLevels(page: PageAnalysis): ConfidenceLevel[] {
  if (page.ocrLines?.length) {
    return page.ocrLines.map((line) => line.confidence);
  }
  if (pageHasUsableText(page)) {
    return [page.ocrConfidence ?? page.classificationConfidence];
  }
  return [];
}

export function buildOcrDiagnosticSummary(
  debug: Pick<
    OcrDebugInfo,
    "totalCharacters" | "totalSelectionMarks" | "pagesWithText" | "totalPages"
  >,
  ocrUnreadableFindingCount: number
): string[] {
  const messages: string[] = [];

  if (debug.totalCharacters === 0) {
    messages.push("Azure OCR returned no readable text.");
  } else if (ocrUnreadableFindingCount > 0) {
    messages.push(
      "OCR text exists, but validation matching/classification may be failing."
    );
  }

  if (debug.totalSelectionMarks === 0) {
    messages.push("No Azure checkbox/selection marks detected.");
  }

  if (debug.totalPages > 0 && debug.pagesWithText < debug.totalPages) {
    messages.push("OCR only succeeded on some pages.");
  }

  return messages;
}

export function buildOcrDebugInfo(
  pages: PageAnalysis[],
  ocrProviderName: string,
  ocrDiagnostics: OcrDiagnostics | undefined,
  items: ValidationResultItem[],
  timing?: { ocrDurationMs?: number; validationDurationMs?: number }
): OcrDebugInfo {
  const pageInfos: OcrDebugPageInfo[] = pages.map((page) => {
    const lineCount = pageLineCount(page);
    const selectionMarkCount = page.ocrSelectionMarks?.length ?? 0;
    const confidenceLevels = pageConfidenceLevels(page);
    const readable = pageHasUsableText(page);

    return {
      pageNumber: page.pageNumber,
      detectedFormName: getPageClassificationLabel(page.classification),
      classificationLabel: page.classification,
      documentType: page.documentType ? DOCUMENT_TYPE_LABELS[page.documentType] : undefined,
      pageSubtype:
        page.pageSubtype && page.pageSubtype !== "unknown"
          ? PAGE_SUBTYPE_LABELS[page.pageSubtype]
          : undefined,
      classificationReason: page.classificationReason,
      classificationScore: page.classificationScore,
      isIgnored: page.isIgnored,
      textCharacterCount: page.rawText.length,
      lineCount,
      selectionMarkCount,
      averageConfidence: averageConfidenceLevel(confidenceLevels),
      firstTextSnippetMasked: maskOcrDebugSnippet(page.rawText),
      hasReadableText: readable,
    };
  });

  const allConfidenceLevels = pageInfos.flatMap((page) =>
    page.hasReadableText ? [page.averageConfidence] : []
  );

  const totalCharacters = pageInfos.reduce((sum, page) => sum + page.textCharacterCount, 0);
  const totalLines = pageInfos.reduce((sum, page) => sum + page.lineCount, 0);
  const totalSelectionMarks = pageInfos.reduce((sum, page) => sum + page.selectionMarkCount, 0);
  const pagesWithText = pageInfos.filter((page) => page.hasReadableText).length;

  const ocrUnreadableFindingCount = items.filter((item) => item.status === "ocr_unreadable").length;

  const ignoredPageCount = pageInfos.filter((page) => page.isIgnored).length;

  const ruleTraces: OcrDebugRuleTrace[] = items
    .filter((item) => item.validationTrace?.length)
    .map((item) => ({
      ruleId: item.ruleId,
      label: item.label,
      status: item.statusDisplay ?? item.status,
      confidenceScore: item.confidenceScore,
      stages: item.validationTrace ?? undefined,
    }));

  const debugCore = {
    ocrProvider: ocrProviderName,
    ocrAttempted: ocrDiagnostics?.attempted ?? false,
    ocrReturnedPages: ocrDiagnostics?.returnedPageCount ?? 0,
    ocrError: ocrDiagnostics?.error,
    totalPages: pages.length,
    pagesWithText,
    ignoredPageCount,
    totalCharacters,
    totalLines,
    totalSelectionMarks,
    averageConfidence: averageConfidenceLevel(allConfidenceLevels),
    ocrDurationMs: timing?.ocrDurationMs,
    validationDurationMs: timing?.validationDurationMs,
    ruleTraces,
    pages: pageInfos,
  };

  const diagnosticSummary = [
    ...buildOcrDiagnosticSummary(debugCore, ocrUnreadableFindingCount),
    ...(ignoredPageCount > 0
      ? [`${ignoredPageCount} administrative page(s) excluded from validation.`]
      : []),
  ];

  return {
    ...debugCore,
    diagnosticSummary,
  };
}
