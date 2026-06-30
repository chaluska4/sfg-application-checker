import { afterEach, describe, expect, it, vi } from "vitest";
import { AZURE_BLOB_STORAGE_SETUP_ERROR } from "@/lib/azure-blob-messages";
import { submitReviewPdf } from "@/lib/review-api-client";
import { DIRECT_UPLOAD_MAX_BYTES, shouldUseBlobUpload } from "@/lib/upload-security";

describe("submitReviewPdf Azure upload routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires Azure blob storage for large PDFs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/upload" && !String(input).includes("POST")) {
        return new Response(JSON.stringify({ blobStorageConfigured: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(input) === "/api/upload") {
        return new Response(JSON.stringify({ blobStorageConfigured: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["%PDF-1.4"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 9_500_000 });

    expect(shouldUseBlobUpload(file.size)).toBe(true);
    await expect(submitReviewPdf(file)).rejects.toThrow(AZURE_BLOB_STORAGE_SETUP_ERROR);
  });

  it("uploads large PDFs through /api/upload then reviews by blob reference", async () => {
    const blobReference = "reviews/11111111-1111-4111-8111-111111111111-scan.pdf";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/upload" && init?.method === undefined) {
        return new Response(JSON.stringify({ blobStorageConfigured: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url === "/api/upload" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            blobReference,
            fileName: "large.pdf",
            fileSize: 9_500_000,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (url === "/api/review" && init?.headers) {
        const headers = new Headers(init.headers);
        expect(headers.get("content-type")).toBe("application/json");
        const body = JSON.parse(String(init.body));
        expect(body.blobReference).toBe(blobReference);
        expect(body).not.toHaveProperty("blobUrl");

        return new Response(JSON.stringify({ fileName: "large.pdf", pageCount: 3 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["%PDF-1.4"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 9_500_000 });

    const result = await submitReviewPdf(file);
    expect(result).toEqual({ fileName: "large.pdf", pageCount: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses direct multipart upload for small PDFs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/review" && init?.body instanceof FormData) {
        return new Response(JSON.stringify({ fileName: "small.pdf", pageCount: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["%PDF-1.4"], "small.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: DIRECT_UPLOAD_MAX_BYTES });

    const result = await submitReviewPdf(file);
    expect(result).toEqual({ fileName: "small.pdf", pageCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
