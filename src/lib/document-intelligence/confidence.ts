import type { ConfidenceLevel } from "./types";

const RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

export function minConfidence(...levels: ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce<ConfidenceLevel>(
    (min, level) => (RANK[level] < RANK[min] ? level : min),
    "high"
  );
}

export function pageTextConfidence(charCount: number, hasEmbeddedText: boolean): ConfidenceLevel {
  if (!hasEmbeddedText || charCount < 20) return "low";
  if (charCount < 120) return "medium";
  return "high";
}

export function patternMatchConfidence(
  matched: boolean,
  baseConfidence: ConfidenceLevel
): ConfidenceLevel {
  if (!matched) return "low";
  return baseConfidence;
}
