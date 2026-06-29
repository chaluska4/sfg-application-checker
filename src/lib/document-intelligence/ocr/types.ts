import type { ConfidenceLevel } from "../types";

/** Normalized axis-aligned box in page coordinates (0–1 relative to page width/height). */
export interface OcrBoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrTextLine {
  text: string;
  confidence: ConfidenceLevel;
  boundingBox?: OcrBoundingBox;
}

export interface OcrPageResult {
  pageNumber: number;
  fullText: string;
  lines: OcrTextLine[];
  confidence: ConfidenceLevel;
}

export interface OcrResult {
  provider: string;
  pages: OcrPageResult[];
}

export interface OcrPageRequest {
  pageNumber: number;
  /** Present for future raster-based providers; mock providers may ignore. */
  imageData?: Uint8Array;
}

export interface OcrRecognizeRequest {
  fileName: string;
  pages: OcrPageRequest[];
}
