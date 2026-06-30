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
const generateBlobSASQueryParametersMock = vi.fn(() => ({ toString: () => "sig=test-sas" }));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn(() => ({
      getContainerClient: vi.fn(() => ({
        getBlockBlobClient: vi.fn(() => ({
          upload: uploadMock,
          download: downloadMock,
          getProperties: getPropertiesMock,
          deleteIfExists: deleteIfExistsMock,
          url: "https://account.blob.core.windows.net/review-uploads/reviews/file.pdf",
        })),
      })),
    })),
  },
  BlobSASPermissions: {
    parse: vi.fn(() => "cw"),
  },
  generateBlobSASQueryParameters: (...args: unknown[]) =>
    generateBlobSASQueryParametersMock(...args),
  StorageSharedKeyCredential: vi.fn(function StorageSharedKeyCredential() {
    return { accountName: "account" };
  }),
}));

describe("azure blob storage SDK wiring", () => {
  const originalConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const originalContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  beforeEach(() => {
    process.env["AZURE_STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=https;AccountName=account;AccountKey=key;EndpointSuffix=core.windows.net";
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

  it("creates SAS upload URLs, downloads blobs, and deletes them", async () => {
    const {
      sanitizeBlobName,
      createBlobUploadSasUrl,
      downloadBlobToBuffer,
      deleteBlobIfExists,
    } = await import("@/lib/azure-blob-storage");

    const blobName = sanitizeBlobName("scan.pdf");
    const uploadUrl = createBlobUploadSasUrl(blobName, "application/pdf", "req-upload");
    const downloaded = await downloadBlobToBuffer(blobName, "req-download");
    await deleteBlobIfExists(blobName, "req-delete");

    expect(uploadUrl).toContain("sig=test-sas");
    expect(generateBlobSASQueryParametersMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(deleteIfExistsMock).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(downloaded)).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    );
  });
});
