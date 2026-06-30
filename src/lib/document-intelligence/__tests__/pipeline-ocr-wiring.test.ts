import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledOcrProvider } from "../ocr/ocr-provider";
import { createMockOcrProvider } from "../ocr/mock-ocr-provider";
import { readOcrServerEnv } from "../ocr/ocr-env";
import * as resolveOcrModule from "../ocr/resolve-ocr-provider";
import { resolveOcrProvider } from "../ocr/resolve-ocr-provider";
import * as extractPdfText from "../extract-pdf-text";
import { runDocumentIntelligence } from "../validation-engine";
import { enrichPagesWithOcr } from "../ocr/enrich-pages-with-ocr";
import type { PageAnalysis } from "../types";

function emptyScannedPage(pageNumber: number): PageAnalysis {
  return {
    pageNumber,
    rawText: "",
    normalizedText: "",
    charCount: 0,
    hasEmbeddedText: false,
    textSource: "none",
    classification: "unknown",
    classificationConfidence: "low",
  };
}

describe("OCR pipeline wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OCR_PROVIDER;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  });

  it("reads OCR env vars at runtime via bracket access", () => {
    process.env["OCR_PROVIDER"] = "azure";
    process.env["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"] = "https://example.cognitiveservices.azure.com";
    process.env["AZURE_DOCUMENT_INTELLIGENCE_KEY"] = "test-key";

    const env = readOcrServerEnv();
    expect(env.provider).toBe("azure");
    expect(env.azureEndpoint).toContain("cognitiveservices.azure.com");
    expect(resolveOcrProvider().name).toBe("azure");
  });

  it("runDocumentIntelligence resolves OCR provider when options omit ocrProvider", async () => {
    const azureProvider = createMockOcrProvider({
      pages: { 1: { fullText: "Owner Information First Name John Last Name Smith" } },
    });
    const resolveSpy = vi.spyOn(resolveOcrModule, "resolveOcrProvider").mockReturnValue(azureProvider);

    const extractSpy = vi.spyOn(extractPdfText, "extractPdfPages").mockResolvedValue({
      pages: [],
      pageCount: 0,
      fullText: "",
      hasEmbeddedText: false,
      hasOcrText: false,
    });

    await runDocumentIntelligence(new ArrayBuffer(8), "scan.pdf");

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(extractSpy).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ ocrProvider: azureProvider, fileName: "scan.pdf" })
    );
  });

  it("runDocumentIntelligence uses an explicitly provided OCR provider", async () => {
    const explicitProvider = createMockOcrProvider({ pages: {} });
    const resolveSpy = vi.spyOn(resolveOcrModule, "resolveOcrProvider");

    const extractSpy = vi.spyOn(extractPdfText, "extractPdfPages").mockResolvedValue({
      pages: [],
      pageCount: 0,
      fullText: "",
      hasEmbeddedText: false,
      hasOcrText: false,
    });

    await runDocumentIntelligence(new ArrayBuffer(8), "scan.pdf", undefined, {
      ocrProvider: explicitProvider,
    });

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(extractSpy).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ ocrProvider: explicitProvider })
    );
  });

  it("falls back to manual-review pages when Azure OCR fails", async () => {
    const failingProvider = {
      name: "azure",
      isAvailable: () => true,
      recognize: vi.fn(async () => {
        throw new Error("Azure Document Intelligence analyze failed (401): invalid key abcdefghijklmnopqrstuvwxyz");
      }),
    };

    const pages = [emptyScannedPage(1), emptyScannedPage(2)];
    const { pages: resultPages, diagnostics } = await enrichPagesWithOcr(
      pages,
      "scan.pdf",
      failingProvider,
      new ArrayBuffer(8)
    );

    expect(diagnostics.attempted).toBe(true);
    expect(diagnostics.error).toContain("401");
    expect(diagnostics.error).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(resultPages[0].hasOcrText).toBeFalsy();
    expect(resultPages[1].hasOcrText).toBeFalsy();
  });

  it("does not attempt OCR when provider is disabled", async () => {
    const pages = [emptyScannedPage(1)];
    const { diagnostics } = await enrichPagesWithOcr(pages, "scan.pdf", disabledOcrProvider);
    expect(diagnostics.providerSelected).toBe("disabled");
    expect(diagnostics.attempted).toBe(false);
  });
});
