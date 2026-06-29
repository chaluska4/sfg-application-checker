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
import { detectCheckboxes, isCheckboxChecked } from "./detect-checkboxes";
import { detectSignatures, isSignaturePresent } from "./detect-signatures";
import { detectDates } from "./detect-dates";
import { extractKnownValues, detectPacketFlags } from "./extract-known-values";
import { hasPageType } from "./classify-pages";
import { hasDateNearLabels } from "./detect-dates";
import { minConfidence } from "./confidence";
import { FORM_NAME, equitrustMarketEarlyNjRules } from "./templates/equitrust-marketearly-nj";
import {
  comparePageGroups,
  resolveFindingLocation,
  resolveEvidenceBoundingBox,
  type PageEvidence,
} from "./resolve-finding-page";
import type { OcrProvider } from "./ocr";
import { deriveExtractionMode, pageHasUsableText, resolveOcrProvider } from "./ocr";
import { appendPacketFormsReview, isRuleConditionUndetermined } from "./packet-forms-review";

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

  const { pages, pageCount, fullText, hasEmbeddedText, hasOcrText } = await extractPdfPages(
    pdfBuffer,
    { ocrProvider, fileName }
  );
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
  const summary = summarize(items);
  const status = determineStatus(items, extractionMode);
  const completionScore = calculateScore(items);

  return {
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
}

export function runValidationOnPacket(
  packet: DocumentPacket,
  rules: ValidationRule[] = equitrustMarketEarlyNjRules
): ValidationResultItem[] {
  return validatePacket(packet, rules);
}

function validatePacket(
  packet: DocumentPacket,
  rules: ValidationRule[]
): ValidationResultItem[] {
  const items: ValidationResultItem[] = [];
  const hasUsableText = packet.hasEmbeddedText || Boolean(packet.hasOcrText) || packet.pages.some(pageHasUsableText);
  const lowConfidencePacket = !hasUsableText || packet.extractionMode === "image_only";

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
      const result = evaluateRule(rule, packet, lowConfidencePacket);
      if (result.status === "missing" || result.status === "needs_manual_verification") {
        items.push({ ...result, status: "conditional_review", isConditional: true, message: `Conditional requirement: ${result.message ?? rule.label}` });
        continue;
      }
      items.push({ ...result, isConditional: true });
      continue;
    }

    items.push(evaluateRule(rule, packet, lowConfidencePacket));
  }

  return appendPacketFormsReview(items, packet);
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

function evaluateRule(
  rule: ValidationRule,
  packet: DocumentPacket,
  lowConfidencePacket: boolean
): ValidationResultItem {
  const evidence = buildPageEvidence(rule, packet);

  if (lowConfidencePacket) {
    return makeItem(
      rule,
      packet,
      "needs_manual_verification",
      "low",
      !!rule.condition,
      undefined,
      evidence
    );
  }

  switch (rule.kind) {
    case "page_type": {
      const required = rule.pageTypes ?? [];
      const found = required.some((t) => hasPageType(packet.pages, t));
      if (found) return makeItem(rule, packet, "present", "high", !!rule.condition, undefined, evidence);
      const pageConfidence = packet.pages.some(pageHasUsableText) ? "medium" : "low";
      return makeItem(
        rule,
        packet,
        pageConfidence === "low" ? "needs_manual_verification" : "missing",
        pageConfidence,
        !!rule.condition,
        `Expected document section not identified: ${rule.label}.`,
        evidence
      );
    }
    case "signature": {
      const sig = isSignaturePresent(packet.signatures, rule.signatureLabel ?? "");
      const sigEvidence: PageEvidence = {
        ...evidence,
        signaturePage: packet.signatures.find((s) => s.label === rule.signatureLabel)?.page ?? undefined,
      };
      if (sig.signed) return makeItem(rule, packet, "present", sig.confidence, !!rule.condition, undefined, sigEvidence);
      const pageHasSigSection = packet.pages.some(
        (p) => rule.pageTypes?.includes(p.classification) && pageHasUsableText(p)
      );
      if (!pageHasSigSection)
        return makeItem(rule, packet, "needs_manual_verification", "low", !!rule.condition, "Signature area not confidently detected in extracted text.", sigEvidence);
      return makeItem(rule, packet, "missing", "medium", !!rule.condition, "No e-signature indicator found near expected signature line.", sigEvidence);
    }
    case "date_near_label": {
      const datePage = findDatePageForRule(rule, packet);
      const dateEvidence = { ...evidence, datePage: datePage ?? undefined };
      const pageText = datePage
        ? (packet.pages.find((p) => p.pageNumber === datePage)?.rawText ?? "")
        : packet.pages.map((p) => p.rawText).join("\n");
      const { present, confidence } = hasDateNearLabels(pageText);
      if (present) return makeItem(rule, packet, "present", confidence, !!rule.condition, undefined, dateEvidence);
      return makeItem(rule, packet, "needs_manual_verification", "low", !!rule.condition, "Date not confidently detected — verify handwritten date manually.", dateEvidence);
    }
    case "allocation_100": {
      const total = packet.flags.allocationTotal;
      if (total === 100) return makeItem(rule, packet, "present", "high", false, undefined, evidence);
      if (total === undefined)
        return makeItem(rule, packet, "needs_manual_verification", "low", false, "Allocation percentages could not be read from document text.", evidence);
      return makeItem(rule, packet, "missing", "medium", false, `Allocation total is ${total}%, expected 100%.`, evidence);
    }
    case "checkbox_yes":
    case "label_value":
    default: {
      const valueKey = mapRuleToValueKey(rule.id);
      const extracted = packet.values.find((v) => v.key === valueKey);
      const valueEvidence: PageEvidence = { ...evidence, valuePage: extracted?.page ?? undefined };
      if (extracted?.present)
        return makeItem(rule, packet, "present", extracted.confidence, !!rule.condition, extracted.maskedPreview ? `Detected (${extracted.maskedPreview})` : undefined, valueEvidence);

      const labelPage = findLabelPageForRule(rule, packet);
      const labelEvidence: PageEvidence = {
        ...valueEvidence,
        valuePage: labelPage ?? valueEvidence.valuePage,
      };
      const textHit = labelPage !== null || rule.labelPatterns?.some((p) => p.test(packet.fullText));
      const pageConf = packet.pages.some(pageHasUsableText) ? "medium" : "low";

      if (textHit && pageConf !== "low")
        return makeItem(rule, packet, "needs_manual_verification", "medium", !!rule.condition, "Section label found but value not confidently extracted.", labelEvidence);

      if (pageConf === "low")
        return makeItem(rule, packet, "needs_manual_verification", "low", !!rule.condition, "Insufficient embedded text for automated verification.", labelEvidence);

      return makeItem(rule, packet, "missing", "medium", !!rule.condition, `Required information not detected: ${rule.label}.`, labelEvidence);
    }
  }
}

