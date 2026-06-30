import { afterEach, describe, expect, it, vi } from "vitest";
import { AZURE_BLOB_STORAGE_SETUP_ERROR, AZURE_DIRECT_UPLOAD_ERROR } from "@/lib/azure-blob-messages";
import { submitReviewPdf } from "@/lib/review-api-client";
import { DIRECT_UPLOAD_MAX_BYTES, shouldUseBlobUpload } from "@/lib/upload-security";

describe("submitReviewPdf Azure SAS upload routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires Azure blob storage for large PDFs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/upload-url") {
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

  it("requests SAS URL metadata then uploads directly to Azure before review", async () => {
    const blobName = "review-uploads/2026-06-30/7f3a9c2e-palmaffy-robert-eqt-eq0001545688f-johnson.pdf";
    const uploadUrl = "https://account.blob.core.windows.net/container/review-uploads/2026-06-30/file.pdf?sig=test";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/upload-url" && init?.method === undefined) {
        return new Response(JSON.stringify({ blobStorageConfigured: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url === "/api/upload-url" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          filename: "large.pdf",
          contentType: "application/pdf",
          size: 9_500_000,
        });

        return new Response(JSON.stringify({ uploadUrl, blobName }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url === uploadUrl && init?.method === "PUT") {
        expect(init.headers).toMatchObject({
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "application/pdf",
        });
        return new Response(null, { status: 201 });
      }

      if (url === "/api/review" && init?.headers) {
        const headers = new Headers(init.headers);
        expect(headers.get("content-type")).toBe("application/json");
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          blobName,
          originalFilename: "large.pdf",
        });

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
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("surfaces Azure direct upload failures", async () => {
    const uploadUrl = "https://account.blob.core.windows.net/container/review-uploads/2026-06-30/file.pdf?sig=test";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/upload-url" && !init?.method) {
        return new Response(JSON.stringify({ blobStorageConfigured: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url === "/api/upload-url" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            uploadUrl,
            blobName: "review-uploads/2026-06-30/7f3a9c2e-palmaffy-robert-eqt-eq0001545688f-johnson.pdf",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === uploadUrl) {
        return new Response("Upload failed", { status: 403, statusText: "Forbidden" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["%PDF-1.4"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 9_500_000 });

    await expect(submitReviewPdf(file)).rejects.toThrow(AZURE_DIRECT_UPLOAD_ERROR);
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
