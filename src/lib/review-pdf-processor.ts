import { runDocumentIntelligence } from "@/lib/document-intelligence";
import { resolveOcrProvider } from "@/lib/document-intelligence/ocr/resolve-ocr-provider";
import type { ReviewResult } from "@/lib/validation/types";
import {
  isPdfBuffer,
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE_ERROR,
  sanitizeFileName,
} from "@/lib/upload-security";

export class ReviewPdfValidationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ReviewPdfValidationError";
    this.status = status;
  }
}

export async function processReviewPdf(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ReviewResult> {
  if (!isPdfWithinSizeLimit(arrayBuffer.byteLength)) {
    throw new ReviewPdfValidationError(MAX_PDF_SIZE_ERROR, 413);
  }

  if (!isPdfBuffer(arrayBuffer)) {
    throw new ReviewPdfValidationError("File must be a valid PDF.", 400);
  }

  const ocrProvider = resolveOcrProvider();
  return runDocumentIntelligence(arrayBuffer, sanitizeFileName(fileName), undefined, {
    ocrProvider,
  });
}
