import type { ValidationResultItem, GroupedChecklist, FieldStatus, LocationConfidence } from "@/lib/validation/types";
import { isRedundantFindingMessage } from "@/lib/review-display";
import { CheckCircle2, XCircle, Eye, HelpCircle, MinusCircle, Info, MapPin } from "lucide-react";

const statusConfig: Record<
  FieldStatus,
  { icon: typeof CheckCircle2; iconClass: string; rowClass: string; badgeClass: string; badge: string }
> = {
  present: { icon: CheckCircle2, iconClass: "text-success", rowClass: "bg-success-light/40 border-success/15", badgeClass: "bg-success-light text-success", badge: "Present" },
  missing: { icon: XCircle, iconClass: "text-red-accent", rowClass: "bg-red-light/40 border-red-accent/15", badgeClass: "bg-red-light text-red-accent", badge: "Missing" },
  needs_manual_verification: { icon: Eye, iconClass: "text-navy", rowClass: "bg-navy/5 border-navy/10", badgeClass: "bg-navy/10 text-navy", badge: "Needs Manual Verification" },
  conditional_review: { icon: HelpCircle, iconClass: "text-warning", rowClass: "bg-warning-light/40 border-warning/15", badgeClass: "bg-warning-light text-warning", badge: "Conditional Review" },
  not_applicable: { icon: MinusCircle, iconClass: "text-gray-400", rowClass: "bg-gray-50 border-gray-200", badgeClass: "bg-gray-100 text-gray-500", badge: "Not Applicable" },
};

function LocationGuidance({
  item,
  groupLocationConfidence,
  groupTypicalLocation,
}: {
  item: ValidationResultItem;
  groupLocationConfidence?: LocationConfidence;
  groupTypicalLocation?: string | null;
}) {
  const locationMatchesGroup = item.locationConfidence === groupLocationConfidence;

  if (locationMatchesGroup && groupLocationConfidence === "actual") {
    return null;
  }

  if (locationMatchesGroup && groupLocationConfidence === "template") {
    if (item.typicalLocation && item.typicalLocation !== groupTypicalLocation) {
      return (
        <p className="mt-1 text-xs text-gray-600">
          <span className="font-medium text-navy">Section:</span> {item.typicalLocation}
        </p>
      );
    }
    return null;
  }

  if (locationMatchesGroup && groupLocationConfidence === "packet") {
    return null;
  }

  if (item.locationConfidence === "actual" && item.actualPageLabel) {
    return (
      <p className="mt-1 text-xs text-gray-600">
        <span className="font-medium text-navy">Actual Page:</span> {item.actualPageLabel}
      </p>
    );
  }

  if (item.locationConfidence === "template" && item.expectedDocument) {
    return (
      <div className="mt-1 space-y-0.5 text-xs text-gray-600">
        <p>
          <span className="font-medium text-navy">Expected Location:</span> {item.expectedDocument}
          {item.expectedPageLabel ? `, ${item.expectedPageLabel}` : ""}
        </p>
        {item.typicalLocation && (
          <p>
            <span className="font-medium text-navy">Section:</span> {item.typicalLocation}
          </p>
        )}
      </div>
    );
  }

  if (item.locationConfidence === "packet") {
    return (
      <p className="mt-1 text-xs text-gray-600">
        <span className="font-medium text-navy">Packet-level review</span>
      </p>
    );
  }

  return null;
}

function ChecklistRow({
  item,
  groupLocationConfidence,
  groupTypicalLocation,
}: {
  item: ValidationResultItem;
  groupLocationConfidence?: LocationConfidence;
  groupTypicalLocation?: string | null;
}) {
  const config = statusConfig[item.status];
  const Icon = config.icon;
  const showMessage = item.message && !isRedundantFindingMessage(item.message);

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${config.rowClass}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-navy">{item.label}</p>
          {item.isConditional && (
            <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2 py-0.5 text-xs font-medium text-navy/70">
              <Info className="h-3 w-3" />
              Conditional
            </span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.badgeClass}`}>
            {config.badge}
          </span>
        </div>
        <LocationGuidance
          item={item}
          groupLocationConfidence={groupLocationConfidence}
          groupTypicalLocation={groupTypicalLocation}
        />
        {item.manualReviewHint &&
          (item.status === "needs_manual_verification" ||
            item.status === "conditional_review") && (
            <p className="mt-1.5 text-xs italic text-gray-500">{item.manualReviewHint}</p>
          )}
        {showMessage && <p className="mt-1 text-xs text-gray-600">{item.message}</p>}
      </div>
    </div>
  );
}

interface ChecklistGroupProps {
  groups: GroupedChecklist[];
  title?: string;
  showPresent?: boolean;
}

export function ChecklistGroup({
  groups,
  title = "Review Checklist",
  showPresent = true,
}: ChecklistGroupProps) {
  const filteredGroups = showPresent
    ? groups
    : groups
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => i.status !== "present" && i.status !== "not_applicable"),
        }))
        .filter((g) => g.items.length > 0);

  if (filteredGroups.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <p className="mt-3 font-serif text-lg font-medium text-navy">No outstanding issues</p>
        <p className="mt-1 text-sm text-gray-500">Automated review found no missing required items.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {title && <h3 className="font-serif text-xl font-semibold text-navy">{title}</h3>}
      {filteredGroups.map((group) => (
        <div key={`${group.pageLabel}-${group.section}`} className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-100">
          <div className="border-b border-gray-100 bg-navy/[0.03] px-5 py-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-label">
                  {group.locationConfidence === "actual"
                    ? `Actual Page: ${group.pageLabel.replace("Actual Page: ", "")}`
                    : group.locationConfidence === "template"
                      ? "Expected Location"
                      : group.pageLabel}
                </p>
                {group.locationConfidence === "template" && group.expectedDocument && (
                  <p className="mt-1 text-sm font-medium text-navy">
                    {group.expectedDocument}
                    {group.expectedPageLabel ? ` · ${group.expectedPageLabel}` : ""}
                  </p>
                )}
                {group.typicalLocation && group.locationConfidence === "template" && (
                  <p className="mt-0.5 text-xs text-gray-500">{group.typicalLocation}</p>
                )}
                <h4 className="mt-1 font-serif text-base font-semibold text-navy">{group.section}</h4>
              </div>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {group.items.map((item) => (
              <ChecklistRow
                key={item.ruleId}
                item={item}
                groupLocationConfidence={group.locationConfidence}
                groupTypicalLocation={group.typicalLocation}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
