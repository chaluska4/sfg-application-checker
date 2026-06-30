import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReviewBlobReference } from "@/lib/azure-blob-storage";

const processReviewPdfMock = vi.fn(async () => ({
  formName: "Test",
  fileName: "scan.pdf",
  completionScore: 0,
  status: "manual-review" as const,
  statusLabel: "Manual Review Needed",
  extractionMode: "image_only" as const,
  hasEmbeddedText: false,
  pageCount: 3,
  disclaimer: "test",
  summary: {
    present: 0,
    missing: 0,
    needsManualVerification: 1,
    conditionalReview: 0,
    notApplicable: 0,
    total: 1,
  },
  items: [],
  groupedItems: [],
}));

const downloadPdfFromAzureBlobMock = vi.fn(async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return bytes.buffer;
});

const deleteAzureReviewBlobMock = vi.fn(async () => undefined);

vi.mock("@/lib/review-pdf-processor", () => ({
  processReviewPdf: (...args: unknown[]) => processReviewPdfMock(...args),
  ReviewPdfValidationError: class ReviewPdfValidationError extends Error {
    status = 400;
  },
}));

vi.mock("@/lib/azure-blob-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/azure-blob-storage")>();
  return {
    ...actual,
    isAzureBlobStorageConfigured: vi.fn(() => true),
    downloadPdfFromAzureBlob: (...args: unknown[]) => downloadPdfFromAzureBlobMock(...args),
    deleteAzureReviewBlob: (...args: unknown[]) => deleteAzureReviewBlobMock(...args),
  };
});

vi.mock("@/lib/review-auth", () => ({
  requireAuthenticatedReviewAccess: vi.fn(async () => null),
}));

describe("POST /api/review Azure blob references", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reviews a PDF from an Azure blob reference and deletes the blob afterward", async () => {
    const { POST } = await import("../../../app/api/review/route");
    const blobReference = buildReviewBlobReference("scan.pdf");

    const request = new Request("http://localhost/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blobReference,
        fileName: "scan.pdf",
        fileSize: 9_500_000,
      }),
    });

    const response = await POST(request as import("next/server").NextRequest);
    expect(response.status).toBe(200);
    expect(downloadPdfFromAzureBlobMock).toHaveBeenCalledTimes(1);
    expect(processReviewPdfMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), "scan.pdf");
    expect(deleteAzureReviewBlobMock).toHaveBeenCalledWith(
      blobReference,
      expect.any(String)
    );
  });

  it("deletes the blob when review processing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    processReviewPdfMock.mockRejectedValueOnce(new Error("Review timed out before completion"));

    const { POST } = await import("../../../app/api/review/route");
    const blobReference = buildReviewBlobReference("scan.pdf");

    const request = new Request("http://localhost/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blobReference,
        fileName: "scan.pdf",
        fileSize: 9_500_000,
      }),
    });

    const response = await POST(request as import("next/server").NextRequest);
    expect(response.status).toBe(504);
    expect(deleteAzureReviewBlobMock).toHaveBeenCalledWith(
      blobReference,
      expect.any(String)
    );
  });

  it("rejects direct uploads above the direct upload threshold", async () => {
    const { POST } = await import("../../../app/api/review/route");
    const { DIRECT_UPLOAD_MAX_BYTES } = await import("@/lib/upload-security");

    const size = DIRECT_UPLOAD_MAX_BYTES + 1;
    const largeBuffer = new Uint8Array(size);
    largeBuffer.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
    const file = new File([largeBuffer], "large.pdf", { type: "application/pdf" });

    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(
      new Request("http://localhost/api/review", {
        method: "POST",
        body: formData,
      }) as import("next/server").NextRequest
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/upload flow|Azure Blob Storage/i),
    });
  });
});
