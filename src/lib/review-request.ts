import type { ReviewBlobReference } from "@/lib/review-request-types";
import { isAllowedBlobReference } from "@/lib/azure-blob-storage";

export type { ReviewBlobReference, UploadPdfResponse } from "@/lib/review-request-types";

export function parseReviewBlobReference(body: unknown): ReviewBlobReference | null {
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const blobReference = record.blobReference;
  const fileName = record.fileName;
  const fileSize = record.fileSize;

  if (typeof blobReference !== "string" || blobReference.trim().length === 0) return null;
  if (typeof fileName !== "string" || fileName.trim().length === 0) return null;
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0) return null;

  const trimmedReference = blobReference.trim();
  if (!isAllowedBlobReference(trimmedReference)) return null;

  return {
    blobReference: trimmedReference,
    fileName: fileName.trim(),
    fileSize,
  };
}
