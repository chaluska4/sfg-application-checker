import type { ScopedSearchContext } from "./scoped-validation";
import { DOCUMENT_TYPE_LABELS, PAGE_SUBTYPE_LABELS } from "./document-taxonomy";

export interface FindingExplanation {
  expectedSummary: string;
  foundSummary: string;
  reasonSummary: string;
  evidenceSummary: string;
}

export function buildFindingExplanation(input: {
  label: string;
  statusDisplay: string;
  expectedDocument?: string | null;
  expectedSection?: string | null;
  scopedContext?: ScopedSearchContext;
  evidenceSnippet?: string | null;
  confidenceScore?: number;
}): FindingExplanation {
  const expectedParts = [
    input.expectedDocument,
    input.expectedSection,
    input.label,
  ].filter(Boolean);

  const expectedSummary =
    expectedParts.length > 0
      ? `Expected: ${expectedParts.join(" → ")}`
      : `Expected: ${input.label}`;

  let foundSummary = "Found: No scoped evidence located.";
  if (input.scopedContext?.pageNumber) {
    const doc = input.scopedContext.documentType
      ? DOCUMENT_TYPE_LABELS[input.scopedContext.documentType]
      : "document";
    const subtype = input.scopedContext.pageSubtype
      ? PAGE_SUBTYPE_LABELS[input.scopedContext.pageSubtype]
      : "section";
    foundSummary = `Found: ${doc} → ${subtype} on page ${input.scopedContext.pageNumber}.`;
  }

  const stageLines = input.scopedContext?.stages.map((stage) => stage.detail) ?? [];
  const evidenceSummary = input.evidenceSnippet
    ? `OCR evidence: ${input.evidenceSnippet}`
    : stageLines.length
      ? `Validation trace: ${stageLines.join(" ")}`
      : "No OCR snippet captured.";

  const reasonSummary = input.confidenceScore
    ? `${input.statusDisplay} (${input.confidenceScore}% confidence). ${stageLines[stageLines.length - 1] ?? "Insufficient scoped evidence."}`
    : `${input.statusDisplay}. ${stageLines[stageLines.length - 1] ?? "Insufficient scoped evidence."}`;

  return {
    expectedSummary,
    foundSummary,
    reasonSummary,
    evidenceSummary,
  };
}
