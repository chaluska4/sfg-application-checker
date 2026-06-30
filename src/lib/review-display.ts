import type { ExtractionMode, FieldStatus, ReviewResult } from "@/lib/validation/types";

const STATUS_DISPLAY_LABELS: Record<FieldStatus, string> = {
  present: "PASS",
  missing: "MISSING",
  incomplete: "INCOMPLETE",
  needs_manual_verification: "MANUAL REVIEW",
  conditional_review: "CONDITIONAL_REVIEW",
  low_confidence: "LOW_CONFIDENCE",
  ocr_unreadable: "OCR_UNREADABLE",
  not_applicable: "NOT_APPLICABLE",
};

export function getStatusDisplayLabel(status: FieldStatus): string {
  return STATUS_DISPLAY_LABELS[status] ?? status.toUpperCase();
}

/** Boilerplate copied on every image-only finding — shown once in the dashboard notice instead. */
export function isRedundantFindingMessage(message: string | undefined): boolean {
  if (!message?.trim()) return true;
  if (/^Image-only or low-confidence extraction/i.test(message)) return true;
  if (/page scanned packet — verify using/i.test(message)) return true;
  if (/Manual verification required — not marked missing/i.test(message)) return true;
  if (/No readable text or OCR output/i.test(message)) return true;
  return false;
}

export function buildDocumentIntelligenceNotice(result: ReviewResult): string {
  const { extractionMode, pageCount, disclaimer, summary } = result;
  const unreadable = summary.ocrUnreadable > 0;
  const lowConfidence = summary.lowConfidence > 0;

  if (extractionMode === "image_only" && unreadable) {
    const pageNote =
      pageCount > 1
        ? ` This ${pageCount}-page packet has no readable OCR output — use template guidance below.`
        : "";
    return `Scanned pages could not be read by OCR.${pageNote} ${disclaimer}`;
  }

  if (extractionMode === "image_only" || lowConfidence) {
    const pageNote =
      pageCount > 1
        ? ` This ${pageCount}-page packet was reviewed using OCR evidence where available.`
        : "";
    return `Scanned packet reviewed from OCR evidence.${pageNote} Items marked LOW_CONFIDENCE or OCR_UNREADABLE need reviewer confirmation. ${disclaimer}`;
  }

  if (extractionMode === "mixed") {
    const pageNote =
      pageCount > 1 ? ` This ${pageCount}-page packet includes scanned sections.` : "";
    return `Mixed embedded text and image-only pages — scanned sections use OCR evidence.${pageNote} ${disclaimer}`;
  }

  return disclaimer;
}

export function shouldShowStandaloneDisclaimer(extractionMode: ExtractionMode): boolean {
  return extractionMode === "embedded_text";
}
