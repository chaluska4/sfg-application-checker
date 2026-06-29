import type { DetectedCheckbox, PageAnalysis } from "./types";
import { pageHasUsableText } from "./ocr";

const CHECK_MARKS = /(?:\[x\]|\[X\]|\(x\)|\(X\)|☑|✓|✔|■)/;
const YES_NEAR = /\byes\b/i;

export function detectCheckboxes(pages: PageAnalysis[]): DetectedCheckbox[] {
  const results: DetectedCheckbox[] = [];
  const labels = [
    { label: "replacement", patterns: [/replac(e|ing|ement)/i, /existing (life|annuity|insurance)/i] },
    { label: "transfer_1035", patterns: [/1035/i, /transfer/i] },
    { label: "tax_qualified", patterns: [/tax.?qualif/i, /ira\b/i, /401\s*\(?k\)?/i] },
    { label: "source_of_funds_other", patterns: [/source of funds/i, /\bother\b/i] },
  ];

  for (const page of pages) {
    if (!pageHasUsableText(page)) continue;
    const text = page.rawText;

    for (const { label, patterns } of labels) {
      const contextHit = patterns.some((p) => p.test(text));
      if (!contextHit) continue;

      const checked =
        CHECK_MARKS.test(text) ||
        (YES_NEAR.test(text) && /replac|transfer|other/i.test(text));

      results.push({
        label,
        checked,
        page: page.pageNumber,
        confidence: checked ? "medium" : "low",
      });
    }
  }

  return dedupeCheckboxes(results);
}

function dedupeCheckboxes(items: DetectedCheckbox[]): DetectedCheckbox[] {
  const map = new Map<string, DetectedCheckbox>();
  for (const item of items) {
    const existing = map.get(item.label);
    if (!existing || (item.checked && !existing.checked)) map.set(item.label, item);
  }
  return [...map.values()];
}

export function isCheckboxChecked(
  checkboxes: DetectedCheckbox[],
  label: string
): boolean {
  return checkboxes.some((c) => c.label === label && c.checked);
}
