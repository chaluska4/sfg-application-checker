import type {
  ConfidenceLevel,
  DocumentPacket,
  ExtractionMode,
  FieldStatus,
  GroupedChecklist,
  ReviewResult,
  ReviewStatus,
  ValidationResultItem,
  ValidationRule,
} from "./types";
import { extractPdfPages } from "./extract-pdf-text";
import { detectCheckboxes } from "./detect-checkboxes";
import { detectSignatures } from "./detect-signatures";
import { detectDates } from "./detect-dates";
import { extractKnownValues, detectPacketFlags } from "./extract-known-values";
import { isCheckboxChecked } from "./detect-checkboxes";
import { minConfidence } from "./confidence";
import { FORM_NAME, equitrustMarketEarlyNjRules } from "./templates/equitrust-marketearly-nj";
import { comparePageGroups, resolveFindingLocation } from "./resolve-finding-page";
import type { OcrProvider } from "./ocr";
import { deriveExtractionMode, resolveOcrProvider } from "./ocr";
import { appendPacketFormsReview, isRuleConditionUndetermined, PACKET_FORMS_SECTION, shouldIncludePacketFormsReview } from "./packet-forms-review";
import { compileEquitrustImageOnlyOverlayRules } from "./rule-config";
import { evaluateFieldWithEvidence, packetHasUsableText } from "./finding-evidence";
import { getStatusDisplayLabel } from "../review-display";
import { buildOcrDebugInfo, isOcrDebugEnabled } from "./ocr/ocr-debug";
import { computeEvidenceScore } from "./evidence-scorer";
import { buildFindingExplanation } from "./finding-explanation";
import { getConfigurableRuleById } from "./rule-config";

const DISCLAIMER =
  "Automated review supports manual due diligence. Final submission readiness must be confirmed by an authorized SFG reviewer.";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  "ready-to-submit": "Ready to Submit",
  "needs-review": "Needs Review",
  "missing-required": "Missing Required Information",
  "manual-review": "Manual Review Needed",
};

export interface DocumentIntelligenceOptions {
  ocrProvider?: OcrProvider | null;
}

export async function runDocumentIntelligence(
  pdfBuffer: ArrayBuffer,
  fileName: string,
  rules: ValidationRule[] = equitrustMarketEarlyNjRules,
  options?: DocumentIntelligenceOptions
): Promise<ReviewResult> {
  const ocrProvider =
    options?.ocrProvider !== undefined ? options.ocrProvider : resolveOcrProvider();

  const pipelineStart = performance.now();

  const { pages, pageCount, fullText, hasEmbeddedText, hasOcrText, ocrProviderName, ocrDiagnostics } =
    await extractPdfPages(pdfBuffer, { ocrProvider, fileName });

  const ocrDurationMs = Math.round(performance.now() - pipelineStart);
  const validationStart = performance.now();
  const checkboxes = detectCheckboxes(pages);
  const signatures = detectSignatures(pages);
  const dates = detectDates(pages);
  const values = extractKnownValues(pages, fullText);
  const flags = detectPacketFlags(pages, fullText, checkboxes);

  const extractionMode: ExtractionMode = deriveExtractionMode(pages);

  const packet: DocumentPacket = {
    fileName,
    pageCount,
    extractionMode,
    hasEmbeddedText,
    hasOcrText,
    pages,
    fullText,
    checkboxes,
    signatures,
    dates,
    values,
    flags,
  };

  const items = validatePacket(packet, rules);
  const validationDurationMs = Math.round(performance.now() - validationStart);
  const summary = summarize(items);
  const status = determineStatus(items, extractionMode, packet);
  const completionScore = calculateScore(items);

  const result: ReviewResult = {
    formName: FORM_NAME,
    fileName,
    completionScore,
    status,
    statusLabel: STATUS_LABELS[status],
    extractionMode,
    hasEmbeddedText,
    pageCount,
    disclaimer: DISCLAIMER,
    summary,
    items,
    groupedItems: groupItems(items),
  };

  if (isOcrDebugEnabled()) {
    result.debug = buildOcrDebugInfo(
      pages,
      ocrProviderName,
      ocrDiagnostics,
      items,
      { ocrDurationMs, validationDurationMs }
    );
  }

  return result;
}

export function runValidationOnPacket(
  packet: DocumentPacket,
  rules: ValidationRule[] = equitrustMarketEarlyNjRules
): ValidationResultItem[] {
  return validatePacket(packet, rules);
}

export function validatePacketWithRules(
  packet: DocumentPacket,
  rules: ValidationRule[]
): ValidationResultItem[] {
  return evaluateRules(packet, rules);
}

function validatePacket(
  packet: DocumentPacket,
  rules: ValidationRule[]
): ValidationResultItem[] {
  const items = evaluateRules(packet, rules);
  return appendPacketFormsReviewWithOverlay(items, packet);
}

