import { afterEach, describe, expect, it, vi } from "vitest";
import { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";
import {
  buildReviewBlobReference,
  isAllowedBlobReference,
  isAzureBlobStorageConfigured,
} from "@/lib/azure-blob-storage";
import { logAzureBlobEvent } from "@/lib/azure-blob-log";
import { parseReviewBlobReference } from "@/lib/review-request";
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

  it("builds private review blob references under reviews/", () => {
    const reference = buildReviewBlobReference("scan.pdf");
    expect(reference.startsWith("reviews/")).toBe(true);
    expect(reference.endsWith(".pdf")).toBe(true);
    expect(isAllowedBlobReference(reference)).toBe(true);
  });

  it("rejects path traversal and external blob references", () => {
    expect(isAllowedBlobReference("../secrets.pdf")).toBe(false);
    expect(isAllowedBlobReference("reviews/../secrets.pdf")).toBe(false);
    expect(isAllowedBlobReference("https://evil.example.com/file.pdf")).toBe(false);
    expect(isAllowedBlobReference("reviews/not-a-valid-reference")).toBe(false);
  });

  it("parses valid blob review references", () => {
    const blobReference = buildReviewBlobReference("scan.pdf");
    expect(
      parseReviewBlobReference({
        blobReference,
        fileName: "scan.pdf",
        fileSize: 9_500_000,
      })
    ).toEqual({
      blobReference,
      fileName: "scan.pdf",
      fileSize: 9_500_000,
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
      action: "upload",
      success: true,
      fileSizeBytes: 9_500_000,
      durationMs: 42,
    });

    const payload = infoSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.requestId).toBe("req-123");
    expect(payload.fileSizeBytes).toBe(9_500_000);
    expect(JSON.stringify(payload)).not.toMatch(/AccountKey|SharedAccessSignature|ssn|123-45-6789/i);
  });
});
