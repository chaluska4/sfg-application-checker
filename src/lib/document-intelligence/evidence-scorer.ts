import type { ConfidenceLevel, FieldStatus } from "./types";
import type { ScopedSearchContext } from "./scoped-validation";
import { scopedSearchSucceeded } from "./scoped-validation";

const LEVEL_SCORE: Record<ConfidenceLevel, number> = {
  high: 95,
  medium: 75,
  low: 45,
};

export interface EvidenceScoreBreakdown {
  confidenceScore: number;
  ocrConfidence: number;
  classificationConfidence: number;
  evidenceConfidence: number;
  proximityConfidence: number;
  selectionMarkConfidence: number;
  factors: string[];
}

export function computeEvidenceScore(input: {
  ocrConfidence: ConfidenceLevel;
  classificationConfidence: ConfidenceLevel;
  classificationScore?: number;
  scopedContext?: ScopedSearchContext;
  hasSelectionMark?: boolean;
  hasValueEvidence?: boolean;
  status: FieldStatus;
}): EvidenceScoreBreakdown {
  const factors: string[] = [];
  const ocrConfidence = LEVEL_SCORE[input.ocrConfidence];
  const classificationConfidence =
    input.classificationScore ?? LEVEL_SCORE[input.classificationConfidence];

  let evidenceConfidence = 40;
  let proximityConfidence = 40;
  let selectionMarkConfidence = 50;

  if (input.scopedContext) {
    const stageCount = input.scopedContext.stages.filter((stage) => stage.success).length;
    evidenceConfidence = Math.min(98, 40 + stageCount * 12);
    factors.push(`${stageCount} scoped validation stages passed`);

    if (scopedSearchSucceeded(input.scopedContext)) {
      evidenceConfidence = Math.max(evidenceConfidence, 85);
      factors.push("Scoped evidence chain complete");
    }

    const hasSnippet = input.scopedContext.stages.some((stage) => stage.snippet);
    if (hasSnippet) {
      proximityConfidence = 88;
      factors.push("OCR snippet captured near field");
    }

    const hasBox = input.scopedContext.stages.some((stage) => stage.boundingBox);
    if (hasBox) {
      proximityConfidence = Math.max(proximityConfidence, 92);
      factors.push("Bounding box available for highlight");
    }
  }

  if (input.hasSelectionMark) {
    selectionMarkConfidence = 95;
    factors.push("Azure selection mark detected");
  }

  if (input.hasValueEvidence) {
    evidenceConfidence = Math.max(evidenceConfidence, 90);
    factors.push("Value evidence detected (not label-only)");
  }

  if (input.status === "present") {
    factors.push("Status: PASS");
  } else if (input.status === "missing") {
    evidenceConfidence = Math.min(evidenceConfidence, 70);
    factors.push("Status: MISSING with scoped context");
  } else if (input.status === "low_confidence" || input.status === "ocr_unreadable") {
    evidenceConfidence = Math.min(evidenceConfidence, 55);
    factors.push("Status: uncertain");
  }

  const confidenceScore = Math.round(
    ocrConfidence * 0.25 +
      classificationConfidence * 0.2 +
      evidenceConfidence * 0.3 +
      proximityConfidence * 0.15 +
      selectionMarkConfidence * 0.1
  );

  return {
    confidenceScore: Math.max(0, Math.min(100, confidenceScore)),
    ocrConfidence,
    classificationConfidence,
    evidenceConfidence,
    proximityConfidence,
    selectionMarkConfidence,
    factors,
  };
}
