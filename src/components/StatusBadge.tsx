import type { ElementType } from "react";
import type { ReviewStatus } from "@/lib/validation/types";
import { statusColors } from "@/lib/theme";
import { CheckCircle2, AlertTriangle, XCircle, Eye } from "lucide-react";

const statusIcons: Record<ReviewStatus, ElementType> = {
  "ready-to-submit": CheckCircle2,
  "needs-review": AlertTriangle,
  "missing-required": XCircle,
  "manual-review": Eye,
};

interface StatusBadgeProps {
  status: ReviewStatus;
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = statusColors[status];
  const Icon = statusIcons[status];

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}
