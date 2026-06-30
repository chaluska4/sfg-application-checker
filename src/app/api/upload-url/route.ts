import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  AZURE_BLOB_STORAGE_SETUP_ERROR,
  createBlobUploadSasUrl,
  generateBlobName,
  isAzureBlobStorageConfigured,
} from "@/lib/azure-blob-storage";
import { requireAuthenticatedReviewAccess } from "@/lib/review-auth";
import { createReviewErrorResponse } from "@/lib/review-route-errors";
import {
  parseUploadUrlRequest,
  validateUploadUrlRequest,
} from "@/lib/review-request";
import type { UploadUrlResponse } from "@/lib/review-request-types";
import { DIRECT_UPLOAD_MAX_BYTES } from "@/lib/upload-security";

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
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      return createReviewErrorResponse(error, { stage: "parse-json", requestId });
    }

    const uploadRequest = parseUploadUrlRequest(body);
    if (!uploadRequest) {
      return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
    }

    const validationError = validateUploadUrlRequest(uploadRequest);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const blobName = generateBlobName(uploadRequest.filename);
    const uploadUrl = createBlobUploadSasUrl(blobName, uploadRequest.contentType, requestId);

    const response: UploadUrlResponse = {
      uploadUrl,
      blobName,
    };

    return NextResponse.json(response);
  } catch (error) {
    return createReviewErrorResponse(error, { stage: "create-upload-sas", requestId });
  }
}
