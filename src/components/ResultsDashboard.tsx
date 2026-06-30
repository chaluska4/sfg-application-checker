"use client";

import type { ReviewResult } from "@/lib/validation/types";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import { SummaryCards } from "./SummaryCards";
import { ChecklistGroup } from "./ChecklistGroup";
import { buildMasterReviewGroups, groupAllItems } from "@/lib/reviewList";
import { PACKET_FORMS_SECTION } from "@/lib/document-intelligence/packet-forms-review";
import {
  buildDocumentIntelligenceNotice,
  shouldShowStandaloneDisclaimer,
} from "@/lib/review-display";
import { ArrowLeft, FileText, AlertCircle, Info } from "lucide-react";

interface ResultsDashboardProps {
  result: ReviewResult;
  onReset: () => void;
}

export function ResultsDashboard({ result, onReset }: ResultsDashboardProps) {
  const issueGroups = buildMasterReviewGroups(result.items);
  const packetFormsGroups = issueGroups.filter((g) => g.section === PACKET_FORMS_SECTION);
  const coreIssueGroups = issueGroups.filter((g) => g.section !== PACKET_FORMS_SECTION);
  const presentGroups = groupAllItems(
    result.items.filter((item) => item.status === "present")
  );
  const showIntelligenceNotice = result.extractionMode !== "embedded_text";
  const intelligenceNotice = buildDocumentIntelligenceNotice(result);

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
          <span className="max-w-xs truncate font-medium text-navy sm:max-w-md">{result.fileName}</span>
          <span className="text-xs text-gray-400">({result.pageCount} pages)</span>
        </div>
      </div>

      {showIntelligenceNotice && (
        <div className="flex items-start gap-3 rounded-2xl border border-navy/15 bg-navy/[0.03] p-5 shadow-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
          <div>
            <p className="font-serif font-semibold text-navy">Document Intelligence Notice</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">{intelligenceNotice}</p>
          </div>
        </div>
      )}

      {shouldShowStandaloneDisclaimer(result.extractionMode) && (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-muted" />
          <p className="text-sm text-gray-700">{result.disclaimer}</p>
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
            present={result.summary.present}
            missing={result.summary.missing}
            needsManualVerification={
              result.summary.needsManualVerification +
              result.summary.lowConfidence +
              result.summary.ocrUnreadable +
              result.summary.incomplete
            }
            conditionalReview={result.summary.conditionalReview}
          />
        </div>
      </div>

      <ChecklistGroup
        groups={coreIssueGroups}
        title="Issues to Review — Application Packet"
        showPresent={false}
      />

      {packetFormsGroups.length > 0 && (
        <ChecklistGroup
          groups={packetFormsGroups}
          title="Packet Forms Review"
          showPresent={false}
        />
      )}

      {presentGroups.length > 0 && issueGroups.length > 0 && (
        <ChecklistGroup groups={presentGroups} title="Confirmed Present" showPresent />
      )}
    </div>
  );
}
