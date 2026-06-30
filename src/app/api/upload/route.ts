import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  AZURE_BLOB_STORAGE_SETUP_ERROR,
  buildReviewBlobReference,
  isAzureBlobStorageConfigured,
  uploadPdfToAzureBlob,
} from "@/lib/azure-blob-storage";
import { requireAuthenticatedReviewAccess } from "@/lib/review-auth";
import { createReviewErrorResponse } from "@/lib/review-route-errors";
import type { UploadPdfResponse } from "@/lib/review-request-types";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  isPdfBuffer,
  isPdfFile,
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE_ERROR,
  sanitizeFileName,
} from "@/lib/upload-security";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const authError = await requireAuthenticatedReviewAccess();
  if (authError) return authError;

  return NextResponse.json({
    blobStorageConfigured: isAzureBlobStorageConfigured(),
    directUploadMaxBytes: DIRECT_UPLOAD_MAX_BYTES,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const authError = await requireAuthenticatedReviewAccess();
  if (authError) return authError;

  if (!isAzureBlobStorageConfigured()) {
    return NextResponse.json({ error: AZURE_BLOB_STORAGE_SETUP_ERROR }, { status: 503 });
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      return createReviewErrorResponse(error, { stage: "read-form-data", requestId });
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No PDF file provided." }, { status: 400 });
    }

    if (!isPdfFile(file)) {
      return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
    }

    if (!isPdfWithinSizeLimit(file.size)) {
      return NextResponse.json({ error: MAX_PDF_SIZE_ERROR }, { status: 413 });
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (error) {
      return createReviewErrorResponse(error, { stage: "read-file-buffer", requestId });
    }

    if (!isPdfBuffer(arrayBuffer)) {
      return NextResponse.json({ error: "File must be a valid PDF." }, { status: 400 });
    }

    const fileName = sanitizeFileName(file.name);
    const blobReference = buildReviewBlobReference(fileName);

    await uploadPdfToAzureBlob(arrayBuffer, blobReference, requestId);

    const response: UploadPdfResponse = {
      blobReference,
      fileName,
      fileSize: arrayBuffer.byteLength,
    };

    return NextResponse.json(response);
  } catch (error) {
    return createReviewErrorResponse(error, { stage: "azure-upload", requestId });
  }
}
