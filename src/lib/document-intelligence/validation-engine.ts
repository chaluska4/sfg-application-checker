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
import { minConfidence, pageTextConfidence } from "./confidence";
import { FORM_NAME, equitrustMarketEarlyNjRules } from "./templates/equitrust-marketearly-nj";

const DISCLAIMER =
  "Automated review supports manual due diligence. Final submission readiness must be confirmed by an authorized SFG reviewer.";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  "ready-to-submit": "Ready to Submit",
  "needs-review": "Needs Review",
  "missing-required": "Missing Required Information",
  "manual-review": "Manual Review Needed",
};

export async function runDocumentIntelligence(
  pdfBuffer: ArrayBuffer,
  fileName: string,
  rules: ValidationRule[] = equitrustMarketEarlyNjRules
): Promise<ReviewResult> {
  const { pages, pageCount, fullText, hasEmbeddedText } = await extractPdfPages(pdfBuffer);
  const checkboxes = detectCheckboxes(pages);
  const signatures = detectSignatures(pages);
  const dates = detectDates(pages);
  const values = extractKnownValues(pages, fullText);
  const flags = detectPacketFlags(pages, fullText, checkboxes);

  const extractionMode: ExtractionMode = !hasEmbeddedText
    ? "image_only"
    : pages.every((p) => p.hasEmbeddedText)
      ? "embedded_text"
      : "mixed";

  const packet: DocumentPacket = {
    fileName,
    pageCount,
    extractionMode,
    hasEmbeddedText,
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
  const lowConfidencePacket = !packet.hasEmbeddedText || packet.extractionMode === "image_only";

  for (const rule of rules) {
    const isConditional = !!rule.condition;
    const conditionActive = isConditionActive(rule, packet);

    if (isConditional && !conditionActive) {
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

  return items;
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
  if (lowConfidencePacket) {
    return makeItem(
      rule,
      packet,
      "needs_manual_verification",
      "low",
      !!rule.condition,
      "Page appears image-only or lacks embedded text. Manual verification required — not marked missing."
    );
  }

  switch (rule.kind) {
    case "page_type": {
      const required = rule.pageTypes ?? [];
      const found = required.some((t) => hasPageType(packet.pages, t));
      if (found) return makeItem(rule, packet, "present", "high", !!rule.condition);
      const pageConfidence = packet.pages.some((p) => p.hasEmbeddedText) ? "medium" : "low";
      return makeItem(
        rule,
        packet,
        pageConfidence === "low" ? "needs_manual_verification" : "missing",
        pageConfidence,
        !!rule.condition,
        found ? undefined : `Expected document section not identified: ${rule.label}.`
      );
    }
    case "signature": {
      const sig = isSignaturePresent(packet.signatures, rule.signatureLabel ?? "");
      if (sig.signed) return makeItem(rule, packet, "present", sig.confidence, !!rule.condition);
      const pageHasSigSection = packet.pages.some(
        (p) => rule.pageTypes?.includes(p.classification) && p.hasEmbeddedText
      );
      if (!pageHasSigSection)
        return makeItem(rule, packet, "needs_manual_verification", "low", !!rule.condition, "Signature area not confidently detected in extracted text.");
      return makeItem(rule, packet, "missing", "medium", !!rule.condition, "No e-signature indicator found near expected signature line.");
    }
    case "date_near_label": {
      const pageText = packet.pages.map((p) => p.rawText).join("\n");
      const { present, confidence } = hasDateNearLabels(pageText);
      if (present) return makeItem(rule, packet, "present", confidence, !!rule.condition);
      return makeItem(rule, packet, "needs_manual_verification", "low", !!rule.condition, "Date not confidently detected — verify handwritten date manually.");
    }
    case "allocation_100": {
      const total = packet.flags.allocationTotal;
      if (total === 100) return makeItem(rule, packet, "present", "high", false);
      if (total === undefined)
        return makeItem(rule, packet, "needs_manual_verification", "low", false, "Allocation percentages could not be read from document text.");
      return makeItem(rule, packet, "missing", "medium", false, `Allocation total is ${total}%, expected 100%.`);
    }
    case "checkbox_yes":
    case "label_value":
    default: {
      const valueKey = mapRuleToValueKey(rule.id);
      const extracted = packet.values.find((v) => v.key === valueKey);
      if (extracted?.present)
        return makeItem(rule, packet, "present", extracted.confidence, !!rule.condition, extracted.maskedPreview ? `Detected (${extracted.maskedPreview})` : undefined);

      const textHit = rule.labelPatterns?.some((p) => p.test(packet.fullText));
      const pageConf = pageTextConfidence(packet.fullText.length, packet.hasEmbeddedText);

      if (textHit && pageConf !== "low")
        return makeItem(rule, packet, "needs_manual_verification", "medium", !!rule.condition, "Section label found but value not confidently extracted.");

      if (pageConf === "low")
        return makeItem(rule, packet, "needs_manual_verification", "low", !!rule.condition, "Insufficient embedded text for automated verification.");

      return makeItem(rule, packet, "missing", "medium", !!rule.condition, `Required information not detected: ${rule.label}.`);
    }
  }
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

function findRulePage(rule: ValidationRule, packet: DocumentPacket): number {
  if (rule.pageTypes) {
    const pg = packet.pages.find((p) => rule.pageTypes!.includes(p.classification));
    if (pg) return pg.pageNumber;
  }
  return 1;
}

function makeItem(
  rule: ValidationRule,
  packet: DocumentPacket,
  status: FieldStatus,
  confidence: ConfidenceLevel,
  isConditional: boolean,
  message?: string
): ValidationResultItem {
  const page = findRulePage(rule, packet);
  const documentType = rule.pageTypes?.[0] ?? packet.pages[page - 1]?.classification ?? "unknown";
  return {
    ruleId: rule.id,
    label: rule.label,
    page,
    section: rule.section,
    documentType,
    status,
    severity: rule.severity,
    message,
    confidence: minConfidence(confidence, packet.pages[page - 1]?.classificationConfidence ?? "medium"),
    isConditional,
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
    const key = `${item.page}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, { page: item.page, section: item.section, documentType: item.documentType, items: [] });
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
    .sort((a, b) => a.page - b.page || a.section.localeCompare(b.section))
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => order[a.status] - order[b.status]),
    }));
}
