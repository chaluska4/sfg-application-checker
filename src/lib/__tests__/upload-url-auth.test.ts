import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/azure-blob-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/azure-blob-storage")>();
  return {
    ...actual,
    isAzureBlobStorageConfigured: vi.fn(() => true),
  };
});

vi.mock("@/lib/review-auth", () => ({
  requireAuthenticatedReviewAccess: vi.fn(async () =>
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  ),
}));

describe("POST /api/upload-url authentication", () => {
  it("rejects unauthenticated users", async () => {
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

    expect(response.status).toBe(401);
  });
});
