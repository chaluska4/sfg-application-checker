import type { OcrProvider } from "./ocr-provider";
import type { OcrRecognizeRequest, OcrResult } from "./types";
import { clonePdfArrayBuffer, logPdfBufferDiagnostics } from "@/lib/pdf-buffer";
import {
  type AzureAnalyzeOperationOutput,
  formatAzurePagesQuery,
  mapAzureAnalyzeResultToOcrResult,
} from "./map-azure-analyze-result";

const DEFAULT_MODEL_ID = "prebuilt-layout";
const DEFAULT_API_VERSION = "2024-11-30";
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_POLL_ATTEMPTS = 25;

export interface AzureDocumentIntelligenceConfig {
  endpoint: string;
  apiKey: string;
  modelId?: string;
  apiVersion?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  fetchFn?: typeof fetch;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const safeBuffer = clonePdfArrayBuffer(buffer);
  return Buffer.from(safeBuffer).toString("base64");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAzureDocumentIntelligenceProvider(
  config: AzureDocumentIntelligenceConfig
): OcrProvider {
  const endpoint = normalizeEndpoint(config.endpoint);
  const modelId = config.modelId ?? DEFAULT_MODEL_ID;
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPollAttempts = config.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  const fetchFn = config.fetchFn ?? fetch;

  return {
    name: "azure",
    isAvailable() {
      return Boolean(config.endpoint && config.apiKey);
    },
    async recognize(request: OcrRecognizeRequest): Promise<OcrResult> {
      if (!request.pdfBuffer) {
        throw new Error("Azure Document Intelligence OCR requires pdfBuffer on the recognize request.");
      }

      logPdfBufferDiagnostics("azure-ocr-request", request.pdfBuffer);
      const safePdfBuffer = clonePdfArrayBuffer(request.pdfBuffer);
      logPdfBufferDiagnostics("azure-ocr-safe-copy", safePdfBuffer);

      const pageNumbers = request.pages.map((page) => page.pageNumber);
      const pagesQuery = formatAzurePagesQuery(pageNumbers);
      const analyzeUrl = new URL(
        `${endpoint}/documentintelligence/documentModels/${modelId}:analyze`
      );
      analyzeUrl.searchParams.set("api-version", apiVersion);
      analyzeUrl.searchParams.set("pages", pagesQuery);

      const startResponse = await fetchFn(analyzeUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": config.apiKey,
        },
        body: JSON.stringify({
          base64Source: arrayBufferToBase64(safePdfBuffer),
        }),
      });

      if (!startResponse.ok) {
        const errorBody = await startResponse.text();
        throw new Error(
          `Azure Document Intelligence analyze request failed (${startResponse.status}): ${errorBody}`
        );
      }

      const operationLocation = startResponse.headers.get("operation-location");
      if (!operationLocation) {
        throw new Error("Azure Document Intelligence analyze response missing Operation-Location header.");
      }

      let result: AzureAnalyzeOperationOutput | null = null;
      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        const pollResponse = await fetchFn(operationLocation, {
          headers: {
            "Ocp-Apim-Subscription-Key": config.apiKey,
          },
        });

        if (!pollResponse.ok) {
          const errorBody = await pollResponse.text();
          throw new Error(
            `Azure Document Intelligence poll failed (${pollResponse.status}): ${errorBody}`
          );
        }

        result = (await pollResponse.json()) as AzureAnalyzeOperationOutput;
        if (result.status === "succeeded") break;
        if (result.status === "failed" || result.status === "canceled") {
          throw new Error(
            `Azure Document Intelligence analyze ${result.status}: ${result.error?.message ?? "Unknown error"}`
          );
        }

        await sleep(pollIntervalMs);
      }

      if (!result || result.status !== "succeeded" || !result.analyzeResult) {
        throw new Error("Azure Document Intelligence analyze timed out before completion.");
      }

      return mapAzureAnalyzeResultToOcrResult(result.analyzeResult, pageNumbers);
    },
  };
}
