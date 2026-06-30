import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateBlobName,
  isAllowedBlobName,
  isAzureBlobStorageConfigured,
} from "@/lib/azure-blob-storage";
import { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";
import { logAzureBlobEvent } from "@/lib/azure-blob-log";
import { parseReviewBlobRequest, parseUploadUrlRequest, validateUploadUrlRequest } from "@/lib/review-request";
import { DIRECT_UPLOAD_MAX_BYTES, shouldUseBlobUpload } from "@/lib/upload-security";

describe("azure blob storage", () => {
  const originalConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const originalContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  afterEach(() => {
    if (originalConnectionString === undefined) {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    } else {
      process.env.AZURE_STORAGE_CONNECTION_STRING = originalConnectionString;
    }

    if (originalContainerName === undefined) {
      delete process.env.AZURE_STORAGE_CONTAINER_NAME;
    } else {
      process.env.AZURE_STORAGE_CONTAINER_NAME = originalContainerName;
    }
  });

  it("detects when Azure blob storage is configured", () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_CONTAINER_NAME;
    expect(isAzureBlobStorageConfigured()).toBe(false);

    process.env["AZURE_STORAGE_CONNECTION_STRING"] = "UseDevelopmentStorage=true";
    process.env["AZURE_STORAGE_CONTAINER_NAME"] = "review-uploads";
    expect(isAzureBlobStorageConfigured()).toBe(true);
  });

  it("builds private review blob names under review-uploads/", () => {
    const blobName = generateBlobName("scan.pdf", new Date("2026-06-30T12:00:00.000Z"));
    expect(blobName.startsWith("review-uploads/")).toBe(true);
    expect(blobName.endsWith(".pdf")).toBe(true);
    expect(isAllowedBlobName(blobName)).toBe(true);
  });

  it("parses valid upload-url metadata and review blob requests", () => {
    const blobName = generateBlobName("scan.pdf", new Date("2026-06-30T12:00:00.000Z"));

    expect(
      parseUploadUrlRequest({
        filename: "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
        contentType: "application/pdf",
        size: 9_500_000,
      })
    ).toEqual({
      filename: "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
      contentType: "application/pdf",
      size: 9_500_000,
    });

    expect(
      validateUploadUrlRequest({
        filename: "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
        contentType: "application/pdf",
        size: 9_500_000,
      })
    ).toBeNull();

    expect(
      parseReviewBlobRequest({
        blobName,
        originalFilename: "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
      })
    ).toEqual({
      blobName,
      originalFilename: "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
    });
  });

  it("routes files above the direct upload threshold through Azure blob upload", () => {
    expect(shouldUseBlobUpload(DIRECT_UPLOAD_MAX_BYTES)).toBe(false);
    expect(shouldUseBlobUpload(9_500_000)).toBe(true);
  });

  it("documents the Azure blob setup error message", () => {
    expect(AZURE_BLOB_STORAGE_SETUP_ERROR).toContain("AZURE_STORAGE_CONNECTION_STRING");
    expect(AZURE_BLOB_STORAGE_SETUP_ERROR).not.toContain("AccountKey=");
  });

  it("logs only sanitized metadata", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logAzureBlobEvent({
      requestId: "req-123",
      action: "sas-create",
      success: true,
      durationMs: 42,
    });

    const payload = infoSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.requestId).toBe("req-123");
    expect(JSON.stringify(payload)).not.toMatch(/AccountKey|SharedAccessSignature|ssn|123-45-6789/i);
  });
});
