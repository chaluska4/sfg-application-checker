import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn(async () => undefined);
const downloadMock = vi.fn(async () => ({
  readableStreamBody: (async function* () {
    yield Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  })(),
}));
const getPropertiesMock = vi.fn(async () => ({
  contentLength: 8,
  contentType: "application/pdf",
}));
const deleteIfExistsMock = vi.fn(async () => undefined);

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn(() => ({
      getContainerClient: vi.fn(() => ({
        getBlockBlobClient: vi.fn(() => ({
          upload: uploadMock,
          download: downloadMock,
          getProperties: getPropertiesMock,
          deleteIfExists: deleteIfExistsMock,
        })),
      })),
    })),
  },
}));

describe("azure blob storage SDK wiring", () => {
  const originalConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const originalContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  beforeEach(() => {
    process.env["AZURE_STORAGE_CONNECTION_STRING"] = "UseDevelopmentStorage=true";
    process.env["AZURE_STORAGE_CONTAINER_NAME"] = "review-uploads";
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalConnectionString === undefined) {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    } else {
      process.env.AZURE_STORAGE_CONNECTION_STRING = originalConnectionString;
    }

    if (originalContainerName === undefined) {
      delete process.env.AZURE_STORAGE_CONTAINER_NAME;
    } else {
      process.env.AZURE_STORAGE_CONTAINER_NAME = originalContainerName;
    }
  });

  it("uploads, downloads, and deletes review blobs", async () => {
    const {
      buildReviewBlobReference,
      uploadPdfToAzureBlob,
      downloadPdfFromAzureBlob,
      deleteAzureReviewBlob,
    } = await import("@/lib/azure-blob-storage");

    const blobReference = buildReviewBlobReference("scan.pdf");
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    await uploadPdfToAzureBlob(pdfBytes.buffer, blobReference, "req-upload");
    const downloaded = await downloadPdfFromAzureBlob(blobReference, "req-download");
    await deleteAzureReviewBlob(blobReference, "req-delete");

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(deleteIfExistsMock).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(downloaded)).toEqual(pdfBytes);
  });
});
