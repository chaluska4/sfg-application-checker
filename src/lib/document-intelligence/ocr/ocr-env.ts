/**
 * Read OCR-related env vars at runtime.
 * Uses bracket access so Next.js does not inline undefined at build time.
 */
export interface OcrServerEnv {
  provider: string;
  azureEndpoint: string;
  azureApiKey: string;
}

export function readOcrServerEnv(): OcrServerEnv {
  return {
    provider: (process.env["OCR_PROVIDER"] ?? "").trim().toLowerCase(),
    azureEndpoint: (process.env["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"] ?? "").trim(),
    azureApiKey: (process.env["AZURE_DOCUMENT_INTELLIGENCE_KEY"] ?? "").trim(),
  };
}
