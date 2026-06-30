import type { ReviewBlobReviewRequest, UploadUrlRequest } from "@/lib/review-request-types";
import { isAllowedBlobName } from "@/lib/azure-blob-storage";
import {
  isPdfFileName,
  isPdfMimeType,
  isPdfWithinSizeLimit,
} from "@/lib/upload-security";

export type {
  ReviewBlobReviewRequest,
  UploadConfigResponse,
  UploadUrlRequest,
  UploadUrlResponse,
} from "@/lib/review-request-types";

export function parseUploadUrlRequest(body: unknown): UploadUrlRequest | null {
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const filename = record.filename;
  const contentType = record.contentType;
  const size = record.size;

  if (typeof filename !== "string" || filename.trim().length === 0) return null;
  if (typeof contentType !== "string" || contentType.trim().length === 0) return null;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;

  return {
    filename: filename.trim(),
    contentType: contentType.trim(),
    size,
  };
}

export function validateUploadUrlRequest(request: UploadUrlRequest): string | null {
  if (!isPdfFileName(request.filename)) {
    return "File must be a PDF.";
  }

  if (!isPdfMimeType(request.contentType)) {
    return "File must be a PDF.";
  }

  if (!isPdfWithinSizeLimit(request.size)) {
    return "File size must not exceed 25 MB.";
  }

  return null;
}

export function parseReviewBlobRequest(body: unknown): ReviewBlobReviewRequest | null {
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const blobName = record.blobName;
  const originalFilename = record.originalFilename;

  if (typeof blobName !== "string" || blobName.trim().length === 0) return null;
  if (typeof originalFilename !== "string" || originalFilename.trim().length === 0) return null;

  const trimmedBlobName = blobName.trim();
  if (!isAllowedBlobName(trimmedBlobName)) return null;
  if (!isPdfFileName(originalFilename.trim())) return null;

  return {
    blobName: trimmedBlobName,
    originalFilename: originalFilename.trim(),
  };
}
