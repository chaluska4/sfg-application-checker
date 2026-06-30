"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UploadCard } from "@/components/UploadCard";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import type { ReviewResult } from "@/lib/validation/types";
import { isPdfWithinSizeLimit, MAX_PDF_SIZE_ERROR } from "@/lib/upload-security";
import { ReviewApiError, submitReviewPdf } from "@/lib/review-api-client";
import {
  canShowUploadUI,
  logUploadRenderDecision,
  logUploadUIStatus,
} from "@/lib/client-auth";
import { useClientAuth } from "@/hooks/useClientAuth";

interface HomeClientProps {
  devBypassSession: boolean;
}

export default function HomeClient({ devBypassSession }: HomeClientProps) {
  const auth = useClientAuth({ devBypassSession });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [reviewedFile, setReviewedFile] = useState<File | null>(null);

  const showUpload = canShowUploadUI(auth);

  useEffect(() => {
    logUploadUIStatus(auth);
    logUploadRenderDecision(auth, showUpload);
  }, [auth, showUpload]);

  const handleReview = async (file: File) => {
    setIsLoading(true);
    setError(null);

    if (!isPdfWithinSizeLimit(file.size)) {
      setError(MAX_PDF_SIZE_ERROR);
      setIsLoading(false);
      return;
    }

    try {
      const data = await submitReviewPdf(file);
      setReviewedFile(file);
      setResult(data);
    } catch (err) {
      if (err instanceof ReviewApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setReviewedFile(null);
    setError(null);
  };

  return (
    <PageShell wide={!!result} extraWide={!!result}>
      {result ? (
        <ResultsDashboard result={result} pdfFile={reviewedFile} onReset={handleReset} />
      ) : (
        <div className="mx-auto max-w-3xl">
          {auth.loading ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-3xl bg-white p-8 shadow-xl">
              <Loader2 className="h-8 w-8 animate-spin text-navy" aria-label="Loading session" />
            </div>
          ) : showUpload ? (
            <UploadCard
              onReview={handleReview}
              isLoading={isLoading}
              uploadEnabled
              devBypassActive={auth.bypass}
            />
          ) : (
            <div className="rounded-3xl bg-white p-8 text-center shadow-xl sm:p-12">
              <h1 className="font-serif text-2xl text-navy">Sign in required</h1>
              <p className="mt-3 text-sm text-gray-600">
                Upload is available after authentication. Sign in to review an application PDF.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy-light"
              >
                Go to Sign In
              </Link>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-accent/30 bg-red-light px-4 py-3 text-center text-sm text-red-accent">
              {error}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
