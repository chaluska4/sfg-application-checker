export type {
  OcrBoundingBox,
  OcrPageResult,
  OcrPageRequest,
  OcrRecognizeRequest,
  OcrResult,
  OcrSelectionMark,
  OcrTextLine,
} from "./types";
export type { OcrProvider } from "./ocr-provider";
export { disabledOcrProvider } from "./ocr-provider";
export {
  createAzureDocumentIntelligenceProvider,
  type AzureDocumentIntelligenceConfig,
} from "./azure-document-intelligence-provider";
export {
  formatAzurePagesQuery,
  mapAzureAnalyzeResultToOcrResult,
  mapAzureConfidence,
  type AzureAnalyzeOperationOutput,
  type AzureAnalyzeResult,
} from "./map-azure-analyze-result";
export { resolveOcrProvider } from "./resolve-ocr-provider";
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
  type OcrEnrichmentResult,
} from "./enrich-pages-with-ocr";
export { readOcrServerEnv } from "./ocr-env";
export { logOcrDiagnostics, sanitizeOcrError, type OcrDiagnostics } from "./ocr-dev-log";
