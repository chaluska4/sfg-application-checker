import type { HighlightRegion, ValidationResultItem } from "@/lib/validation/types";

/** Page number for PDF scroll target (1-based). */
export function getFindingTargetPage(item: ValidationResultItem): number | null {
  const page = item.actualPage ?? item.page ?? null;
  if (page == null || page < 1) return null;
  return page;
}

/** Highlight regions for a finding, preferring highlightRegions then boundingBox. */
export function getFindingHighlightsForPage(
  item: ValidationResultItem,
  pageNumber: number
): HighlightRegion[] {
  const regions: HighlightRegion[] = [];

  if (item.highlightRegions?.length) {
    for (const region of item.highlightRegions) {
      if (region.pageNumber === pageNumber) {
        regions.push(region);
      }
    }
  }

  if (!regions.length && item.boundingBox && item.boundingBox.page === pageNumber) {
    regions.push({
      pageNumber,
      label: item.label,
      boundingBox: item.boundingBox,
      snippet: item.evidenceSnippet ?? undefined,
    });
  }

  return regions;
}

export function getActiveHighlightsForPage(
  items: ValidationResultItem[],
  selectedFindingId: string | null,
  pageNumber: number
): HighlightRegion[] {
  if (!selectedFindingId) return [];
  const item = items.find((entry) => entry.ruleId === selectedFindingId);
  if (!item) return [];
  return getFindingHighlightsForPage(item, pageNumber);
}
