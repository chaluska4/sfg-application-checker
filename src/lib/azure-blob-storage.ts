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
import { clonePdfArrayBuffer } from "@/lib/pdf-buffer";

export { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";

const BLOB_ROOT_PREFIX = "review-uploads";
const SAS_UPLOAD_TTL_MS = 10 * 60 * 1000;
const MAX_BLOB_SLUG_LENGTH = 120;

/** Matches review-uploads/YYYY-MM-DD/{id}-{slug}.pdf with safe characters only. */
const BLOB_NAME_PATTERN =
  /^review-uploads\/\d{4}-\d{2}-\d{2}\/[a-z0-9][a-z0-9_-]*\.pdf$/;

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
  if (!blobName.startsWith(`${BLOB_ROOT_PREFIX}/`)) return false;
  if (blobName.includes("..")) return false;
  if (blobName.includes("\\")) return false;

  const segments = blobName.split("/");
  if (segments.length !== 3) return false;
  if (segments[0] !== BLOB_ROOT_PREFIX) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segments[1] ?? "")) return false;

  return BLOB_NAME_PATTERN.test(blobName);
}

/** @deprecated Use isAllowedBlobName */
export const isAllowedBlobReference = isAllowedBlobName;

/**
 * Converts an original PDF filename into a safe lowercase slug for blob storage.
 * Spaces, punctuation, and mixed case are normalized — the result is never rejected
 * solely because the advisor's original filename contained special characters.
 */
export function slugifyOriginalFilenameForBlob(fileName: string): string {
  const base = sanitizeFileName(fileName).replace(/\.pdf$/i, "");
  const slug = base
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_BLOB_SLUG_LENGTH);

  return slug.length > 0 ? slug : "upload";
}

/**
 * Generates a server-controlled Azure blob name. The original filename is used only
 * to derive a readable slug; validation never requires the original name to be blob-safe.
 */
export function generateBlobName(originalFilename: string, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const id = randomUUID().slice(0, 8);
  const slug = slugifyOriginalFilenameForBlob(originalFilename);
  return `${BLOB_ROOT_PREFIX}/${date}/${id}-${slug}.pdf`;
}

/** @deprecated Use generateBlobName */
export const sanitizeBlobName = generateBlobName;

/** @deprecated Use generateBlobName */
export const buildReviewBlobReference = generateBlobName;

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

    return clonePdfArrayBuffer(buffer);
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
