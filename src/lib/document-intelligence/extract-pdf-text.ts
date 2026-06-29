import { extractText, getDocumentProxy } from "unpdf";
import type { PageAnalysis } from "./types";
import { pageTextConfidence } from "./confidence";
import { classifyPage } from "./classify-pages";
import type { OcrProvider } from "./ocr";
import { enrichPagesWithOcr } from "./ocr";

const MIN_TEXT_CHARS = 20;

export interface ExtractPdfOptions {
  ocrProvider?: OcrProvider | null;
  fileName?: string;
}

export async function extractPdfPages(
  pdfBuffer: ArrayBuffer,
  options?: ExtractPdfOptions
): Promise<{
  pages: PageAnalysis[];
  pageCount: number;
  fullText: string;
  hasEmbeddedText: boolean;
  hasOcrText: boolean;
}> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];

  const pages: PageAnalysis[] = [];
  let anyText = false;

  for (let i = 0; i < totalPages; i++) {
    const rawText = (pageTexts[i] ?? "").trim();
    const hasEmbeddedText = rawText.length >= MIN_TEXT_CHARS;
    if (hasEmbeddedText) anyText = true;

    const normalizedText = normalizeText(rawText);
    const { classification, confidence } = classifyPage(normalizedText, i + 1);

    pages.push({
      pageNumber: i + 1,
      rawText,
      normalizedText,
      charCount: rawText.length,
      hasEmbeddedText,
      textSource: hasEmbeddedText ? "embedded" : "none",
      classification,
      classificationConfidence: hasEmbeddedText
        ? confidence
        : pageTextConfidence(rawText.length, false),
    });
  }

  const ocrProvider = options?.ocrProvider;
  if (!ocrProvider?.isAvailable()) {
    return {
      pages,
      pageCount: totalPages,
      fullText: pages.map((p) => p.rawText).join("\n\n"),
      hasEmbeddedText: anyText,
      hasOcrText: false,
    };
  }

  const { pages: enrichedPages } = await enrichPagesWithOcr(
    pages,
    options?.fileName ?? "document.pdf",
    ocrProvider,
    pdfBuffer
  );

  return {
    pages: enrichedPages,
    pageCount: totalPages,
    fullText: enrichedPages.map((p) => p.rawText).join("\n\n"),
    hasEmbeddedText: anyText,
    hasOcrText: enrichedPages.some((p) => Boolean(p.hasOcrText)),
  };
}

export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .trim()
    .toLowerCase();
}
