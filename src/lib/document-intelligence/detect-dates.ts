import type { ConfidenceLevel, DetectedDate, PageAnalysis } from "./types";
import { pageHasUsableText } from "./ocr";

const DATE_PATTERNS = [
  /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{2}|\d{4})\b/g,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
];

const DOB_CONTEXT_PATTERN =
  /date\s+of\s+birth|d\.?\s*o\.?\s*b\.?|birth\s*date|born\s+on|birthday/i;

const SIGNATURE_DATE_LABELS = [
  /owner.{0,30}signature.{0,20}date/i,
  /owner.{0,20}date\s*(?:signed|of\s+signature)/i,
  /agent.{0,30}signature.{0,20}date/i,
  /agent.{0,20}date\s*(?:signed|of\s+signature)/i,
  /producer.{0,30}signature.{0,20}date/i,
  /signature\s+date/i,
  /date\s+signed/i,
  /disclosure.{0,30}signature.{0,20}date/i,
];

const GENERIC_DATE_LABELS = [
  /application date/i,
];

const PROXIMITY_WINDOW = 160;

function resetDatePatterns(): void {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
  }
}

function findDatesInText(text: string, start = 0, end = text.length): { value: string; index: number }[] {
  const slice = text.slice(start, end);
  const dates: { value: string; index: number }[] = [];

  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(slice)) !== null) {
      dates.push({
        value: match[0],
        index: start + match.index,
      });
    }
  }

  return dates;
}

function isDobContext(text: string, dateIndex: number): boolean {
  const window = text.slice(Math.max(0, dateIndex - 90), dateIndex + 30);
  return DOB_CONTEXT_PATTERN.test(window);
}

function isSignatureDateLabelContext(labelText: string, nearbyText: string): boolean {
  if (DOB_CONTEXT_PATTERN.test(labelText)) return false;
  if (/owner|annuitant/i.test(labelText) && /date/i.test(labelText) && !/signature/i.test(labelText)) {
    return DOB_CONTEXT_PATTERN.test(nearbyText);
  }
  return true;
}

export function hasSignatureDateNearLabels(
  text: string,
  labelPatterns?: RegExp[]
): { present: boolean; confidence: ConfidenceLevel; matchedDate?: string } {
  const patterns = labelPatterns?.length ? labelPatterns : [...SIGNATURE_DATE_LABELS, ...GENERIC_DATE_LABELS];

  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let labelMatch: RegExpExecArray | null;

    while ((labelMatch = regex.exec(text)) !== null) {
      const labelStart = labelMatch.index;
      const labelText = labelMatch[0];
      const windowEnd = Math.min(text.length, labelStart + PROXIMITY_WINDOW);
      const nearbyText = text.slice(labelStart, windowEnd);

      if (!isSignatureDateLabelContext(labelText, nearbyText)) continue;

      const dates = findDatesInText(text, labelStart, windowEnd).filter(
        (date) => !isDobContext(text, date.index)
      );

      if (dates.length > 0) {
        const signatureAdjacent = /signature/i.test(nearbyText);
        return {
          present: true,
          confidence: signatureAdjacent ? "high" : "medium",
          matchedDate: dates[0].value,
        };
      }
    }
  }

  return { present: false, confidence: "low" };
}

export function hasDateNearLabels(text: string): { present: boolean; confidence: ConfidenceLevel } {
  return hasSignatureDateNearLabels(text);
}

export function detectDates(pages: PageAnalysis[]): DetectedDate[] {
  const results: DetectedDate[] = [];

  for (const page of pages) {
    if (!pageHasUsableText(page)) continue;
    const text = page.rawText;
    const signatureDate = hasSignatureDateNearLabels(text);

    if (signatureDate.present) {
      results.push({
        label: "signature_date",
        page: page.pageNumber,
        present: true,
        confidence: signatureDate.confidence,
      });
    }
  }

  return results;
}

export function extractDateMatches(text: string, signatureOnly = true): string[] {
  if (signatureOnly) {
    const hit = hasSignatureDateNearLabels(text);
    return hit.matchedDate ? [hit.matchedDate] : [];
  }

  const matches: string[] = [];
  resetDatePatterns();
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (!isDobContext(text, match.index)) {
        matches.push(match[0]);
      }
    }
  }
  return matches;
}
