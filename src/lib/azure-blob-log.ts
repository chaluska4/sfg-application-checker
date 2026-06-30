import { sanitizeOcrError } from "@/lib/document-intelligence/ocr/ocr-dev-log";

export type AzureBlobLogAction = "upload" | "download" | "delete" | "review" | "sas-create";

export interface AzureBlobLogEvent {
  requestId: string;
  action: AzureBlobLogAction;
  success: boolean;
  fileSizeBytes?: number;
  pageCount?: number;
  durationMs?: number;
  error?: unknown;
}

export function logAzureBlobEvent(event: AzureBlobLogEvent): void {
  const payload: Record<string, string | number | boolean> = {
    requestId: event.requestId,
    action: event.action,
    success: event.success,
  };

  if (typeof event.fileSizeBytes === "number") {
    payload.fileSizeBytes = event.fileSizeBytes;
  }

  if (typeof event.pageCount === "number") {
    payload.pageCount = event.pageCount;
  }

  if (typeof event.durationMs === "number") {
    payload.durationMs = event.durationMs;
  }

  if (!event.success && event.error !== undefined) {
    payload.error = sanitizeOcrError(event.error);
  }

  const message = `[sfg-azure-blob] ${event.action} ${event.success ? "succeeded" : "failed"}`;

  if (event.success) {
    console.info(message, payload);
    return;
  }

  console.error(message, payload);
}
