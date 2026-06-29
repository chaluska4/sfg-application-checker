export type {
  OcrBoundingBox,
  OcrPageResult,
  OcrPageRequest,
  OcrRecognizeRequest,
  OcrResult,
  OcrTextLine,
} from "./types";
export type { OcrProvider } from "./ocr-provider";
export { disabledOcrProvider } from "./ocr-provider";
export {
  createMockOcrProvider,
  mockOcrBoundingBox,
  type MockOcrPageConfig,
  type MockOcrProviderOptions,
} from "./mock-ocr-provider";
export {
  enrichPagesWithOcr,
  deriveExtractionMode,
  findOcrBoundingBoxForPatterns,
  ocrConfidenceForPage,
  packetHasOcrText,
  pageHasUsableText,
} from "./enrich-pages-with-ocr";
