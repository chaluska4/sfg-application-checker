import type { ChecklistItem, GroupedChecklist } from "./validation/types";

const SEVERITY_ORDER: Record<ChecklistItem["status"], number> = {
  missing: 0,
  warning: 1,
  completed: 2,
};

/** Missing and warning items grouped by page then section. */
export function buildMasterReviewGroups(items: ChecklistItem[]): GroupedChecklist[] {
  const reviewItems = items.filter(
    (item) => item.status === "missing" || item.status === "warning"
  );

  const map = new Map<string, GroupedChecklist>();

  for (const item of reviewItems) {
    const key = `${item.page}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, { page: item.page, section: item.section, items: [] });
    }
    map.get(key)!.items.push(item);
  }

  return Array.from(map.values())
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return a.section.localeCompare(b.section);
    })
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status]
      ),
    }));
}

export function groupAllItems(items: ChecklistItem[]): GroupedChecklist[] {
  const map = new Map<string, GroupedChecklist>();

  for (const item of items) {
    const key = `${item.page}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, { page: item.page, section: item.section, items: [] });
    }
    map.get(key)!.items.push(item);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return a.section.localeCompare(b.section);
  });
}
