import type { ReviewResult } from "@/lib/validation/types";
import { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";
import type { UploadPdfResponse } from "@/lib/review-request-types";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  MAX_PDF_SIZE_ERROR,
  shouldUseBlobUpload,
} from "@/lib/upload-security";

export class ReviewApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewApiError";
  }
}

export interface UploadConfigResponse {
  blobStorageConfigured: boolean;
  directUploadMaxBytes: number;
}

function isJsonContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes("application/json");
}

export function getFriendlyReviewHttpError(status: number, bodyText: string): string {
  const normalized = bodyText.trim();

  if (
    status === 413 ||
    /request entity too large/i.test(normalized) ||
    /payload too large/i.test(normalized)
  ) {
    return MAX_PDF_SIZE_ERROR;
  }

  if (status === 401) {
    return "Your session has expired. Please sign in and try again.";
  }

  if (status === 503 && /azure blob storage/i.test(normalized)) {
    return AZURE_BLOB_STORAGE_SETUP_ERROR;
  }

  if (status === 504 || /timed?\s*out/i.test(normalized) || /timeout/i.test(normalized)) {
    return "The review took too long to complete. Try a smaller PDF or try again in a moment.";
  }

  if (status === 502) {
    return "The review service is temporarily unavailable. Please try again shortly.";
  }

  if (normalized.length > 0 && normalized.length <= 200 && !/^</.test(normalized)) {
    return normalized;
  }

  if (status >= 500) {
    return "The server could not process your PDF. Please try again later.";
  }

  return "Review failed. Please try again.";
}

async function readJsonError(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim().length > 0) {
      return data.error;
    }
  } catch {
    // Fall through to status-based messaging.
  }
  return undefined;
}

export async function readReviewApiError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (isJsonContentType(contentType)) {
    const jsonError = await readJsonError(response);
    if (jsonError) return jsonError;
  } else {
    const text = await response.text();
    return getFriendlyReviewHttpError(response.status, text);
  }

  return getFriendlyReviewHttpError(response.status, "");
}

export async function parseReviewApiResponse(response: Response): Promise<ReviewResult> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    throw new ReviewApiError(await readReviewApiError(response));
  }

  if (!isJsonContentType(contentType)) {
    const text = await response.text();
    throw new ReviewApiError(getFriendlyReviewHttpError(response.status, text));
  }

  try {
    return (await response.json()) as ReviewResult;
  } catch {
    throw new ReviewApiError(
      "Received an invalid response from the server. Please try again."
    );
  }
}

async function fetchUploadConfig(): Promise<UploadConfigResponse> {
  const response = await fetch("/api/upload", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ReviewApiError(await readReviewApiError(response));
  }

  return (await response.json()) as UploadConfigResponse;
}

async function parseUploadResponse(response: Response): Promise<UploadPdfResponse> {
  if (!response.ok) {
    throw new ReviewApiError(await readReviewApiError(response));
  }

  const data = (await response.json()) as UploadPdfResponse;
  if (
    typeof data.blobReference !== "string" ||
    typeof data.fileName !== "string" ||
    typeof data.fileSize !== "number"
  ) {
    throw new ReviewApiError("Received an invalid upload response. Please try again.");
  }

  return data;
}

async function submitReviewPdfDirect(file: File): Promise<ReviewResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/review", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  return parseReviewApiResponse(response);
}

async function submitReviewPdfViaAzureBlob(file: File): Promise<ReviewResult> {
  const config = await fetchUploadConfig();
  if (!config.blobStorageConfigured) {
    throw new ReviewApiError(AZURE_BLOB_STORAGE_SETUP_ERROR);
  }

  const uploadFormData = new FormData();
  uploadFormData.append("file", file);

  const uploadResponse = await fetch("/api/upload", {
    method: "POST",
    body: uploadFormData,
    credentials: "include",
  });

  const uploadData = await parseUploadResponse(uploadResponse);

  const reviewResponse = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      blobReference: uploadData.blobReference,
      fileName: uploadData.fileName,
      fileSize: uploadData.fileSize,
    }),
  });

  return parseReviewApiResponse(reviewResponse);
}

export async function submitReviewPdf(file: File): Promise<ReviewResult> {
  if (shouldUseBlobUpload(file.size)) {
    return submitReviewPdfViaAzureBlob(file);
  }

  return submitReviewPdfDirect(file);
}

export { DIRECT_UPLOAD_MAX_BYTES, shouldUseBlobUpload };