function evaluateRules(
  packet: DocumentPacket,
  rules: ValidationRule[]
): ValidationResultItem[] {
  const items: ValidationResultItem[] = [];
  const lowConfidencePacket = !packetHasUsableText(packet);

  for (const rule of rules) {
    const isConditional = !!rule.condition;
    const conditionActive = isConditionActive(rule, packet);

    if (isConditional && !conditionActive) {
      if (isRuleConditionUndetermined(rule, packet, lowConfidencePacket)) {
        items.push(
          makeItem(
            rule,
            packet,
            "conditional_review",
            "low",
            true,
            "Application trigger could not be read from scanned pages — verify whether this form is required."
          )
        );
        continue;
      }
      items.push(makeItem(rule, packet, "not_applicable", "low", false, "Not required based on current answers."));
      continue;
    }

    if (isConditional && conditionActive) {
      const result = evaluateRule(rule, packet);
      if (isIssueStatus(result.status)) {
        items.push({
          ...result,
          status: "conditional_review",
          isConditional: true,
          statusDisplay: getStatusDisplayLabel("conditional_review"),
          message: `Conditional requirement: ${result.message ?? rule.label}`,
        });
        continue;
      }
      items.push({ ...result, isConditional: true });
      continue;
    }

    items.push(evaluateRule(rule, packet));
  }

  return items;
}

function appendPacketFormsReviewWithOverlay(
  items: ValidationResultItem[],
  packet: DocumentPacket
): ValidationResultItem[] {
  const merged = appendPacketFormsReview(items, packet);
  if (!shouldIncludePacketFormsReview(packet)) return merged;

  const overlayItems = evaluateRules(packet, compileEquitrustImageOnlyOverlayRules()).map(
    (item) => ({
      ...item,
      section: PACKET_FORMS_SECTION,
    })
  );

  return [...merged, ...overlayItems];
}

function isConditionActive(rule: ValidationRule, packet: DocumentPacket): boolean {
  if (!rule.condition) return true;
  const { dependsOn, whenTruthy } = rule.condition;

  if (dependsOn === "replacement") return packet.flags.replacementSelected;
  if (dependsOn === "transfer_1035") return packet.flags.transferSelected;
  if (dependsOn === "source_of_funds_other") return packet.flags.sourceOfFundsOther;

  if (whenTruthy && dependsOn) {
    return isCheckboxChecked(packet.checkboxes, dependsOn) || Boolean(packet.flags[dependsOn as keyof typeof packet.flags]);
  }
  return false;
}

function evaluateRule(rule: ValidationRule, packet: DocumentPacket): ValidationResultItem {
  const evidenceResult = evaluateFieldWithEvidence(rule, packet);
  return makeItem(
    rule,
    packet,
    evidenceResult.status,
    evidenceResult.confidence,
    !!rule.condition,
    evidenceResult.message,
    evidenceResult.pageEvidence,
    evidenceResult
  );
}

