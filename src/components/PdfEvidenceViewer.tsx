"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ReviewResult, ValidationResultItem } from "@/lib/validation/types";
import { getStatusDisplayLabel } from "@/lib/review-display";
import {
  getActiveHighlightsForPage,
  getFindingTargetPage,
} from "@/lib/pdf-evidence-viewer";
import { MapPin, FileSearch } from "lucide-react";

const PDF_SCALE = 1.15;
const EMPHASIS_MS = 2200;

interface PdfEvidenceViewerProps {
  pdfFile: File;
  result: ReviewResult;
}

function findingStatusClass(status: ValidationResultItem["status"]): string {
  switch (status) {
    case "present":
      return "border-success/30 bg-success-light/30";
    case "missing":
      return "border-red-accent/30 bg-red-light/40";
    case "incomplete":
    case "conditional_review":
      return "border-warning/30 bg-warning-light/40";
    default:
      return "border-navy/15 bg-white";
  }
}

function FindingCard({
  item,
  selected,
  onSelect,
}: {
  item: ValidationResultItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const page = getFindingTargetPage(item);
  const statusLabel = item.statusDisplay ?? getStatusDisplayLabel(item.status);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
        selected
          ? "border-gold ring-2 ring-gold/40 shadow-md"
          : "hover:border-gold/40 hover:shadow-sm"
      } ${findingStatusClass(item.status)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-navy">{item.label}</p>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase text-navy/70">
          {statusLabel}
        </span>
        {item.confidenceScore != null && (
          <span className="text-[11px] text-gray-500">{item.confidenceScore}%</span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-600">{item.section}</p>
      {page != null ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          <MapPin className="h-3 w-3" />
          Page {page}
          {item.actualPageLabel ? ` · ${item.actualPageLabel}` : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs italic text-gray-400">No page located in OCR</p>
      )}
      {item.evidenceSnippet && (
        <p className="mt-2 line-clamp-2 text-xs text-gray-600">
          <span className="font-medium text-navy">Evidence:</span> {item.evidenceSnippet}
        </p>
      )}
    </button>
  );
}

function HighlightOverlay({
  regions,
}: {
  regions: { boundingBox?: { x: number; y: number; width: number; height: number }; label: string }[];
}) {
  if (!regions.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* TODO: Normalize Azure DI polygon coords vs pdf.js viewport when upgrading highlight precision. */}
      {regions.map((region, index) => {
        const box = region.boundingBox;
        if (!box) return null;
        return (
          <div
            key={`${region.label}-${index}`}
            className="absolute rounded-sm border-2 border-gold bg-gold/25"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
            title={region.label}
          />
        );
      })}
    </div>
  );
}

export function PdfEvidenceViewer({ pdfFile, result }: PdfEvidenceViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(result.pageCount);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [emphasizedPage, setEmphasizedPage] = useState<number | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const emphasisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const findings = result.items.filter(
    (item) => item.status !== "not_applicable"
  );

  const setPageRef = useCallback((pageNumber: number, node: HTMLDivElement | null) => {
    if (node) pageRefs.current.set(pageNumber, node);
    else pageRefs.current.delete(pageNumber);
  }, []);

  const setCanvasRef = useCallback(
    (pageNumber: number, node: HTMLCanvasElement | null) => {
      if (node) {
        canvasRefs.current.set(pageNumber, node);
        if (pdfDoc) void renderPageToCanvas(pdfDoc, pageNumber, node);
      } else {
        canvasRefs.current.delete(pageNumber);
      }
    },
    [pdfDoc]
  );

  async function renderPageToCanvas(
    doc: PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement
  ) {
    try {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;
    } catch {
      // Page-level render failure is non-fatal for the viewer.
    }
  }

  useEffect(() => {
    let cancelled = false;

    const url = URL.createObjectURL(pdfFile);
    objectUrlRef.current = url;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjs.getDocument({ url });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load PDF preview.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (emphasisTimerRef.current) clearTimeout(emphasisTimerRef.current);
    };
  }, [pdfFile]);

  useEffect(() => {
    if (!pdfDoc) return;
    for (const [pageNumber, canvas] of canvasRefs.current.entries()) {
      void renderPageToCanvas(pdfDoc, pageNumber, canvas);
    }
  }, [pdfDoc, pageCount]);

  const handleFindingSelect = (item: ValidationResultItem) => {
    setSelectedFindingId(item.ruleId);
    const page = getFindingTargetPage(item);
    if (page == null) return;

    setEmphasizedPage(page);
    if (emphasisTimerRef.current) clearTimeout(emphasisTimerRef.current);
    emphasisTimerRef.current = setTimeout(() => setEmphasizedPage(null), EMPHASIS_MS);

    pageRefs.current.get(page)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100">
      <div className="border-b border-gray-100 bg-navy/[0.03] px-5 py-4">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-gold" />
          <div>
            <h3 className="font-serif text-lg font-semibold text-navy">Evidence Review</h3>
            <p className="text-xs text-gray-500">
              Click a finding to jump to the matching PDF page. Highlights appear when OCR regions
              are available.
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[480px] grid-cols-1 lg:grid-cols-2">
        <div className="max-h-[70vh] overflow-y-auto border-b border-gray-100 bg-gray-50/80 p-4 lg:border-b-0 lg:border-r">
          {loadError ? (
            <div className="rounded-xl border border-red-accent/20 bg-red-light/40 p-4 text-sm text-red-accent">
              {loadError}
            </div>
          ) : !pdfDoc ? (
            <p className="text-center text-sm text-gray-500">Loading PDF preview…</p>
          ) : (
            <div className="space-y-6">
              {pageNumbers.map((pageNumber) => {
                const highlights = getActiveHighlightsForPage(
                  result.items,
                  selectedFindingId,
                  pageNumber
                );
                const emphasized = emphasizedPage === pageNumber;

                return (
                  <div
                    key={pageNumber}
                    ref={(node) => setPageRef(pageNumber, node)}
                    className={`relative scroll-mt-4 transition-shadow ${
                      emphasized ? "rounded-lg ring-4 ring-gold/60 ring-offset-2" : ""
                    }`}
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-label">
                      Page {pageNumber}
                    </p>
                    <div className="relative inline-block max-w-full shadow-md ring-1 ring-gray-200">
                      <canvas
                        ref={(node) => setCanvasRef(pageNumber, node)}
                        className="block h-auto max-w-full bg-white"
                      />
                      <HighlightOverlay regions={highlights} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-label">
            Findings ({findings.length})
          </p>
          <div className="space-y-2">
            {findings.map((item) => (
              <FindingCard
                key={item.ruleId}
                item={item}
                selected={selectedFindingId === item.ruleId}
                onSelect={() => handleFindingSelect(item)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
