import type { ConfidenceLevel } from "../types";
import type { OcrBoundingBox, OcrPageResult, OcrResult, OcrSelectionMark, OcrTextLine } from "./types";

export interface AzureDocumentSpan {
  offset: number;
  length: number;
}

export interface AzureDocumentWord {
  content: string;
  polygon?: number[];
  confidence?: number;
  span?: AzureDocumentSpan;
}

export interface AzureDocumentLine {
  content: string;
  polygon?: number[];
  spans?: AzureDocumentSpan[];
}

export interface AzureSelectionMark {
  state: "selected" | "unselected";
  polygon?: number[];
  confidence?: number;
  span?: AzureDocumentSpan;
}

export interface AzureDocumentPage {
  pageNumber: number;
  width?: number;
  height?: number;
  unit?: string;
  lines?: AzureDocumentLine[];
  words?: AzureDocumentWord[];
  selectionMarks?: AzureSelectionMark[];
}

export interface AzureAnalyzeResult {
  content?: string;
  pages?: AzureDocumentPage[];
}

export interface AzureAnalyzeOperationOutput {
  status: "notStarted" | "running" | "succeeded" | "failed" | "canceled";
  analyzeResult?: AzureAnalyzeResult;
  error?: { message?: string };
}

export function mapAzureConfidence(confidence?: number): ConfidenceLevel {
  if (confidence === undefined || Number.isNaN(confidence)) return "medium";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

function polygonToBoundingBox(
  polygon: number[] | undefined,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number
): OcrBoundingBox | undefined {
  if (!polygon?.length || polygon.length < 8) return undefined;
  if (pageWidth <= 0 || pageHeight <= 0) return undefined;

  const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
  const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    page: pageNumber,
    x: minX / pageWidth,
    y: minY / pageHeight,
    width: (maxX - minX) / pageWidth,
    height: (maxY - minY) / pageHeight,
  };
}

function averageWordConfidenceForSpan(
  words: AzureDocumentWord[] | undefined,
  span?: AzureDocumentSpan
): number | undefined {
  if (!words?.length || !span) return undefined;

  const matches = words.filter((word) => {
    if (!word.span) return false;
    const wordStart = word.span.offset;
    const wordEnd = word.span.offset + word.span.length;
    const spanStart = span.offset;
    const spanEnd = span.offset + span.length;
    return wordStart < spanEnd && wordEnd > spanStart;
  });

  if (!matches.length) return undefined;
  const total = matches.reduce((sum, word) => sum + (word.confidence ?? 0), 0);
  return total / matches.length;
}

function mapAzureLine(
  line: AzureDocumentLine,
  page: AzureDocumentPage
): OcrTextLine {
  const pageWidth = page.width ?? 1;
  const pageHeight = page.height ?? 1;
  const span = line.spans?.[0];
  const confidence = mapAzureConfidence(
    averageWordConfidenceForSpan(page.words, span)
  );

  return {
    text: line.content,
    confidence,
    boundingBox: polygonToBoundingBox(line.polygon, page.pageNumber, pageWidth, pageHeight),
  };
}

function mapAzureSelectionMark(
  mark: AzureSelectionMark,
  page: AzureDocumentPage
): OcrSelectionMark {
  const pageWidth = page.width ?? 1;
  const pageHeight = page.height ?? 1;

  return {
    state: mark.state,
    confidence: mapAzureConfidence(mark.confidence),
    boundingBox: polygonToBoundingBox(mark.polygon, page.pageNumber, pageWidth, pageHeight),
  };
}

function mapAzurePage(page: AzureDocumentPage): OcrPageResult {
  const lines = (page.lines ?? []).map((line) => mapAzureLine(line, page));
  const selectionMarks = (page.selectionMarks ?? []).map((mark) =>
    mapAzureSelectionMark(mark, page)
  );
  const confidences = lines.map((line) => line.confidence);
  const pageConfidence: ConfidenceLevel =
    confidences.includes("low")
      ? "low"
      : confidences.includes("medium")
        ? "medium"
        : confidences.length
          ? "high"
          : "low";

  return {
    pageNumber: page.pageNumber,
    fullText: lines.map((line) => line.text).join("\n"),
    lines,
    confidence: pageConfidence,
    selectionMarks: selectionMarks.length ? selectionMarks : undefined,
  };
}

export function mapAzureAnalyzeResultToOcrResult(
  analyzeResult: AzureAnalyzeResult,
  requestedPageNumbers: number[]
): OcrResult {
  const requested = new Set(requestedPageNumbers);
  const pages = (analyzeResult.pages ?? [])
    .filter((page) => requested.has(page.pageNumber))
    .map(mapAzurePage)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  return {
    provider: "azure",
    pages,
  };
}

export function formatAzurePagesQuery(pageNumbers: number[]): string {
  if (!pageNumbers.length) return "1";
  const sorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    rangeStart = current;
    previous = current;
  }

  ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
  return ranges.join(",");
}
