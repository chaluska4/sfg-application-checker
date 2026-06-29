"use client";

import { useRef, useState } from "react";
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
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function UploadCard({ onReview, isLoading }: UploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0] ?? null);
  };

  const handleReview = () => {
    if (!selectedFile || isLoading) return;

    if (!isPdfWithinSizeLimit(selectedFile.size)) {
      setFileError(MAX_PDF_SIZE_ERROR);
      setSelectedFile(null);
      return;
    }

    onReview(selectedFile);
  };

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
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mt-8 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
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

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
          className="mt-4 text-sm font-semibold text-navy underline-offset-2 hover:underline disabled:opacity-50"
        >
          Browse Files
        </button>
      </div>

      <button
        type="button"
        onClick={handleReview}
        disabled={!selectedFile || isLoading}
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
