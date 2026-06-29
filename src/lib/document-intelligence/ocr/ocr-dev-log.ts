export interface OcrDiagnostics {
  providerSelected: string;
  attempted: boolean;
  candidatePageCount: number;
  returnedPageCount: number;
  lineCount: number;
  enrichedPageCount: number;
  error?: string;
}

const SECRET_LIKE = /[A-Za-z0-9+/=]{24,}/g;
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{9}\b/g,
  /\b\d{3}\s\d{2}\s\d{4}\b/g,
];

export function sanitizeOcrError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(SECRET_LIKE, "[redacted]");
  for (const pattern of PII_PATTERNS) {
    message = message.replace(pattern, "[redacted]");
  }
  return message.slice(0, 400);
}

export function logOcrDiagnostics(diagnostics: OcrDiagnostics): void {
  if (process.env.NODE_ENV !== "development") return;

  console.info(
    "[document-intelligence][ocr]",
    `provider=${diagnostics.providerSelected}`,
    `attempted=${diagnostics.attempted ? "yes" : "no"}`,
    `candidatePages=${diagnostics.candidatePageCount}`,
    `returnedPages=${diagnostics.returnedPageCount}`,
    `lines=${diagnostics.lineCount}`,
    `enrichedPages=${diagnostics.enrichedPageCount}`,
    diagnostics.error ? `error=${diagnostics.error}` : ""
  );
}
