import { randomUUID } from "crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { logAzureBlobEvent } from "@/lib/azure-blob-log";
import {
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE,
  MAX_PDF_SIZE_ERROR,
  sanitizeFileName,
} from "@/lib/upload-security";

import { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";

export { AZURE_BLOB_STORAGE_SETUP_ERROR };
const BLOB_REFERENCE_PATTERN = /^reviews\/[0-9a-f-]{36}-[a-zA-Z0-9._-]+\.pdf$/i;

export class BlobStorageError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "BlobStorageError";
    this.status = status;
  }
}

export interface AzureStorageEnv {
  connectionString: string;
  containerName: string;
}

export function readAzureStorageEnv(): AzureStorageEnv {
  return {
    connectionString: (process.env["AZURE_STORAGE_CONNECTION_STRING"] ?? "").trim(),
    containerName: (process.env["AZURE_STORAGE_CONTAINER_NAME"] ?? "").trim(),
  };
}

export function isAzureBlobStorageConfigured(): boolean {
  const env = readAzureStorageEnv();
  return env.connectionString.length > 0 && env.containerName.length > 0;
}

/** @deprecated Use isAzureBlobStorageConfigured */
export const isBlobStorageConfigured = isAzureBlobStorageConfigured;

export function isAllowedBlobReference(blobReference: string): boolean {
  if (!blobReference.startsWith("reviews/")) return false;
  if (blobReference.includes("..")) return false;
  if (blobReference.includes("\\")) return false;
  if (blobReference.includes("/")) {
    const segments = blobReference.split("/");
    if (segments.length !== 2 || segments[0] !== "reviews") return false;
  }
  return BLOB_REFERENCE_PATTERN.test(blobReference);
}

export function buildReviewBlobReference(fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const baseName = sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
  return `reviews/${randomUUID()}-${baseName}`;
}

function getContainerClient() {
  if (!isAzureBlobStorageConfigured()) {
    throw new BlobStorageError(AZURE_BLOB_STORAGE_SETUP_ERROR, 503);
  }

  const env = readAzureStorageEnv();
  const serviceClient = BlobServiceClient.fromConnectionString(env.connectionString);
  return serviceClient.getContainerClient(env.containerName);
}

export async function uploadPdfToAzureBlob(
  buffer: ArrayBuffer,
  blobReference: string,
  requestId: string
): Promise<void> {
  if (!isAllowedBlobReference(blobReference)) {
    throw new BlobStorageError("Invalid blob reference.", 400);
  }

  if (!isPdfWithinSizeLimit(buffer.byteLength)) {
    throw new BlobStorageError(MAX_PDF_SIZE_ERROR, 413);
  }

  const startedAt = Date.now();

  try {
    const containerClient = getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobReference);
    const body = Buffer.from(buffer);

    await blockBlobClient.upload(body, body.length, {
      blobHTTPHeaders: {
        blobContentType: "application/pdf",
      },
    });

    logAzureBlobEvent({
      requestId,
      action: "upload",
      success: true,
      fileSizeBytes: buffer.byteLength,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logAzureBlobEvent({
      requestId,
      action: "upload",
      success: false,
      fileSizeBytes: buffer.byteLength,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw new BlobStorageError("Could not store the uploaded PDF.", 502);
  }
}

export async function downloadPdfFromAzureBlob(
  blobReference: string,
  requestId: string
): Promise<ArrayBuffer> {
  if (!isAllowedBlobReference(blobReference)) {
    throw new BlobStorageError("Invalid blob reference.", 400);
  }

  const startedAt = Date.now();

  try {
    const containerClient = getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobReference);
    const properties = await blockBlobClient.getProperties();

    if (typeof properties.contentLength === "number" && properties.contentLength > MAX_PDF_SIZE) {
      throw new BlobStorageError(MAX_PDF_SIZE_ERROR, 413);
    }

    const contentType = (properties.contentType ?? "").toLowerCase();
    if (
      contentType.length > 0 &&
      !contentType.includes("application/pdf") &&
      !contentType.includes("application/octet-stream")
    ) {
      throw new BlobStorageError("File must be a PDF.", 400);
    }

    const downloadResponse = await blockBlobClient.download(0);
    if (!downloadResponse.readableStreamBody) {
      throw new BlobStorageError("Could not retrieve the uploaded PDF.", 502);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    if (!isPdfWithinSizeLimit(buffer.byteLength)) {
      throw new BlobStorageError(MAX_PDF_SIZE_ERROR, 413);
    }

    logAzureBlobEvent({
      requestId,
      action: "download",
      success: true,
      fileSizeBytes: buffer.byteLength,
      durationMs: Date.now() - startedAt,
    });

    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    if (error instanceof BlobStorageError) {
      logAzureBlobEvent({
        requestId,
        action: "download",
        success: false,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }

    logAzureBlobEvent({
      requestId,
      action: "download",
      success: false,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw new BlobStorageError("Could not retrieve the uploaded PDF.", 502);
  }
}

export async function deleteAzureReviewBlob(
  blobReference: string,
  requestId: string
): Promise<void> {
  if (!isAzureBlobStorageConfigured() || !isAllowedBlobReference(blobReference)) {
    return;
  }

  const startedAt = Date.now();

  try {
    const containerClient = getContainerClient();
    await containerClient.getBlockBlobClient(blobReference).deleteIfExists();

    logAzureBlobEvent({
      requestId,
      action: "delete",
      success: true,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logAzureBlobEvent({
      requestId,
      action: "delete",
      success: false,
      durationMs: Date.now() - startedAt,
      error,
    });
  }
}
