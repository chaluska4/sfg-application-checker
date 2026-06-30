import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyReviewError,
  createReviewErrorResponse,
  createReviewPayloadTooLargeResponse,
} from "@/lib/review-route-errors";
import { MAX_PDF_SIZE_ERROR } from "@/lib/upload-security";

describe("review route errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies payload-too-large errors", () => {
    const details = classifyReviewError(new Error("Request Entity Too Large"));
    expect(details.kind).toBe("payload_too_large");
    expect(details.status).toBe(413);
    expect(details.clientMessage).toBe(MAX_PDF_SIZE_ERROR);
  });

  it("classifies timeout errors", () => {
    const details = classifyReviewError(new Error("Review timed out before completion"));
    expect(details.kind).toBe("timeout");
    expect(details.status).toBe(504);
  });

  it("classifies Azure OCR errors without exposing raw bodies", () => {
    const details = classifyReviewError(
      new Error(
        'Azure Document Intelligence analyze request failed (401): {"error":{"code":"InvalidSubscriptionKey"}}'
      )
    );
    expect(details.kind).toBe("azure");
    expect(details.clientMessage).not.toContain("InvalidSubscriptionKey");
    expect(details.clientMessage).toContain("manual verification");
  });

  it("returns JSON error responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = createReviewErrorResponse(new Error("Request Entity Too Large"));
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: MAX_PDF_SIZE_ERROR });
  });

  it("returns JSON for middleware payload-too-large responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = createReviewPayloadTooLargeResponse();
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: MAX_PDF_SIZE_ERROR });
  });
});
