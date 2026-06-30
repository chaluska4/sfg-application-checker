import { NextResponse } from "next/server";
import { sanitizeOcrError } from "@/lib/document-intelligence/ocr/ocr-dev-log";
import { MAX_PDF_SIZE_ERROR } from "@/lib/upload-security";

interface StatusError extends Error {
  status: number;
}

function isStatusError(error: unknown): error is StatusError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof (error as StatusError).status === "number"
  );
}

export type ReviewErrorKind =
  | "payload_too_large"
  | "timeout"
  | "invalid_pdf"
  | "azure"
  | "ocr"
  | "blob_storage"
  | "processing"
  | "unknown";

export interface ReviewErrorDetails {
  kind: ReviewErrorKind;
  status: number;
  clientMessage: string;
}

const PAYLOAD_TOO_LARGE_PATTERNS = [
  /request entity too large/i,
  /payload too large/i,
  /body exceeded/i,
  /body size limit/i,
  /body too large/i,
  /content.?length/i,
  /413/,
  /max.*body/i,
];

const TIMEOUT_PATTERNS = [
  /timed?\s*out/i,
  /timeout/i,
  /deadline exceeded/i,
  /function_invocation_timeout/i,
  /maxduration/i,
];

const INVALID_PDF_PATTERNS = [
  /invalid pdf/i,
  /failed to parse/i,
  /not a valid pdf/i,
  /password protected/i,
  /encrypted pdf/i,
];

const AZURE_PATTERNS = [/azure document intelligence/i, /operation-location/i];

const OCR_PATTERNS = [/\bocr\b/i, /recognize request failed/i];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function classifyReviewError(error: unknown): ReviewErrorDetails {
  const message = errorMessage(error);

  if (matchesAny(message, PAYLOAD_TOO_LARGE_PATTERNS)) {
    return {
      kind: "payload_too_large",
      status: 413,
      clientMessage: MAX_PDF_SIZE_ERROR,
    };
  }

  if (matchesAny(message, TIMEOUT_PATTERNS)) {
    return {
      kind: "timeout",
      status: 504,
      clientMessage:
        "The review took too long to complete. Try a smaller PDF or try again in a moment.",
    };
  }

  if (matchesAny(message, INVALID_PDF_PATTERNS)) {
    return {
      kind: "invalid_pdf",
      status: 400,
      clientMessage: "File must be a valid PDF.",
    };
  }

  if (matchesAny(message, AZURE_PATTERNS)) {
    return {
      kind: "azure",
      status: 502,
      clientMessage:
        "Document text recognition is temporarily unavailable. The review will continue with manual verification where needed.",
    };
  }

  if (matchesAny(message, OCR_PATTERNS)) {
    return {
      kind: "ocr",
      status: 502,
      clientMessage:
        "Document text recognition failed. The review will continue with manual verification where needed.",
    };
  }

  return {
    kind: "processing",
    status: 500,
    clientMessage: "Failed to process PDF. Please ensure the file is a valid PDF and try again.",
  };
}

export function logReviewRouteError(
  details: ReviewErrorDetails,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const sanitized = sanitizeOcrError(error);
  console.error("[sfg-review] Review processing failed", {
    kind: details.kind,
    status: details.status,
    message: sanitized,
    ...context,
  });
}

export function createReviewErrorResponse(
  error: unknown,
  context?: Record<string, unknown>
): NextResponse<{ error: string }> {
  if (isStatusError(error)) {
    const kind =
      error.name === "BlobStorageError"
        ? "blob_storage"
        : error.status === 413
          ? "payload_too_large"
          : "invalid_pdf";

    logReviewRouteError(
      { kind, status: error.status, clientMessage: error.message },
      error,
      context
    );
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const details = classifyReviewError(error);
  logReviewRouteError(details, error, context);
  return NextResponse.json({ error: details.clientMessage }, { status: details.status });
}

export function createReviewPayloadTooLargeResponse(): NextResponse<{ error: string }> {
  const details: ReviewErrorDetails = {
    kind: "payload_too_large",
    status: 413,
    clientMessage: MAX_PDF_SIZE_ERROR,
  };
  logReviewRouteError(details, new Error("Request payload too large"), { source: "review-route" });
  return NextResponse.json({ error: details.clientMessage }, { status: details.status });
}