function buildPageEvidence(rule: ValidationRule, packet: DocumentPacket): PageEvidence {
  const valueKey = mapRuleToValueKey(rule.id);
  const extracted = packet.values.find((v) => v.key === valueKey);
  const valuePage = extracted?.page ?? undefined;
  const signaturePage = packet.signatures.find((s) => s.label === rule.signatureLabel)?.page ?? undefined;
  const checkboxPage = packet.checkboxes.find((c) => c.label === rule.checkboxLabel)?.page ?? undefined;
  const datePage = findDatePageForRule(rule, packet) ?? undefined;
  const evidencePage = valuePage ?? signaturePage ?? checkboxPage ?? datePage;
  const boundingBox = resolveEvidenceBoundingBox(rule, packet, evidencePage) ?? undefined;

  return {
    valuePage,
    signaturePage,
    checkboxPage,
    datePage,
    boundingBox,
  };
}

function findLabelPageForRule(rule: ValidationRule, packet: DocumentPacket): number | null {
  if (!rule.labelPatterns?.length) return null;
  for (const page of packet.pages) {
    if (rule.labelPatterns.some((p) => p.test(page.rawText))) return page.pageNumber;
  }
  return null;
}

function findDatePageForRule(rule: ValidationRule, packet: DocumentPacket): number | null {
  if (rule.labelPatterns?.length) {
    for (const page of packet.pages) {
      if (rule.labelPatterns.some((p) => p.test(page.rawText))) return page.pageNumber;
    }
  }
  return packet.dates.find((d) => d.present)?.page ?? null;
}

function mapRuleToValueKey(ruleId: string): string {
  const map: Record<string, string> = {
    "owner-info": "owner_name",
    "annuitant-info": "annuitant_name",
    "owner-ssn": "owner_ssn",
    "product-name": "product_name",
    "agent-info": "agent_name",
    "premium-payment": "premium_amount",
    beneficiary: "beneficiary",
    "fna-risk": "risk_tolerance",
    "fna-source": "source_of_funds",
    "fna-distribution": "distribution_objectives",
    "allocation-100": "allocation_total",
  };
  return map[ruleId] ?? ruleId;
}

function makeItem(
  rule: ValidationRule,
  packet: DocumentPacket,
  status: FieldStatus,
  confidence: ConfidenceLevel,
  isConditional: boolean,
  message?: string,
  evidence: PageEvidence = {}
): ValidationResultItem {
  const location = resolveFindingLocation(rule, packet, evidence);
  const pageMeta =
    location.actualPage !== null
      ? packet.pages.find((p) => p.pageNumber === location.actualPage)
      : undefined;

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
    boundingBox: evidence.boundingBox ?? null,
  };
}

function summarize(items: ValidationResultItem[]) {
  return {
    present: items.filter((i) => i.status === "present").length,
    missing: items.filter((i) => i.status === "missing").length,
    needsManualVerification: items.filter((i) => i.status === "needs_manual_verification").length,
    conditionalReview: items.filter((i) => i.status === "conditional_review").length,
    notApplicable: items.filter((i) => i.status === "not_applicable").length,
    total: items.length,
  };
}

function determineStatus(items: ValidationResultItem[], mode: ExtractionMode): ReviewStatus {
  if (mode === "image_only") return "manual-review";
  const hasMissing = items.some((i) => i.status === "missing" && i.severity === "required");
  const hasReview = items.some(
    (i) =>
      i.status === "needs_manual_verification" ||
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
    conditional_review: 1,
    needs_manual_verification: 2,
    present: 3,
    not_applicable: 4,
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
