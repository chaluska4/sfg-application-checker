import type { PageAnalysis } from "../types";
import { classifyPage } from "../classify-pages";
import { normalizeText } from "../extract-pdf-text";
import { pageTextConfidence } from "../confidence";
import type { OcrProvider } from "./ocr-provider";
import type { OcrBoundingBox, OcrTextLine } from "./types";
import { type OcrDiagnostics, logOcrDiagnostics, sanitizeOcrError } from "./ocr-dev-log";

export function findOcrBoundingBoxForPatterns(
  lines: OcrTextLine[] | undefined,
  patterns: RegExp[]
): OcrBoundingBox | null {
  if (!lines?.length || !patterns.length) return null;

  for (const line of lines) {
    if (patterns.some((pattern) => pattern.test(line.text)) && line.boundingBox) {
      return line.boundingBox;
    }
  }
  return null;
}

export interface OcrEnrichmentResult {
  pages: PageAnalysis[];
  diagnostics: OcrDiagnostics;
}

export async function enrichPagesWithOcr(
  pages: PageAnalysis[],
  fileName: string,
  provider: OcrProvider,
  pdfBuffer?: ArrayBuffer
): Promise<OcrEnrichmentResult> {
  const diagnostics: OcrDiagnostics = {
    providerSelected: provider.name,
    attempted: false,
    candidatePageCount: 0,
    returnedPageCount: 0,
    lineCount: 0,
    enrichedPageCount: 0,
  };

  if (!provider.isAvailable()) {
    logOcrDiagnostics(diagnostics);
    return { pages, diagnostics };
  }

  const ocrCandidates = pages.filter((page) => !page.hasEmbeddedText);
  diagnostics.candidatePageCount = ocrCandidates.length;

  if (ocrCandidates.length === 0) {
    logOcrDiagnostics(diagnostics);
    return { pages, diagnostics };
  }

  diagnostics.attempted = true;

  let ocrResult;
  try {
    ocrResult = await provider.recognize({
      fileName,
      pages: ocrCandidates.map((page) => ({ pageNumber: page.pageNumber })),
      pdfBuffer,
    });
  } catch (error) {
    diagnostics.error = sanitizeOcrError(error);
    logOcrDiagnostics(diagnostics);
    return { pages, diagnostics };
  }

  diagnostics.returnedPageCount = ocrResult.pages.length;
  diagnostics.lineCount = ocrResult.pages.reduce((sum, page) => sum + page.lines.length, 0);

  const ocrByPage = new Map(ocrResult.pages.map((page) => [page.pageNumber, page]));

  const enrichedPages = pages.map((page) => {
    const ocrPage = ocrByPage.get(page.pageNumber);
    if (!ocrPage || page.hasEmbeddedText) return page;

    const rawText = ocrPage.fullText.trim();
    if (rawText.length === 0) return page;

    const normalizedText = normalizeText(rawText);
    const { classification, confidence } = classifyPage(normalizedText, page.pageNumber);

    diagnostics.enrichedPageCount += 1;

    return {
      ...page,
      rawText,
      normalizedText,
      charCount: rawText.length,
      hasOcrText: true,
      textSource: "ocr" as const,
      ocrConfidence: ocrPage.confidence,
      ocrLines: ocrPage.lines,
      classification,
      classificationConfidence: confidence,
    };
  });

  logOcrDiagnostics(diagnostics);
  return { pages: enrichedPages, diagnostics };
}

export function packetHasOcrText(pages: PageAnalysis[]): boolean {
  return pages.some((page) => Boolean(page.hasOcrText));
}

export function pageHasUsableText(page: PageAnalysis): boolean {
  return page.hasEmbeddedText || Boolean(page.hasOcrText);
}

export function deriveExtractionMode(pages: PageAnalysis[]): "embedded_text" | "image_only" | "mixed" {
  const usable = pages.map(pageHasUsableText);
  if (!usable.some(Boolean)) return "image_only";
  if (usable.every(Boolean)) return "embedded_text";
  return "mixed";
}

export function ocrConfidenceForPage(page: PageAnalysis | undefined): ReturnType<typeof pageTextConfidence> {
  if (!page) return "low";
  if (page.hasEmbeddedText) {
    return pageTextConfidence(page.charCount, true);
  }
  if (page.hasOcrText) {
    return page.ocrConfidence ?? pageTextConfidence(page.charCount, false);
  }
  return "low";
}
