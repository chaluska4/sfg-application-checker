import type { DetectedCheckbox, PageAnalysis } from "./types";
import { pageHasUsableText } from "./ocr";

const CHECK_MARKS = /(?:\[x\]|\[X\]|\(x\)|\(X\)|☑|✓|✔|■)/;
const YES_NEAR = /\byes\b/i;

const CHECKBOX_SPECS = [
  { label: "replacement", patterns: [/replac(e|ing|ement)/i, /existing (life|annuity|insurance)/i] },
  { label: "transfer_1035", patterns: [/1035/i, /transfer/i] },
  { label: "tax_qualified", patterns: [/tax.?qualif/i, /ira\b/i, /401\s*\(?k\)?/i] },
  { label: "source_of_funds_other", patterns: [/source of funds/i, /\bother\b/i] },
] as const;

export function detectCheckboxes(pages: PageAnalysis[]): DetectedCheckbox[] {
  const results: DetectedCheckbox[] = [];

  for (const page of pages) {
    if (!pageHasUsableText(page)) continue;
    const text = page.rawText;

    for (const { label, patterns } of CHECKBOX_SPECS) {
      const contextHit = patterns.some((p) => p.test(text));
      if (!contextHit) continue;

      const selectionMark = detectSelectionMarkForLabel(page, label);
      const textChecked =
        CHECK_MARKS.test(text) || (YES_NEAR.test(text) && /replac|transfer|other/i.test(text));

      const checked = selectionMark?.checked ?? textChecked;
      const source: DetectedCheckbox["source"] = selectionMark ? "selection_mark" : "text";

      results.push({
        label,
        checked,
        page: page.pageNumber,
        confidence: selectionMark?.confidence ?? (checked ? "medium" : "low"),
        source,
      });
    }
  }

  return dedupeCheckboxes(results);
}

function detectSelectionMarkForLabel(
  page: PageAnalysis,
  label: string
): { checked: boolean; confidence: DetectedCheckbox["confidence"] } | null {
  const marks = page.ocrSelectionMarks;
  if (!marks?.length) return null;

  const selected = marks.filter((mark) => mark.state === "selected");
  if (!selected.length) {
    const unselected = marks.filter((mark) => mark.state === "unselected");
    if (!unselected.length) return null;
    return { checked: false, confidence: unselected[0].confidence };
  }

  if (label === "replacement" || label === "transfer_1035") {
    return { checked: true, confidence: selected[0].confidence };
  }

  return { checked: selected.length > 0, confidence: selected[0].confidence };
}

function dedupeCheckboxes(items: DetectedCheckbox[]): DetectedCheckbox[] {
  const map = new Map<string, DetectedCheckbox>();
  for (const item of items) {
    const existing = map.get(item.label);
    if (!existing || (item.checked && !existing.checked)) map.set(item.label, item);
    if (existing && item.source === "selection_mark") map.set(item.label, item);
  }
  return [...map.values()];
}

export function isCheckboxChecked(
  checkboxes: DetectedCheckbox[],
  label: string
): boolean {
  return checkboxes.some((c) => c.label === label && c.checked);
}
