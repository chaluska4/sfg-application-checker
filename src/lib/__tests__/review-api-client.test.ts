import { describe, expect, it } from "vitest";
import {
  getFriendlyReviewHttpError,
  parseReviewApiResponse,
  readReviewApiError,
} from "@/lib/review-api-client";
import { MAX_PDF_SIZE_ERROR } from "@/lib/upload-security";

function mockResponse(
  init: ResponseInit & { body?: string; contentType?: string }
): Response {
  const headers = new Headers(init.headers);
  if (init.contentType) {
    headers.set("content-type", init.contentType);
  }

  return new Response(init.body ?? "", {
    status: init.status,
    headers,
  });
}

describe("review API client", () => {
  it("maps plain-text 413 responses to the PDF size limit message", async () => {
    const response = mockResponse({
      status: 413,
      body: "Request Entity Too Large",
      contentType: "text/plain",
    });

    await expect(readReviewApiError(response)).resolves.toBe(MAX_PDF_SIZE_ERROR);
  });

  it("reads JSON error payloads when present", async () => {
    const response = mockResponse({
      status: 400,
      body: JSON.stringify({ error: "File must be a PDF." }),
      contentType: "application/json",
    });

    await expect(readReviewApiError(response)).resolves.toBe("File must be a PDF.");
  });

  it("rejects non-JSON success responses safely", async () => {
    const response = mockResponse({
      status: 200,
      body: "Request Entity Too Large",
      contentType: "text/plain",
    });

    await expect(parseReviewApiResponse(response)).rejects.toThrow(MAX_PDF_SIZE_ERROR);
  });

  it("parses JSON success responses", async () => {
    const payload = { fileName: "test.pdf", pageCount: 1 };
    const response = mockResponse({
      status: 200,
      body: JSON.stringify(payload),
      contentType: "application/json",
    });

    await expect(parseReviewApiResponse(response)).resolves.toEqual(payload);
  });

  it("maps timeout text to a friendly message", () => {
    expect(getFriendlyReviewHttpError(504, "Gateway Timeout")).toContain("too long");
  });
});
