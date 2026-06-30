import { afterEach, describe, expect, it, vi } from "vitest";

const uploadPdfToAzureBlobMock = vi.fn(async () => undefined);

vi.mock("@/lib/azure-blob-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/azure-blob-storage")>();
  return {
    ...actual,
    isAzureBlobStorageConfigured: vi.fn(() => true),
    uploadPdfToAzureBlob: (...args: unknown[]) => uploadPdfToAzureBlobMock(...args),
  };
});

vi.mock("@/lib/review-auth", () => ({
  requireAuthenticatedReviewAccess: vi.fn(async () => null),
}));

describe("POST /api/upload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports whether Azure blob storage is configured", async () => {
    const { GET } = await import("@/app/api/upload/route");

    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      blobStorageConfigured: true,
      directUploadMaxBytes: 4 * 1024 * 1024,
    });
  });

  it("uploads a validated PDF and returns an internal blob reference", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([pdfBytes], "scan.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.blobReference).toMatch(/^reviews\//);
    expect(body.fileName).toBe("scan.pdf");
    expect(body.fileSize).toBe(pdfBytes.byteLength);
    expect(body.blobReference).not.toMatch(/^https?:\/\//);
    expect(uploadPdfToAzureBlobMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid PDF magic bytes", async () => {
    const { POST } = await import("@/app/api/upload/route");

    const file = new File(["not-a-pdf"], "scan.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File must be a valid PDF." });
    expect(uploadPdfToAzureBlobMock).not.toHaveBeenCalled();
  });
});
