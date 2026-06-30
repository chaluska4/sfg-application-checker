import type { PageAnalysis } from "../types";
import { enrichPageWithClassification } from "../classify-pages";
import { normalizeText } from "../extract-pdf-text";
import { pageTextConfidence } from "../confidence";
import type { OcrProvider } from "./ocr-provider";
import type { OcrBoundingBox, OcrTextLine } from "./types";
import { clonePdfArrayBuffer } from "@/lib/pdf-buffer";
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

function shouldOcrAllPages(provider: OcrProvider): boolean {
  return provider.name === "azure";
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

  const ocrAllPages = shouldOcrAllPages(provider);
  const ocrCandidates = ocrAllPages ? pages : pages.filter((page) => !page.hasEmbeddedText);
  diagnostics.candidatePageCount = ocrCandidates.length;

  if (ocrCandidates.length === 0) {
    logOcrDiagnostics(diagnostics);
    return { pages, diagnostics };
  }

  diagnostics.attempted = true;

  let ocrResult;
  try {
    const ocrPdfBuffer = pdfBuffer ? clonePdfArrayBuffer(pdfBuffer) : undefined;
    ocrResult = await provider.recognize({
      fileName,
      pages: ocrCandidates.map((page) => ({ pageNumber: page.pageNumber })),
      pdfBuffer: ocrPdfBuffer,
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
    if (!ocrPage) return page;

    const ocrRawText = ocrPage.fullText.trim();
    const useOcrAsPrimary = !page.hasEmbeddedText && ocrRawText.length > 0;
    const rawText = useOcrAsPrimary ? ocrRawText : page.rawText;
    const normalizedText = normalizeText(rawText);
    const classified = enrichPageWithClassification(
      {
        ...page,
        rawText,
        normalizedText,
        charCount: rawText.length,
        hasOcrText: ocrRawText.length > 0 || Boolean(page.hasOcrText),
        textSource: useOcrAsPrimary ? ("ocr" as const) : page.textSource ?? (page.hasEmbeddedText ? "embedded" : "none"),
        ocrConfidence: ocrPage.confidence,
        ocrLines: ocrPage.lines,
        ocrSelectionMarks: ocrPage.selectionMarks,
      },
      normalizedText
    );

    if (useOcrAsPrimary) diagnostics.enrichedPageCount += 1;

    return {
      ...classified,
      classification:
        useOcrAsPrimary || page.classification === "unknown"
          ? classified.classification
          : page.classification,
      classificationConfidence: useOcrAsPrimary
        ? classified.classificationConfidence
        : page.classificationConfidence,
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
