import type { ValidationResultItem, GroupedChecklist, FieldStatus } from "@/lib/validation/types";
import { comparePageGroups } from "@/lib/document-intelligence/resolve-finding-page";

const SEVERITY_ORDER: Record<FieldStatus, number> = {
  missing: 0,
  conditional_review: 1,
  needs_manual_verification: 2,
  present: 3,
  not_applicable: 4,
};

const ISSUE_STATUSES: FieldStatus[] = [
  "missing",
  "needs_manual_verification",
  "conditional_review",
];

export function buildMasterReviewGroups(items: ValidationResultItem[]): GroupedChecklist[] {
  const reviewItems = items.filter((item) => ISSUE_STATUSES.includes(item.status));
  const map = new Map<string, GroupedChecklist>();

  for (const item of reviewItems) {
    const key = `${item.pageLabel}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, {
        page: item.page,
        pageLabel: item.pageLabel,
        section: item.section,
        documentType: item.documentType,
        locationConfidence: item.locationConfidence,
        expectedDocument: item.expectedDocument,
        typicalLocation: item.typicalLocation,
        expectedPageLabel: item.expectedPageLabel,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }

  return [...map.values()]
    .sort((a, b) =>
      comparePageGroups(
        {
          page: a.page,
          section: a.section,
          typicalPageRange: a.items[0]?.typicalPageRange,
          locationConfidence: a.locationConfidence,
        },
        {
          page: b.page,
          section: b.section,
          typicalPageRange: b.items[0]?.typicalPageRange,
          locationConfidence: b.locationConfidence,
        }
      )
    )
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status]
      ),
    }));
}

export function groupAllItems(items: ValidationResultItem[]): GroupedChecklist[] {
  const map = new Map<string, GroupedChecklist>();
  for (const item of items) {
    const key = `${item.pageLabel}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, {
        page: item.page,
        pageLabel: item.pageLabel,
        section: item.section,
        documentType: item.documentType,
        locationConfidence: item.locationConfidence,
        expectedDocument: item.expectedDocument,
        typicalLocation: item.typicalLocation,
        expectedPageLabel: item.expectedPageLabel,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }
  return [...map.values()].sort((a, b) =>
    comparePageGroups(
      {
        page: a.page,
        section: a.section,
        typicalPageRange: a.items[0]?.typicalPageRange,
        locationConfidence: a.locationConfidence,
      },
      {
        page: b.page,
        section: b.section,
        typicalPageRange: b.items[0]?.typicalPageRange,
        locationConfidence: b.locationConfidence,
      }
    )
  );
}
