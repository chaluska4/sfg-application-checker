import type { ConfidenceLevel } from "../types";
import type { OcrProvider } from "./ocr-provider";
import type { OcrBoundingBox, OcrPageResult, OcrRecognizeRequest, OcrTextLine } from "./types";

export interface MockOcrPageConfig {
  fullText: string;
  lines?: OcrTextLine[];
  confidence?: ConfidenceLevel;
}

export interface MockOcrProviderOptions {
  name?: string;
  /** Page number → OCR output. Pages not listed return empty OCR. */
  pages: Record<number, MockOcrPageConfig>;
}

function defaultLines(fullText: string, pageNumber: number, confidence: ConfidenceLevel): OcrTextLine[] {
  if (!fullText.trim()) return [];
  return [
    {
      text: fullText,
      confidence,
      boundingBox: {
        page: pageNumber,
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.05,
      },
    },
  ];
}

export function createMockOcrProvider(options: MockOcrProviderOptions): OcrProvider {
  const providerName = options.name ?? "mock";

  return {
    name: providerName,
    isAvailable() {
      return true;
    },
    async recognize(request: OcrRecognizeRequest) {
      const pages: OcrPageResult[] = request.pages.map((pageReq) => {
        const config = options.pages[pageReq.pageNumber];
        if (!config) {
          return {
            pageNumber: pageReq.pageNumber,
            fullText: "",
            lines: [],
            confidence: "low" as const,
          };
        }

        const confidence = config.confidence ?? "medium";
        const lines =
          config.lines ??
          defaultLines(config.fullText, pageReq.pageNumber, confidence);

        return {
          pageNumber: pageReq.pageNumber,
          fullText: config.fullText,
          lines,
          confidence,
        };
      });

      return { provider: providerName, pages };
    },
  };
}

export function mockOcrBoundingBox(
  page: number,
  overrides: Partial<Omit<OcrBoundingBox, "page">> = {}
): OcrBoundingBox {
  return {
    page,
    x: 0.12,
    y: 0.22,
    width: 0.45,
    height: 0.04,
    ...overrides,
  };
}
