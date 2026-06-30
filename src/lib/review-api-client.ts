import type { ReviewResult } from "@/lib/validation/types";
import { MAX_PDF_SIZE_ERROR } from "@/lib/upload-security";

export class ReviewApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewApiError";
  }
}

function isJsonContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes("application/json");
}

export function getFriendlyReviewHttpError(status: number, bodyText: string): string {
  const normalized = bodyText.trim();

  if (
    status === 413 ||
    /request entity too large/i.test(normalized) ||
    /payload too large/i.test(normalized)
  ) {
    return MAX_PDF_SIZE_ERROR;
  }

  if (status === 401) {
    return "Your session has expired. Please sign in and try again.";
  }

  if (status === 504 || /timed?\s*out/i.test(normalized) || /timeout/i.test(normalized)) {
    return "The review took too long to complete. Try a smaller PDF or try again in a moment.";
  }

  if (status === 502) {
    return "The review service is temporarily unavailable. Please try again shortly.";
  }

  if (normalized.length > 0 && normalized.length <= 200 && !/^</.test(normalized)) {
    return normalized;
  }

  if (status >= 500) {
    return "The server could not process your PDF. Please try again later.";
  }

  return "Review failed. Please try again.";
}

async function readJsonError(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim().length > 0) {
      return data.error;
    }
  } catch {
    // Fall through to status-based messaging.
  }
  return undefined;
}

export async function readReviewApiError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (isJsonContentType(contentType)) {
    const jsonError = await readJsonError(response);
    if (jsonError) return jsonError;
  } else {
    const text = await response.text();
    return getFriendlyReviewHttpError(response.status, text);
  }

  return getFriendlyReviewHttpError(response.status, "");
}

export async function parseReviewApiResponse(response: Response): Promise<ReviewResult> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    throw new ReviewApiError(await readReviewApiError(response));
  }

  if (!isJsonContentType(contentType)) {
    const text = await response.text();
    throw new ReviewApiError(getFriendlyReviewHttpError(response.status, text));
  }

  try {
    return (await response.json()) as ReviewResult;
  } catch {
    throw new ReviewApiError(
      "Received an invalid response from the server. Please try again."
    );
  }
}

export async function submitReviewPdf(file: File): Promise<ReviewResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/review", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  return parseReviewApiResponse(response);
}
