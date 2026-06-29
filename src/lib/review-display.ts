import type { ExtractionMode, ReviewResult } from "@/lib/validation/types";

/** Boilerplate copied on every image-only finding — shown once in the dashboard notice instead. */
export function isRedundantFindingMessage(message: string | undefined): boolean {
  if (!message?.trim()) return true;
  if (/^Image-only or low-confidence extraction/i.test(message)) return true;
  if (/page scanned packet — verify using/i.test(message)) return true;
  if (/Manual verification required — not marked missing/i.test(message)) return true;
  return false;
}

export function buildDocumentIntelligenceNotice(result: ReviewResult): string {
  const { extractionMode, pageCount, disclaimer } = result;

  if (extractionMode === "image_only") {
    const pageNote =
      pageCount > 1
        ? ` This ${pageCount}-page packet was reviewed using Expected Location guidance below.`
        : "";
    return `Image-only / scanned pages require manual verification.${pageNote} ${disclaimer}`;
  }

  if (extractionMode === "mixed") {
    const pageNote =
      pageCount > 1 ? ` This ${pageCount}-page packet includes scanned sections.` : "";
    return `Mixed embedded text and image-only pages — scanned sections require manual verification.${pageNote} ${disclaimer}`;
  }

  return disclaimer;
}

export function shouldShowStandaloneDisclaimer(extractionMode: ExtractionMode): boolean {
  return extractionMode === "embedded_text";
}
