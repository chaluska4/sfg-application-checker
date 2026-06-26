"use client";

import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { UploadCard } from "@/components/UploadCard";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import type { ReviewResult } from "@/lib/validation/types";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    (ReviewResult & { groupedItems: ReviewResult["groupedItems"] }) | null
  >(null);

  const handleReview = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/review", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Review failed. Please try again.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <PageShell wide={!!result}>
      {result ? (
        <ResultsDashboard result={result} onReset={handleReset} />
      ) : (
        <div className="mx-auto max-w-3xl">
          <UploadCard onReview={handleReview} isLoading={isLoading} />

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
