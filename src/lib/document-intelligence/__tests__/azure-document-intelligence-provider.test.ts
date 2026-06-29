import { afterEach, describe, expect, it, vi } from "vitest";
import { createAzureDocumentIntelligenceProvider } from "../ocr/azure-document-intelligence-provider";
import {
  formatAzurePagesQuery,
  mapAzureAnalyzeResultToOcrResult,
  mapAzureConfidence,
} from "../ocr/map-azure-analyze-result";
import { resolveOcrProvider } from "../ocr/resolve-ocr-provider";
import { disabledOcrProvider } from "../ocr/ocr-provider";
import { enrichPagesWithOcr } from "../ocr/enrich-pages-with-ocr";
import { runValidationOnPacket } from "../validation-engine";
import {
  azureLayoutAnalyzeRunning,
  azureLayoutAnalyzeSucceeded,
} from "./fixtures/azure-layout-response";
import type { PageAnalysis } from "../types";
import { equitrustMarketEarlyNjRules } from "../templates/equitrust-marketearly-nj";
import { detectCheckboxes } from "../detect-checkboxes";
import { detectSignatures } from "../detect-signatures";
import { detectDates } from "../detect-dates";
import { extractKnownValues, detectPacketFlags } from "../extract-known-values";
import { deriveExtractionMode } from "../ocr";

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

describe("Azure OCR mapping", () => {
  it("maps Azure confidence scores into engine confidence levels", () => {
    expect(mapAzureConfidence(0.95)).toBe("high");
    expect(mapAzureConfidence(0.7)).toBe("medium");
    expect(mapAzureConfidence(0.4)).toBe("low");
  });

  it("formats page number query ranges for Azure", () => {
    expect(formatAzurePagesQuery([2, 3, 4, 7, 9, 10])).toBe("2-4,7,9-10");
  });

  it("maps Azure layout lines, words, and selection marks into OcrResult", () => {
    const result = mapAzureAnalyzeResultToOcrResult(
      azureLayoutAnalyzeSucceeded.analyzeResult!,
      [2]
    );

    expect(result.provider).toBe("azure");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(2);
    expect(result.pages[0].fullText).toContain("Owner Information");
    expect(result.pages[0].lines[0].boundingBox).toEqual({
      page: 2,
      x: expect.closeTo(1.2 / 8.5, 4),
      y: expect.closeTo(2.2 / 11, 4),
      width: expect.closeTo((6.8 - 1.2) / 8.5, 4),
      height: expect.closeTo((2.6 - 2.2) / 11, 4),
    });
    expect(result.pages[0].selectionMarks).toEqual([
      expect.objectContaining({ state: "selected", confidence: "high" }),
      expect.objectContaining({ state: "unselected", confidence: "high" }),
    ]);
  });
});

describe("Azure Document Intelligence provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OCR_PROVIDER;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  });

  it("resolves disabled OCR when Azure env vars are missing", () => {
    process.env.OCR_PROVIDER = "azure";
    expect(resolveOcrProvider().name).toBe("disabled");
  });

  it("resolves Azure provider when env vars are configured", () => {
    process.env.OCR_PROVIDER = "azure";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://example.cognitiveservices.azure.com";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = "test-key";
    expect(resolveOcrProvider().name).toBe("azure");
  });

  it("submits PDF bytes to Azure and maps succeeded analyze results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: {
          get: () =>
            "https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/result-1?api-version=2024-11-30",
        },
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => azureLayoutAnalyzeSucceeded,
      });

    const provider = createAzureDocumentIntelligenceProvider({
      endpoint: "https://example.cognitiveservices.azure.com/",
      apiKey: "test-key",
      fetchFn: fetchMock,
      pollIntervalMs: 0,
    });

    const pdfBuffer = Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer;
    const result = await provider.recognize({
      fileName: "scan.pdf",
      pages: [{ pageNumber: 2 }],
      pdfBuffer,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const analyzeCall = fetchMock.mock.calls[0];
    expect(analyzeCall[0]).toContain("prebuilt-layout:analyze");
    expect(analyzeCall[0]).toContain("pages=2");
    expect(analyzeCall[1]?.headers?.["Ocp-Apim-Subscription-Key"]).toBe("test-key");
    expect(JSON.parse(analyzeCall[1]?.body as string).base64Source).toBeTruthy();
    expect(result.pages[0].fullText).toContain("Owner Information");
  });

  it("polls Azure until analyze succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: {
          get: () => "https://example.cognitiveservices.azure.com/result-1",
        },
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => azureLayoutAnalyzeRunning,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => azureLayoutAnalyzeSucceeded,
      });

    const provider = createAzureDocumentIntelligenceProvider({
      endpoint: "https://example.cognitiveservices.azure.com",
      apiKey: "test-key",
      fetchFn: fetchMock,
      pollIntervalMs: 0,
    });

    const result = await provider.recognize({
      fileName: "scan.pdf",
      pages: [{ pageNumber: 2 }],
      pdfBuffer: new ArrayBuffer(8),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.provider).toBe("azure");
  });
});

describe("Azure OCR engine integration", () => {
  it("enriches scanned pages and produces actual-page findings with masked PII", async () => {
    const provider = createAzureDocumentIntelligenceProvider({
      endpoint: "https://example.cognitiveservices.azure.com",
      apiKey: "test-key",
      fetchFn: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 202,
          headers: { get: () => "https://example.cognitiveservices.azure.com/result-1" },
          text: async () => "",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => azureLayoutAnalyzeSucceeded,
        }),
      pollIntervalMs: 0,
    });

    const pages = [emptyScannedPage(1), emptyScannedPage(2)];
    const { pages: enriched, diagnostics } = await enrichPagesWithOcr(
      pages,
      "scan.pdf",
      provider,
      new ArrayBuffer(8)
    );

    expect(diagnostics.attempted).toBe(true);
    expect(diagnostics.returnedPageCount).toBeGreaterThan(0);
    expect(enriched[1].hasOcrText).toBe(true);
    expect(enriched[1].rawText).toContain("Owner Information");

    const fullText = enriched.map((page) => page.rawText).join("\n\n");
    const packet = {
      fileName: "scan.pdf",
      pageCount: enriched.length,
      extractionMode: deriveExtractionMode(enriched),
      hasEmbeddedText: false,
      hasOcrText: true,
      pages: enriched,
      fullText,
      checkboxes: detectCheckboxes(enriched),
      signatures: detectSignatures(enriched),
      dates: detectDates(enriched),
      values: extractKnownValues(enriched, fullText),
      flags: detectPacketFlags(enriched, fullText, detectCheckboxes(enriched)),
    };

    const items = runValidationOnPacket(packet, equitrustMarketEarlyNjRules);
    const owner = items.find((item) => item.ruleId === "owner-info");
    const ssn = items.find((item) => item.ruleId === "owner-ssn");

    expect(owner?.actualPage).toBe(2);
    expect(owner?.locationConfidence).toBe("actual");
    expect(owner?.boundingBox?.page).toBe(2);
    expect(ssn?.message).toContain("***-**-6789");
    expect(JSON.stringify(items)).not.toContain("123-45-6789");
  });

  it("keeps disabled OCR behavior when Azure provider is unavailable", async () => {
    const pages = [emptyScannedPage(1)];
    const { pages: enriched } = await enrichPagesWithOcr(pages, "scan.pdf", disabledOcrProvider, new ArrayBuffer(8));
    expect(enriched[0].hasOcrText).toBeFalsy();
  });
});
