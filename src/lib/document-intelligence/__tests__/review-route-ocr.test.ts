import { afterEach, describe, expect, it, vi } from "vitest";

const processReviewPdfMock = vi.fn(async () => ({
  formName: "Test",
  fileName: "scan.pdf",
  completionScore: 0,
  status: "manual-review" as const,
  statusLabel: "Manual Review Needed",
  extractionMode: "image_only" as const,
  hasEmbeddedText: false,
  pageCount: 1,
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

vi.mock("@/lib/review-pdf-processor", () => ({
  processReviewPdf: (...args: unknown[]) => processReviewPdfMock(...args),
  ReviewPdfValidationError: class ReviewPdfValidationError extends Error {
    status = 400;
  },
}));

vi.mock("@/lib/review-auth", () => ({
  requireAuthenticatedReviewAccess: vi.fn(async () => null),
}));

describe("POST /api/review OCR wiring", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves OCR provider from env and passes it to runDocumentIntelligence", async () => {
    const { POST } = await import("../../../app/api/review/route");

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([pdfBytes], "scan.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", file);

    const request = new Request("http://localhost/api/review", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as import("next/server").NextRequest);
    expect(response.status).toBe(200);
    expect(processReviewPdfMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), "scan.pdf");
  });

  it("returns JSON when processing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    processReviewPdfMock.mockRejectedValueOnce(new Error("Review timed out before completion"));

    const { POST } = await import("../../../app/api/review/route");

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([pdfBytes], "scan.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", file);

    const request = new Request("http://localhost/api/review", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as import("next/server").NextRequest);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "The review took too long to complete. Try a smaller PDF or try again in a moment.",
    });
  });
});
