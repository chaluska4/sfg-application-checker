import { randomUUID } from "crypto";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import {
  AZURE_BLOB_DOWNLOAD_ERROR,
  AZURE_BLOB_STORAGE_SETUP_ERROR,
  AZURE_SAS_CREATION_ERROR,
} from "@/lib/azure-blob-messages";
import { logAzureBlobEvent } from "@/lib/azure-blob-log";
import {
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE,
  MAX_PDF_SIZE_ERROR,
  sanitizeFileName,
} from "@/lib/upload-security";

export { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";

const BLOB_NAME_PATTERN = /^reviews\/[0-9a-f-]{36}-[a-zA-Z0-9._-]+\.pdf$/i;
const SAS_UPLOAD_TTL_MS = 10 * 60 * 1000;

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

export function isAllowedBlobName(blobName: string): boolean {
  if (!blobName.startsWith("reviews/")) return false;
  if (blobName.includes("..")) return false;
  if (blobName.includes("\\")) return false;

  const segments = blobName.split("/");
  if (segments.length !== 2 || segments[0] !== "reviews") return false;

  return BLOB_NAME_PATTERN.test(blobName);
}

/** @deprecated Use isAllowedBlobName */
export const isAllowedBlobReference = isAllowedBlobName;

export function sanitizeBlobName(fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const baseName = sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
  return `reviews/${randomUUID()}-${baseName}`;
}

/** @deprecated Use sanitizeBlobName */
export const buildReviewBlobReference = sanitizeBlobName;

function parseConnectionStringValue(connectionString: string, key: string): string {
  for (const part of connectionString.split(";")) {
    if (!part) continue;
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const partKey = part.slice(0, separatorIndex);
    if (partKey === key) {
      return part.slice(separatorIndex + 1);
    }
  }
  return "";
}

function getSharedKeyCredential(): StorageSharedKeyCredential {
  const { connectionString } = readAzureStorageEnv();
  const accountName = parseConnectionStringValue(connectionString, "AccountName");
  const accountKey = parseConnectionStringValue(connectionString, "AccountKey");

  if (!accountName || !accountKey) {
    throw new BlobStorageError(AZURE_BLOB_STORAGE_SETUP_ERROR, 503);
  }

  return new StorageSharedKeyCredential(accountName, accountKey);
}

function getContainerClient() {
  if (!isAzureBlobStorageConfigured()) {
    throw new BlobStorageError(AZURE_BLOB_STORAGE_SETUP_ERROR, 503);
  }

  const env = readAzureStorageEnv();
  const serviceClient = BlobServiceClient.fromConnectionString(env.connectionString);
  return serviceClient.getContainerClient(env.containerName);
}

export function createBlobUploadSasUrl(
  blobName: string,
  contentType: string,
  requestId: string
): string {
  if (!isAllowedBlobName(blobName)) {
    throw new BlobStorageError("Invalid blob name.", 400);
  }

  const startedAt = Date.now();

  try {
    const env = readAzureStorageEnv();
    const credential = getSharedKeyCredential();
    const containerClient = getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const expiresOn = new Date(Date.now() + SAS_UPLOAD_TTL_MS);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: env.containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"),
        expiresOn,
        contentType,
      },
      credential
    ).toString();

    logAzureBlobEvent({
      requestId,
      action: "sas-create",
      success: true,
      durationMs: Date.now() - startedAt,
    });

    return `${blockBlobClient.url}?${sasToken}`;
  } catch (error) {
    logAzureBlobEvent({
      requestId,
      action: "sas-create",
      success: false,
      durationMs: Date.now() - startedAt,
      error,
    });

    if (error instanceof BlobStorageError) {
      throw error;
    }

    throw new BlobStorageError(AZURE_SAS_CREATION_ERROR, 502);
  }
}

export async function downloadBlobToBuffer(
  blobName: string,
  requestId: string
): Promise<ArrayBuffer> {
  if (!isAllowedBlobName(blobName)) {
    throw new BlobStorageError("Invalid blob reference.", 400);
  }

  const startedAt = Date.now();

  try {
    const containerClient = getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
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
      throw new BlobStorageError(AZURE_BLOB_DOWNLOAD_ERROR, 502);
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
    throw new BlobStorageError(AZURE_BLOB_DOWNLOAD_ERROR, 502);
  }
}

/** @deprecated Use downloadBlobToBuffer */
export const downloadPdfFromAzureBlob = downloadBlobToBuffer;

export async function deleteBlobIfExists(blobName: string, requestId: string): Promise<void> {
  if (!isAzureBlobStorageConfigured() || !isAllowedBlobName(blobName)) {
    return;
  }

  const startedAt = Date.now();

  try {
    const containerClient = getContainerClient();
    await containerClient.getBlockBlobClient(blobName).deleteIfExists();

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

/** @deprecated Use deleteBlobIfExists */
export const deleteAzureReviewBlob = deleteBlobIfExists;
