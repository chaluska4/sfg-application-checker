import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageAnalysis } from "../types";
import {
  buildOcrDebugInfo,
  buildOcrDiagnosticSummary,
  isOcrDebugEnabled,
  maskOcrDebugSnippet,
} from "../ocr/ocr-debug";
import type { OcrDiagnostics } from "../ocr/ocr-dev-log";

function mockPage(overrides: Partial<PageAnalysis> & { pageNumber: number }): PageAnalysis {
  return {
    rawText: "",
    normalizedText: "",
    charCount: 0,
    hasEmbeddedText: false,
    classification: "unknown",
    classificationConfidence: "low",
    ...overrides,
  };
}

describe("isOcrDebugEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled in production unless ENABLE_OCR_DEBUG=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_OCR_DEBUG", "");
    expect(isOcrDebugEnabled()).toBe(false);

    vi.stubEnv("ENABLE_OCR_DEBUG", "true");
    expect(isOcrDebugEnabled()).toBe(true);
  });

  it("is enabled outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_OCR_DEBUG", "");
    expect(isOcrDebugEnabled()).toBe(true);
  });
});

describe("maskOcrDebugSnippet", () => {
  it("masks SSNs, emails, phones, and long account numbers", () => {
    const masked = maskOcrDebugSnippet(
      "Owner SSN 123-45-6789 email jane.doe@example.com phone 555-123-4567 account 12345678901234"
    );
    expect(masked).not.toContain("123-45-6789");
    expect(masked).not.toContain("jane.doe@example.com");
    expect(masked).not.toContain("555-123-4567");
    expect(masked).not.toContain("12345678901234");
    expect(masked).toContain("[redacted]");
  });

  it("limits snippet length", () => {
    const masked = maskOcrDebugSnippet("a".repeat(600));
    expect(masked.length).toBeLessThanOrEqual(400);
  });
});

describe("buildOcrDebugInfo", () => {
  const diagnostics: OcrDiagnostics = {
    providerSelected: "azure",
    attempted: true,
    candidatePageCount: 2,
    returnedPageCount: 2,
    lineCount: 3,
    enrichedPageCount: 1,
  };

  it("calculates page, line, and selection mark counts", () => {
    const pages = [
      mockPage({
        pageNumber: 1,
        rawText: "Cover memo",
        charCount: 10,
        hasEmbeddedText: true,
        textSource: "embedded",
        classification: "sfg_cover_sheet",
        classificationConfidence: "medium",
        ocrLines: [{ text: "Cover memo", confidence: "medium" }],
      }),
      mockPage({
        pageNumber: 2,
        rawText: "Individual Annuity Application Owner Information",
        charCount: 48,
        hasOcrText: true,
        textSource: "ocr",
        classification: "application_page_1",
        classificationConfidence: "high",
        ocrLines: [
          { text: "Individual Annuity Application", confidence: "high" },
          { text: "Owner Information", confidence: "medium" },
        ],
        ocrSelectionMarks: [{ state: "selected", confidence: "high" }],
      }),
    ];

    const debug = buildOcrDebugInfo(pages, "azure", diagnostics, [
      { status: "ocr_unreadable" } as never,
    ]);

    expect(debug.totalPages).toBe(2);
    expect(debug.pagesWithText).toBe(2);
    expect(debug.totalCharacters).toBe(58);
    expect(debug.totalLines).toBe(3);
    expect(debug.totalSelectionMarks).toBe(1);
    expect(debug.pages[1].lineCount).toBe(2);
    expect(debug.pages[1].selectionMarkCount).toBe(1);
    expect(debug.pages[1].hasReadableText).toBe(true);
    expect(debug.pages[1].detectedFormName).toContain("Individual Annuity Application");
  });

  it("builds diagnostic summary messages", () => {
    const summary = buildOcrDiagnosticSummary(
      {
        totalCharacters: 0,
        totalSelectionMarks: 0,
        pagesWithText: 0,
        totalPages: 3,
      },
      5
    );
    expect(summary).toContain("Azure OCR returned no readable text.");
    expect(summary).toContain("No Azure checkbox/selection marks detected.");
    expect(summary).toContain("OCR only succeeded on some pages.");
  });

  it("notes validation mismatch when OCR text exists but findings are unreadable", () => {
    const summary = buildOcrDiagnosticSummary(
      {
        totalCharacters: 1200,
        totalSelectionMarks: 0,
        pagesWithText: 3,
        totalPages: 3,
      },
      4
    );
    expect(summary).toContain(
      "OCR text exists, but validation matching/classification may be failing."
    );
  });
});

describe("runDocumentIntelligence debug attachment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("omits debug in production when ENABLE_OCR_DEBUG is not true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_OCR_DEBUG", "");

    vi.doMock("../extract-pdf-text", () => ({
      extractPdfPages: vi.fn(async () => ({
        pages: [
          {
            pageNumber: 1,
            rawText: "",
            normalizedText: "",
            charCount: 0,
            hasEmbeddedText: false,
            classification: "unknown",
            classificationConfidence: "low",
          },
        ],
        pageCount: 1,
        fullText: "",
        hasEmbeddedText: false,
        hasOcrText: false,
        ocrProviderName: "disabled",
      })),
      normalizeText: (text: string) => text.toLowerCase(),
    }));

    const { runDocumentIntelligence } = await import("../validation-engine");
    const result = await runDocumentIntelligence(new ArrayBuffer(8), "scan.pdf", [], {
      ocrProvider: {
        name: "disabled",
        isAvailable: () => false,
        recognize: async () => ({ provider: "disabled", pages: [] }),
      },
    });

    expect(result.debug).toBeUndefined();
  });

  it("includes debug when ENABLE_OCR_DEBUG=true in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_OCR_DEBUG", "true");

    vi.doMock("../extract-pdf-text", () => ({
      extractPdfPages: vi.fn(async () => ({
        pages: [
          {
            pageNumber: 1,
            rawText: "Individual Annuity Application",
            normalizedText: "individual annuity application",
            charCount: 30,
            hasEmbeddedText: true,
            classification: "application_page_1",
            classificationConfidence: "high",
            ocrLines: [{ text: "Individual Annuity Application", confidence: "high" }],
          },
        ],
        pageCount: 1,
        fullText: "Individual Annuity Application",
        hasEmbeddedText: true,
        hasOcrText: false,
        ocrProviderName: "azure",
        ocrDiagnostics: {
          providerSelected: "azure",
          attempted: true,
          candidatePageCount: 1,
          returnedPageCount: 1,
          lineCount: 1,
          enrichedPageCount: 0,
        },
      })),
      normalizeText: (text: string) => text.toLowerCase(),
    }));

    const { runDocumentIntelligence } = await import("../validation-engine");
    const result = await runDocumentIntelligence(new ArrayBuffer(8), "scan.pdf", [], {
      ocrProvider: {
        name: "azure",
        isAvailable: () => true,
        recognize: async () => ({ provider: "azure", pages: [] }),
      },
    });

    expect(result.debug).toBeDefined();
    expect(result.debug?.ocrProvider).toBe("azure");
    expect(result.debug?.totalPages).toBe(1);
    expect(result.debug?.totalCharacters).toBeGreaterThan(0);
  });
});
