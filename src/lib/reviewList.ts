import type { ValidationResultItem, GroupedChecklist, FieldStatus } from "@/lib/validation/types";

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
    const key = `${item.page}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, {
        page: item.page,
        section: item.section,
        documentType: item.documentType,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }

  return [...map.values()]
    .sort((a, b) => a.page - b.page || a.section.localeCompare(b.section))
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
    const key = `${item.page}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, {
        page: item.page,
        section: item.section,
        documentType: item.documentType,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }
  return [...map.values()].sort((a, b) => a.page - b.page || a.section.localeCompare(b.section));
}
