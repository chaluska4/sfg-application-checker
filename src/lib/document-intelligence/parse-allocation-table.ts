import type { PageAnalysis } from "./types";

const ALLOCATION_SECTION_PATTERN =
  /initial\s+premium\s+allocation\s*[-–]?\s*required/i;
const ALLOCATION_TOTAL_PATTERN = /total\s*100\s*%/i;

const EXPLANATORY_LINE_PATTERN =
  /surrender\s+charge|penalty|illustration|guaranteed|guarantee|minimum\s+guaranteed|maximum|example|withdrawal|interest\s+rate|cap\s+rate|participation\s+rate|index\s+rate|fee|bonus|income\s+value|not\s+to\s+exceed|up\s+to\s+\d/i;

const PERCENT_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*%/g;

export function extractAllocationTableText(text: string): string | null {
  const match = ALLOCATION_SECTION_PATTERN.exec(text);
  if (!match || match.index === undefined) return null;

  const fromSection = text.slice(match.index, match.index + 4000);
  const nextSection = fromSection.search(
    /\n\s*(?:financial needs analysis|owner information|product disclosure|acknowledg)/i
  );
  return nextSection > 0 ? fromSection.slice(0, nextSection) : fromSection;
}

export function parseAllocationPercents(tableText: string): number[] {
  const percents: number[] = [];

  for (const line of tableText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || EXPLANATORY_LINE_PATTERN.test(trimmed)) continue;
    if (/^total\b/i.test(trimmed)) continue;

    PERCENT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PERCENT_PATTERN.exec(trimmed)) !== null) {
      const value = parseFloat(match[1]);
      if (!Number.isNaN(value) && value > 0 && value <= 100) {
        percents.push(value);
      }
    }
  }

  return percents;
}

export function computeAllocationTotal(text: string): number | null {
  const tableText = extractAllocationTableText(text);
  if (!tableText) return null;

  const percents = parseAllocationPercents(tableText);
  if (percents.length < 2) return null;

  const sum = percents.reduce((total, value) => total + value, 0);
  const rounded = Math.round(sum * 100) / 100;

  if (ALLOCATION_TOTAL_PATTERN.test(tableText) && rounded === 100) {
    return 100;
  }

  if (rounded >= 99.5 && rounded <= 100.5) {
    return 100;
  }

  return rounded;
}

export function computeAllocationTotalFromPages(pages: PageAnalysis[]): number | null {
  let best: number | null = null;

  for (const page of pages) {
    const total = computeAllocationTotal(page.rawText);
    if (total === null) continue;
    if (total === 100) return 100;
    if (best === null || total > best) best = total;
  }

  const combined = computeAllocationTotal(pages.map((page) => page.rawText).join("\n"));
  if (combined === 100) return 100;
  if (combined !== null && (best === null || Math.abs(combined - 100) < Math.abs(best - 100))) {
    best = combined;
  }

  return best;
}

export function pageHasAllocationTable(page: PageAnalysis): boolean {
  return extractAllocationTableText(page.rawText) !== null;
}
