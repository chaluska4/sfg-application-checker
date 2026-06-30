import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  AZURE_BLOB_STORAGE_SETUP_ERROR,
  deleteAzureReviewBlob,
  downloadPdfFromAzureBlob,
  isAzureBlobStorageConfigured,
} from "@/lib/azure-blob-storage";
import { logAzureBlobEvent } from "@/lib/azure-blob-log";
import { requireAuthenticatedReviewAccess } from "@/lib/review-auth";
import { processReviewPdf } from "@/lib/review-pdf-processor";
import { parseReviewBlobReference } from "@/lib/review-request";
import { createReviewErrorResponse } from "@/lib/review-route-errors";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  isPdfFile,
  isPdfFileName,
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE_ERROR,
} from "@/lib/upload-security";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authError = await requireAuthenticatedReviewAccess();
  if (authError) return authError;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return handleBlobReviewRequest(request);
  }

  return handleDirectReviewRequest(request);
}

async function handleBlobReviewRequest(request: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  let blobReference: string | null = null;
  const startedAt = Date.now();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      return createReviewErrorResponse(error, { stage: "parse-json", requestId });
    }

    const reference = parseReviewBlobReference(body);
    if (!reference) {
      return NextResponse.json({ error: "Invalid review request." }, { status: 400 });
    }

    if (!isAzureBlobStorageConfigured()) {
      return NextResponse.json({ error: AZURE_BLOB_STORAGE_SETUP_ERROR }, { status: 503 });
    }

    if (!isPdfWithinSizeLimit(reference.fileSize)) {
      return NextResponse.json({ error: MAX_PDF_SIZE_ERROR }, { status: 413 });
    }

    if (!isPdfFileName(reference.fileName)) {
      return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
    }

    blobReference = reference.blobReference;
    const arrayBuffer = await downloadPdfFromAzureBlob(blobReference, requestId);
    const result = await processReviewPdf(arrayBuffer, reference.fileName);

    logAzureBlobEvent({
      requestId,
      action: "review",
      success: true,
      fileSizeBytes: reference.fileSize,
      pageCount: result.pageCount,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result);
  } catch (error) {
    logAzureBlobEvent({
      requestId,
      action: "review",
      success: false,
      durationMs: Date.now() - startedAt,
      error,
    });
    return createReviewErrorResponse(error, { stage: "blob-review", requestId });
  } finally {
    if (blobReference) {
      await deleteAzureReviewBlob(blobReference, requestId);
    }
  }
}

async function handleDirectReviewRequest(request: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

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

    if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        {
          error: isAzureBlobStorageConfigured()
            ? "This PDF is too large for direct upload. Use the application upload flow."
            : AZURE_BLOB_STORAGE_SETUP_ERROR,
        },
        { status: 413 }
      );
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (error) {
      return createReviewErrorResponse(error, { stage: "read-file-buffer", requestId });
    }

    const result = await processReviewPdf(arrayBuffer, file.name);
    return NextResponse.json(result);
  } catch (error) {
    return createReviewErrorResponse(error, { stage: "direct-review", requestId });
  }
}
