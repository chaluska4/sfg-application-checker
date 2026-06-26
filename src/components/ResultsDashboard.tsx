"use client";

import type { ReviewResult } from "@/lib/validation/types";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import { SummaryCards } from "./SummaryCards";
import { ChecklistGroup } from "./ChecklistGroup";
import { buildMasterReviewGroups } from "@/lib/reviewList";
import { ArrowLeft, FileText, AlertCircle } from "lucide-react";

interface ResultsDashboardProps {
  result: ReviewResult & { groupedItems: ReviewResult["groupedItems"] };
  onReset: () => void;
}

export function ResultsDashboard({ result, onReset }: ResultsDashboardProps) {
  const issueGroups = buildMasterReviewGroups(result.items);
  const passedGroups = result.groupedItems
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.status === "completed"),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full border border-navy/20 bg-white px-4 py-2 text-sm font-medium text-navy transition-colors hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Upload Another Application
        </button>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FileText className="h-4 w-4" />
          <span className="max-w-xs truncate font-medium text-navy sm:max-w-md">
            {result.fileName}
          </span>
        </div>
      </div>

      {!result.hasFillableFields && (
        <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
          <div>
            <p className="font-serif font-semibold text-navy">Manual Review Needed</p>
            <p className="mt-1 text-sm text-gray-600">
              This PDF does not expose fillable AcroForm fields. Automated field validation
              cannot be performed. The checklist below shows all expected requirements for
              manual verification.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-label">
          {result.formName}
        </p>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <h2 className="font-serif text-2xl text-navy sm:text-3xl">
            Completeness <span className="text-gold">Review Results</span>
          </h2>
          <StatusBadge status={result.status} label={result.statusLabel} />
        </div>

        <div className="mt-8">
          <ProgressBar score={result.completionScore} />
        </div>

        <div className="mt-8">
          <SummaryCards
            completed={result.summary.completed}
            warnings={result.summary.warnings}
            missing={result.summary.missing}
          />
        </div>
      </div>

      {issueGroups.length > 0 && (
        <ChecklistGroup
          groups={issueGroups}
          title="Issues to Review — Application Packet"
          showCompleted={false}
        />
      )}

      <ChecklistGroup
        groups={result.groupedItems}
        title="Good Order Review Report"
        showCompleted
      />

      {passedGroups.length > 0 && issueGroups.length > 0 && (
        <ChecklistGroup groups={passedGroups} title="Passed Items" showCompleted />
      )}
    </div>
  );
}
