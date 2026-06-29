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
import {
  comparePageGroups,
  PACKET_LEVEL_LABEL,
  resolveFindingPage,
  type PageEvidence,
} from "./resolve-finding-page";

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
  const evidence = buildPageEvidence(rule, packet);

  if (lowConfidencePacket) {
    const resolved = resolveFindingPage(rule, packet, evidence);
    const pageNote =
      packet.pageCount > 1
        ? ` ${packet.pageCount}-page scanned packet — verify on ${resolved.pageLabel}.`
        : "";
    return makeItem(
      rule,
      packet,
      "needs_manual_verification",
      "low",
      !!rule.condition,
      `Image-only or low-confidence extraction.${pageNote} Manual verification required — not marked missing.`,
      evidence
    );
  }

  switch (rule.kind) {
    case "page_type": {
      const required = rule.pageTypes ?? [];
      const found = required.some((t) => hasPageType(packet.pages, t));
      if (found) return makeItem(rule, packet, "present", "high", !!rule.condition, undefined, evidence);
      const pageConfidence = packet.pages.some((p) => p.hasEmbeddedText) ? "medium" : "low";
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
        (p) => rule.pageTypes?.includes(p.classification) && p.hasEmbeddedText
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
      const pageConf = pageTextConfidence(packet.fullText.length, packet.hasEmbeddedText);

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
  return {
    valuePage: extracted?.page ?? undefined,
    signaturePage: packet.signatures.find((s) => s.label === rule.signatureLabel)?.page ?? undefined,
    checkboxPage: packet.checkboxes.find((c) => c.label === rule.checkboxLabel)?.page ?? undefined,
    datePage: findDatePageForRule(rule, packet) ?? undefined,
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
  const resolved = resolveFindingPage(rule, packet, evidence);
  const pageMeta =
    resolved.page !== null
      ? packet.pages.find((p) => p.pageNumber === resolved.page)
      : undefined;

  const page =
    resolved.page !== null && pageMeta && !pageMeta.hasEmbeddedText
      ? null
      : resolved.page;
  const pageLabel = page === null ? PACKET_LEVEL_LABEL : resolved.pageLabel;

  return {
    ruleId: rule.id,
    label: rule.label,
    page,
    pageLabel,
    section: rule.section,
    documentType: resolved.documentType,
    status,
    severity: rule.severity,
    message,
    confidence: minConfidence(confidence, pageMeta?.classificationConfidence ?? "medium"),
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
    const key = `${item.pageLabel}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, {
        page: item.page,
        pageLabel: item.pageLabel,
        section: item.section,
        documentType: item.documentType,
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
    .sort(comparePageGroups)
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => order[a.status] - order[b.status]),
    }));
}
