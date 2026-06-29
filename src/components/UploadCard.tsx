"use client";

import { useEffect, useId, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import {
  formatFileSize,
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE_ERROR,
  MAX_PDF_SIZE_LABEL,
} from "@/lib/upload-security";

const features = [
  "Detect missing fields across required application sections",
  "Verify owner, agent, and disclosure signatures",
  "Validate conditional requirements such as replacement disclosures",
];

interface UploadCardProps {
  onReview: (file: File) => void;
  isLoading: boolean;
  uploadEnabled?: boolean;
  devBypassActive?: boolean;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function logUploadControlState(
  uploadEnabled: boolean,
  isLoading: boolean,
  devBypassActive: boolean
): void {
  if (process.env.NODE_ENV !== "development") return;
  if (!uploadEnabled) {
    console.warn("[sfg-upload] Upload controls disabled: uploadEnabled=false");
    return;
  }
  if (isLoading) {
    console.info("[sfg-upload] Upload controls visible; review in progress.");
    return;
  }
  console.info(
    "[sfg-upload] Upload controls ready.",
    devBypassActive ? "(LOCAL_AUTH_BYPASS)" : ""
  );
}

export function UploadCard({
  onReview,
  isLoading,
  uploadEnabled = true,
  devBypassActive = false,
}: UploadCardProps) {
  const inputId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const controlsDisabled = !uploadEnabled || isLoading;

  const handleFile = (file: File | null) => {
    setFileError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!isPdfFile(file)) {
      setSelectedFile(null);
      setFileError("File must be a PDF.");
      return;
    }

    if (!isPdfWithinSizeLimit(file.size)) {
      setSelectedFile(null);
      setFileError(MAX_PDF_SIZE_ERROR);
      return;
    }

    setSelectedFile(file);
    if (process.env.NODE_ENV === "development") {
      console.info("[sfg-upload] PDF selected:", file.name, `(${formatFileSize(file.size)})`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (controlsDisabled) return;
    setDragOver(false);
    handleFile(e.dataTransfer.files[0] ?? null);
  };

  const handleReview = () => {
    if (!selectedFile || controlsDisabled) return;

    if (!isPdfWithinSizeLimit(selectedFile.size)) {
      setFileError(MAX_PDF_SIZE_ERROR);
      setSelectedFile(null);
      return;
    }

    onReview(selectedFile);
  };

  useEffect(() => {
    logUploadControlState(uploadEnabled, isLoading, devBypassActive);
  }, [uploadEnabled, isLoading, devBypassActive]);

  return (
    <div className="rounded-3xl bg-white p-8 shadow-xl sm:p-12">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-label">
        Application Completeness Review
      </p>

      <h1 className="mt-4 text-center font-serif text-3xl leading-tight text-navy sm:text-4xl">
        Review Your{" "}
        <span className="text-gold">Application</span>
      </h1>

      <p className="mx-auto mt-5 max-w-lg text-center text-sm leading-relaxed text-gray-600 sm:text-base">
        Upload an annuity application PDF to automatically check for missing information,
        unsigned fields, and conditional requirements before submission.
      </p>

      {devBypassActive && process.env.NODE_ENV === "development" && (
        <p className="mx-auto mt-4 max-w-lg rounded-xl bg-navy/[0.04] px-4 py-2 text-center text-xs text-gray-600">
          Local dev mode: authentication bypass active.
        </p>
      )}

      <ul className="mx-auto mt-6 max-w-md space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm text-gray-700">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-accent" />
            {feature}
          </li>
        ))}
      </ul>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!controlsDisabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mt-8 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          controlsDisabled
            ? "cursor-not-allowed border-gray-200 bg-gray-100 opacity-60"
            : dragOver
              ? "border-gold bg-gold/5"
              : "border-gray-200 bg-gray-50/80 hover:border-gold/40"
        }`}
      >
        <p className="text-sm font-medium text-navy">Upload Annuity Application PDF</p>
        <p className="mt-1 text-xs text-gray-500">Drag and drop or browse to select a file</p>
        <p className="mt-1 text-xs text-gray-400">Maximum file size: {MAX_PDF_SIZE_LABEL}</p>

        {selectedFile && (
          <div className="mx-auto mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-gray-200">
            <FileText className="h-4 w-4 shrink-0 text-gold" />
            <span className="truncate text-sm font-medium text-navy">{selectedFile.name}</span>
            <span className="text-xs text-gray-400">({formatFileSize(selectedFile.size)})</span>
          </div>
        )}

        {fileError && (
          <p
            role="alert"
            className="mx-auto mt-4 max-w-sm rounded-xl border border-red-accent/30 bg-red-light px-4 py-2 text-sm text-red-accent"
          >
            {fileError}
          </p>
        )}

        <label
          htmlFor={inputId}
          className={`mt-4 inline-block text-sm font-semibold text-navy underline-offset-2 ${
            controlsDisabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:underline"
          }`}
        >
          Browse Files
        </label>
        <input
          id={inputId}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          disabled={controlsDisabled}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <button
        type="button"
        onClick={handleReview}
        disabled={!selectedFile || controlsDisabled}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-navy py-4 text-base font-semibold text-white transition-colors hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Reviewing Application…
          </>
        ) : (
          "Review Application"
        )}
      </button>
    </div>
  );
}