function makeItem(
  rule: ValidationRule,
  packet: DocumentPacket,
  status: FieldStatus,
  confidence: ConfidenceLevel,
  isConditional: boolean,
  message?: string,
  evidence: import("./resolve-finding-page").PageEvidence = {},
  evidenceResult?: import("./finding-evidence").FieldEvidenceResult
): ValidationResultItem {
  const location = resolveFindingLocation(rule, packet, evidence, evidenceResult?.disposition);
  const pageMeta =
    location.actualPage !== null
      ? packet.pages.find((p) => p.pageNumber === location.actualPage)
      : undefined;

  const statusDisplay = getStatusDisplayLabel(status);
  const scoreBreakdown = computeEvidenceScore({
    ocrConfidence: pageMeta?.ocrConfidence ?? confidence,
    classificationConfidence: pageMeta?.classificationConfidence ?? "medium",
    classificationScore: pageMeta?.classificationScore,
    scopedContext: evidenceResult?.scopedContext,
    hasSelectionMark: Boolean(
      pageMeta?.ocrSelectionMarks?.some((mark) => mark.state === "selected")
    ),
    hasValueEvidence: evidenceResult?.hasValueEvidence,
    status,
  });

  const configuredRule = getConfigurableRuleById(rule.id);
  const explanation = buildFindingExplanation({
    label: rule.label,
    statusDisplay,
    expectedDocument: configuredRule
      ? location.expectedDocument
      : location.expectedDocument,
    expectedSection: configuredRule?.requiredSection ?? rule.section,
    scopedContext: evidenceResult?.scopedContext,
    evidenceSnippet: evidenceResult?.evidenceSnippet,
    confidenceScore: scoreBreakdown.confidenceScore,
  });

  const mergedEvidenceReason = [
    explanation.reasonSummary,
    evidenceResult?.evidenceReason,
    scoreBreakdown.factors.length ? `Factors: ${scoreBreakdown.factors.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ruleId: rule.id,
    label: rule.label,
    section: rule.section,
    documentType: location.documentType,
    status,
    severity: rule.severity,
    message,
    confidence: minConfidence(confidence, pageMeta?.classificationConfidence ?? "medium"),
    isConditional,
    actualPage: location.actualPage,
    actualPageLabel: location.actualPageLabel,
    expectedDocument: location.expectedDocument,
    typicalLocation: location.typicalLocation,
    typicalPageRange: location.typicalPageRange,
    locationConfidence: location.locationConfidence,
    manualReviewHint: location.manualReviewHint,
    expectedPageLabel: location.expectedPageLabel,
    page: location.actualPage,
    pageLabel: location.pageLabel,
    boundingBox:
      evidence.boundingBox ?? evidenceResult?.highlightRegions?.[0]?.boundingBox ?? null,
    evidenceSnippet: evidenceResult?.evidenceSnippet ?? null,
    evidenceReason: mergedEvidenceReason || message || null,
    findingDisposition: evidenceResult?.disposition ?? null,
    detectedFormName: evidenceResult?.detectedFormName ?? location.detectedFormName ?? null,
    statusDisplay,
    confidenceScore: scoreBreakdown.confidenceScore,
    validationTrace: evidenceResult?.scopedContext?.stages ?? null,
    highlightRegions: evidenceResult?.highlightRegions ?? null,
    expectedSummary: explanation.expectedSummary,
    foundSummary: explanation.foundSummary,
  };
}

function isIssueStatus(status: FieldStatus): boolean {
  return (
    status === "missing" ||
    status === "incomplete" ||
    status === "needs_manual_verification" ||
    status === "low_confidence" ||
    status === "ocr_unreadable"
  );
}

function summarize(items: ValidationResultItem[]) {
  return {
    present: items.filter((i) => i.status === "present").length,
    missing: items.filter((i) => i.status === "missing").length,
    incomplete: items.filter((i) => i.status === "incomplete").length,
    needsManualVerification: items.filter((i) => i.status === "needs_manual_verification").length,
    conditionalReview: items.filter((i) => i.status === "conditional_review").length,
    lowConfidence: items.filter((i) => i.status === "low_confidence").length,
    ocrUnreadable: items.filter((i) => i.status === "ocr_unreadable").length,
    notApplicable: items.filter((i) => i.status === "not_applicable").length,
    total: items.length,
  };
}

function determineStatus(
  items: ValidationResultItem[],
  mode: ExtractionMode,
  packet: DocumentPacket
): ReviewStatus {
  if (mode === "image_only" && !packetHasUsableText(packet)) return "manual-review";

  const hasMissing = items.some((i) => i.status === "missing" && i.severity === "required");
  const hasReview = items.some(
    (i) =>
      isIssueStatus(i.status) ||
      i.status === "conditional_review" ||
      (i.status === "missing" && i.severity === "required")
  );
  if (hasMissing) return "missing-required";
  if (hasReview) return "needs-review";
  return "ready-to-submit";
}

function calculateScore(items: ValidationResultItem[]): number {
  const applicable = items.filter((i) => i.status !== "not_applicable");
  if (applicable.length === 0) return 0;
  const confirmed = applicable.filter((i) => i.status === "present").length;
  return Math.round((confirmed / applicable.length) * 100);
}

function groupItems(items: ValidationResultItem[]): GroupedChecklist[] {
  const map = new Map<string, GroupedChecklist>();
  for (const item of items) {
    const key = `${item.pageLabel}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, {
        page: item.page,
        pageLabel: item.pageLabel,
        section: item.section,
        documentType: item.documentType,
        locationConfidence: item.locationConfidence,
        expectedDocument: item.expectedDocument,
        typicalLocation: item.typicalLocation,
        expectedPageLabel: item.expectedPageLabel,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }
  const order: Record<FieldStatus, number> = {
    missing: 0,
    incomplete: 1,
    ocr_unreadable: 2,
    low_confidence: 3,
    conditional_review: 4,
    needs_manual_verification: 5,
    present: 6,
    not_applicable: 7,
  };
  return [...map.values()]
    .sort((a, b) =>
      comparePageGroups(
        {
          page: a.page,
          section: a.section,
          typicalPageRange: a.items[0]?.typicalPageRange,
          locationConfidence: a.locationConfidence,
        },
        {
          page: b.page,
          section: b.section,
          typicalPageRange: b.items[0]?.typicalPageRange,
          locationConfidence: b.locationConfidence,
        }
      )
    )
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => order[a.status] - order[b.status]),
    }));
}
