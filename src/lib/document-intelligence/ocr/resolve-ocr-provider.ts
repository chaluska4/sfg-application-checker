import { createAzureDocumentIntelligenceProvider } from "./azure-document-intelligence-provider";
import { disabledOcrProvider } from "./ocr-provider";
import type { OcrProvider } from "./ocr-provider";
import { readOcrServerEnv } from "./ocr-env";

export function resolveOcrProvider(): OcrProvider {
  const env = readOcrServerEnv();
  if (env.provider !== "azure") return disabledOcrProvider;
  if (!env.azureEndpoint || !env.azureApiKey) return disabledOcrProvider;

  return createAzureDocumentIntelligenceProvider({
    endpoint: env.azureEndpoint,
    apiKey: env.azureApiKey,
  });
}
