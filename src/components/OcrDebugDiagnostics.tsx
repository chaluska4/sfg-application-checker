"use client";

import { useState } from "react";
import type { OcrDebugInfo } from "@/lib/validation/types";
import { ChevronDown, ChevronRight, Bug } from "lucide-react";

interface OcrDebugDiagnosticsProps {
  debug: OcrDebugInfo;
}

function ConfidenceBadge({ value }: { value: string }) {
  const styles =
    value === "high"
      ? "bg-success-light text-success"
      : value === "medium"
        ? "bg-warning-light text-warning"
        : "bg-navy/10 text-navy";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${styles}`}>
      {value}
    </span>
  );
}

export function OcrDebugDiagnostics({ debug }: OcrDebugDiagnosticsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-dashed border-navy/20 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-navy/[0.02]"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-navy" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-navy" />
        )}
        <Bug className="h-4 w-4 shrink-0 text-gold" />
        <div>
          <p className="font-serif text-base font-semibold text-navy">OCR Debug Diagnostics</p>
          <p className="text-xs text-gray-500">Developer-only masked OCR summary (no full client text)</p>
        </div>
      </button>

      {open && (
        <div className="space-y-5 border-t border-navy/10 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="OCR provider" value={debug.ocrProvider} />
            <Metric label="Total pages" value={String(debug.totalPages)} />
            <Metric label="Pages with readable text" value={String(debug.pagesWithText)} />
            <Metric label="Average confidence" value={debug.averageConfidence} />
            <Metric label="Total characters" value={String(debug.totalCharacters)} />
            <Metric label="Total lines" value={String(debug.totalLines)} />
            <Metric label="Total selection marks" value={String(debug.totalSelectionMarks)} />
            <Metric label="OCR returned pages" value={String(debug.ocrReturnedPages)} />
            {debug.ocrDurationMs != null && (
              <Metric label="OCR duration (ms)" value={String(debug.ocrDurationMs)} />
            )}
            {debug.validationDurationMs != null && (
              <Metric label="Validation duration (ms)" value={String(debug.validationDurationMs)} />
            )}
            {debug.ignoredPageCount != null && debug.ignoredPageCount > 0 && (
              <Metric label="Ignored admin pages" value={String(debug.ignoredPageCount)} />
            )}
          </div>

          {debug.ocrError && (
            <p className="rounded-lg bg-red-light/40 px-3 py-2 text-xs text-red-accent">
              OCR error (sanitized): {debug.ocrError}
            </p>
          )}

          {debug.diagnosticSummary.length > 0 && (
            <div className="rounded-xl bg-navy/[0.03] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-label">Diagnostic summary</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {debug.diagnosticSummary.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-gray-700">
              <thead className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-slate-label">
                <tr>
                  <th className="px-2 py-2 font-semibold">Page</th>
                  <th className="px-2 py-2 font-semibold">Detected form</th>
                  <th className="px-2 py-2 font-semibold">Classification</th>
                  <th className="px-2 py-2 font-semibold">Chars</th>
                  <th className="px-2 py-2 font-semibold">Lines</th>
                  <th className="px-2 py-2 font-semibold">Marks</th>
                  <th className="px-2 py-2 font-semibold">Confidence</th>
                  <th className="px-2 py-2 font-semibold">Ignored</th>
                  <th className="px-2 py-2 font-semibold">Reason</th>
                  <th className="px-2 py-2 font-semibold">Masked snippet</th>
                </tr>
              </thead>
              <tbody>
                {debug.pages.map((page) => (
                  <tr key={page.pageNumber} className="border-b border-gray-100 align-top">
                    <td className="px-2 py-2 font-medium text-navy">{page.pageNumber}</td>
                    <td className="px-2 py-2">{page.detectedFormName}</td>
                    <td className="px-2 py-2 font-mono text-[11px]">{page.classificationLabel}</td>
                    <td className="px-2 py-2">{page.textCharacterCount}</td>
                    <td className="px-2 py-2">{page.lineCount}</td>
                    <td className="px-2 py-2">{page.selectionMarkCount}</td>
                    <td className="px-2 py-2">
                      <ConfidenceBadge value={page.averageConfidence} />
                    </td>
                    <td className="px-2 py-2">{page.hasReadableText ? "Yes" : "No"}</td>
                    <td className="px-2 py-2">{page.isIgnored ? "Yes" : "No"}</td>
                    <td className="max-w-xs px-2 py-2 text-[11px] text-gray-500">
                      {page.classificationReason ?? "—"}
                    </td>
                    <td className="max-w-xs px-2 py-2 text-[11px] leading-relaxed text-gray-600">
                      {page.firstTextSnippetMasked || <span className="italic text-gray-400">empty</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-navy/[0.03] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-label">{label}</p>
      <p className="mt-1 text-sm font-medium text-navy">{value}</p>
    </div>
  );
}
