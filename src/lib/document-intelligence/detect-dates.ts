import type { ConfidenceLevel, DetectedDate, PageAnalysis } from "./types";
import { pageHasUsableText } from "./ocr";

const DATE_PATTERNS = [
  /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{2}|\d{4})\b/g,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
];

const DATE_LABELS = [
  /owner.{0,20}date/i,
  /agent.{0,20}date/i,
  /signature.{0,20}date/i,
  /date signed/i,
  /application date/i,
];

export function detectDates(pages: PageAnalysis[]): DetectedDate[] {
  const results: DetectedDate[] = [];

  for (const page of pages) {
    if (!pageHasUsableText(page)) continue;
    const text = page.rawText;
    const hasDateLabel = DATE_LABELS.some((p) => p.test(text));
    const hasDateValue = DATE_PATTERNS.some((p) => {
      p.lastIndex = 0;
      return p.test(text);
    });

    if (hasDateLabel || hasDateValue) {
      results.push({
        label: hasDateLabel ? "labeled_date" : "date_value",
        page: page.pageNumber,
        present: hasDateValue,
        confidence: hasDateLabel && hasDateValue ? "high" : hasDateValue ? "medium" : "low",
      });
    }
  }

  return results;
}

export function hasDateNearLabels(text: string): { present: boolean; confidence: ConfidenceLevel } {
  const normalized = text;
  const labelHit = DATE_LABELS.some((p) => p.test(normalized));
  const valueHit = DATE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(normalized);
  });
  if (labelHit && valueHit) return { present: true, confidence: "high" };
  if (valueHit) return { present: true, confidence: "medium" };
  return { present: false, confidence: "low" };
}

export function extractDateMatches(text: string): string[] {
  const matches: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push(m[0]);
    }
  }
  return matches;
}
