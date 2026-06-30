import { afterEach, describe, expect, it, vi } from "vitest";

const runDocumentIntelligenceMock = vi.fn(async () => ({
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

const resolveOcrProviderMock = vi.fn(() => ({
  name: "azure",
  isAvailable: () => true,
  recognize: vi.fn(),
}));

vi.mock("@/lib/document-intelligence", () => ({
  runDocumentIntelligence: (...args: unknown[]) => runDocumentIntelligenceMock(...args),
}));

vi.mock("@/lib/document-intelligence/ocr/resolve-ocr-provider", () => ({
  resolveOcrProvider: () => resolveOcrProviderMock(),
}));

vi.mock("@/lib/auth", () => ({
  COOKIE_NAME: "sfg_session",
  verifySessionToken: vi.fn(async () => true),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: "valid-token" }),
  })),
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
    expect(resolveOcrProviderMock).toHaveBeenCalledTimes(1);
    expect(runDocumentIntelligenceMock).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "scan.pdf",
      undefined,
      expect.objectContaining({
        ocrProvider: expect.objectContaining({ name: "azure" }),
      })
    );
  });

  it("returns JSON when processing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runDocumentIntelligenceMock.mockRejectedValueOnce(new Error("Review timed out before completion"));

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
