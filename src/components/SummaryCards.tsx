import { CheckCircle2, XCircle, Eye, HelpCircle } from "lucide-react";

interface SummaryCardsProps {
  present: number;
  missing: number;
  needsManualVerification: number;
  conditionalReview: number;
}

export function SummaryCards({
  present,
  missing,
  needsManualVerification,
  conditionalReview,
}: SummaryCardsProps) {
  const cards = [
    { label: "Confirmed Present", count: present, icon: CheckCircle2, bg: "bg-success-light", iconColor: "text-success", border: "border-success/20" },
    { label: "Missing", count: missing, icon: XCircle, bg: "bg-red-light", iconColor: "text-red-accent", border: "border-red-accent/20" },
    { label: "Needs Manual Verification", count: needsManualVerification, icon: Eye, bg: "bg-navy/5", iconColor: "text-navy", border: "border-navy/15" },
    { label: "Conditional Review", count: conditionalReview, icon: HelpCircle, bg: "bg-warning-light", iconColor: "text-warning", border: "border-warning/20" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`flex items-center gap-4 rounded-2xl border ${card.border} ${card.bg} p-5 shadow-sm`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70">
            <card.icon className={`h-5 w-5 ${card.iconColor}`} />
          </div>
          <div>
            <p className="font-serif text-2xl font-bold text-navy">{card.count}</p>
            <p className="text-sm font-medium text-gray-600">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
