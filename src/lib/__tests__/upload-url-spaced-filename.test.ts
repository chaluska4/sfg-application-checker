import { afterEach, describe, expect, it, vi } from "vitest";
import { generateBlobName } from "@/lib/azure-blob-storage";

const createBlobUploadSasUrlMock = vi.fn(
  () =>
    "https://account.blob.core.windows.net/container/review-uploads/2026-06-30/file.pdf?sig=test"
);

vi.mock("@/lib/azure-blob-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/azure-blob-storage")>();
  return {
    ...actual,
    isAzureBlobStorageConfigured: vi.fn(() => true),
    createBlobUploadSasUrl: (...args: unknown[]) => createBlobUploadSasUrlMock(...args),
  };
});

vi.mock("@/lib/review-auth", () => ({
  requireAuthenticatedReviewAccess: vi.fn(async () => null),
}));

describe("POST /api/upload-url integration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates a safe blob name for spaced filenames without returning 400", async () => {
    const { POST } = await import("@/app/api/upload-url/route");

    const response = await POST(
      new Request("http://localhost/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
          contentType: "application/pdf",
          size: 9_500_000,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.blobName).toMatch(
      /^review-uploads\/\d{4}-\d{2}-\d{2}\/[a-z0-9]{8}-palmaffy-robert-eqt-eq0001545688f-johnson\.pdf$/
    );
    expect(createBlobUploadSasUrlMock).toHaveBeenCalledWith(
      body.blobName,
      "application/pdf",
      expect.any(String)
    );
  });
});

describe("generateBlobName with real implementation", () => {
  it("accepts the production example filename", () => {
    const blobName = generateBlobName(
      "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
      new Date("2026-06-30T12:00:00.000Z")
    );
    expect(blobName).toMatch(
      /^review-uploads\/2026-06-30\/[a-z0-9]{8}-palmaffy-robert-eqt-eq0001545688f-johnson\.pdf$/
    );
  });
});
