import { afterEach, describe, expect, it, vi } from "vitest";

const createBlobUploadSasUrlMock = vi.fn(() => "https://account.blob.core.windows.net/container/reviews/file.pdf?sig=test");

vi.mock("@/lib/azure-blob-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/azure-blob-storage")>();
  return {
    ...actual,
    isAzureBlobStorageConfigured: vi.fn(() => true),
    createBlobUploadSasUrl: (...args: unknown[]) => createBlobUploadSasUrlMock(...args),
    sanitizeBlobName: vi.fn(() => "reviews/11111111-1111-4111-8111-111111111111-scan.pdf"),
  };
});

vi.mock("@/lib/review-auth", () => ({
  requireAuthenticatedReviewAccess: vi.fn(async () => null),
}));

describe("POST /api/upload-url", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports whether Azure blob storage is configured", async () => {
    const { GET } = await import("@/app/api/upload-url/route");

    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      blobStorageConfigured: true,
      directUploadMaxBytes: 4 * 1024 * 1024,
    });
  });

  it("returns uploadUrl and blobName for valid large PDF metadata", async () => {
    const { POST } = await import("@/app/api/upload-url/route");

    const response = await POST(
      new Request("http://localhost/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "scan.pdf",
          contentType: "application/pdf",
          size: 9_500_000,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.blobName).toBe("reviews/11111111-1111-4111-8111-111111111111-scan.pdf");
    expect(body.uploadUrl).toContain("blob.core.windows.net");
    expect(body.uploadUrl).toContain("sig=");
    expect(createBlobUploadSasUrlMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-PDF content types", async () => {
    const { POST } = await import("@/app/api/upload-url/route");

    const response = await POST(
      new Request("http://localhost/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "scan.pdf",
          contentType: "text/plain",
          size: 9_500_000,
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File must be a PDF." });
  });

  it("rejects files over 25 MB", async () => {
    const { POST } = await import("@/app/api/upload-url/route");

    const response = await POST(
      new Request("http://localhost/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "scan.pdf",
          contentType: "application/pdf",
          size: 26 * 1024 * 1024,
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File size must not exceed 25 MB.",
    });
  });
});