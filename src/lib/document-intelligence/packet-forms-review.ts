import type {
  DocumentPacket,
  FieldStatus,
  PageClassification,
  ValidationResultItem,
  ValidationRule,
} from "./types";
import {
  equitrustMarketEarlyNJ,
  type RequiredStatus,
} from "./templates/equitrust-template-metadata";
import { formatExpectedPageLabel, resolveFindingLocation } from "./resolve-finding-page";
import { getStatusDisplayLabel } from "../review-display";
import { hasPageType } from "./classify-pages";
import { pageHasUsableText } from "./ocr";

export const PACKET_FORMS_SECTION = "Packet Forms Review";

/** Core conditional rules re-homed under Packet Forms Review for scanned packets. */
export const PACKET_FORM_RULES_SUPERSEDED = [
  "transfer-form",
  "replacement-notice",
  "disclosure-comparison",
] as const;

type PacketFormCondition = "replacement" | "transfer_1035";

interface PacketFormReviewSpec {
  id: string;
  label: string;
  requiredStatus: RequiredStatus;
  locationKey: keyof typeof equitrustMarketEarlyNJ.reviewItemLocations;
  condition?: PacketFormCondition;
  documentType?: PageClassification;
}

const PACKET_FORM_SPECS: PacketFormReviewSpec[] = [
  {
    id: "packet-form-transfer",
    label: "Transfer / 1035 Exchange Form",
    requiredStatus: "conditional",
    locationKey: "transfer",
    condition: "transfer_1035",
    documentType: "transfer_1035_form",
  },
  {
    id: "packet-form-replacement-notice",
    label: "Replacement Notice",
    requiredStatus: "conditional",
    locationKey: "replacementQuestions",
    condition: "replacement",
    documentType: "replacement_notice",
  },
  {
    id: "packet-form-disclosure-comparison",
    label: "Disclosure & Comparison of Products",
    requiredStatus: "conditional",
    locationKey: "disclosureComparison",
    condition: "replacement",
    documentType: "disclosure_comparison",
  },
];

export function shouldIncludePacketFormsReview(packet: DocumentPacket): boolean {
  return packet.extractionMode === "image_only";
}

export function hasConditionalTriggerEvidence(
  condition: PacketFormCondition,
  packet: DocumentPacket
): boolean {
  if (condition === "replacement") {
    return (
      packet.checkboxes.some((c) => c.label === "replacement") ||
      /existing coverage|replacement/i.test(packet.fullText)
    );
  }
  return (
    packet.checkboxes.some((c) => c.label === "transfer_1035") ||
    /1035|transfer/i.test(packet.fullText)
  );
}

export function isConditionalTriggerActive(
  condition: PacketFormCondition,
  packet: DocumentPacket
): boolean {
  if (condition === "replacement") return packet.flags.replacementSelected;
  return packet.flags.transferSelected;
}

export function isConditionalTriggerUndetermined(
  condition: PacketFormCondition,
  packet: DocumentPacket,
  lowConfidencePacket: boolean
): boolean {
  if (!lowConfidencePacket) return false;
  if (isConditionalTriggerActive(condition, packet)) return false;
  return !hasConditionalTriggerEvidence(condition, packet);
}

export function isRuleConditionUndetermined(
  rule: ValidationRule,
  packet: DocumentPacket,
  lowConfidencePacket: boolean
): boolean {
  if (!rule.condition) return false;
  const { dependsOn } = rule.condition;
  if (dependsOn === "replacement") {
    return isConditionalTriggerUndetermined("replacement", packet, lowConfidencePacket);
  }
  if (dependsOn === "transfer_1035") {
    return isConditionalTriggerUndetermined("transfer_1035", packet, lowConfidencePacket);
  }
  if (dependsOn === "source_of_funds_other") {
    if (!lowConfidencePacket) return false;
    if (packet.flags.sourceOfFundsOther) return false;
    return !/source of funds/i.test(packet.fullText);
  }
  return false;
}

function resolvePacketFormStatus(
  spec: PacketFormReviewSpec,
  packet: DocumentPacket,
  lowConfidencePacket: boolean
): FieldStatus | null {
  if (spec.documentType && spec.documentType !== "unknown" && hasPageType(packet.pages, spec.documentType)) {
    return null;
  }

  if (spec.condition) {
    if (isConditionalTriggerActive(spec.condition, packet)) {
      if (spec.documentType && spec.documentType !== "unknown") {
        return hasPageType(packet.pages, spec.documentType) ? null : "missing";
      }
      return lowConfidencePacket ? "ocr_unreadable" : "low_confidence";
    }
    if (isConditionalTriggerUndetermined(spec.condition, packet, lowConfidencePacket)) {
      return "conditional_review";
    }
    return null;
  }

  if (spec.requiredStatus === "conditional") {
    return "conditional_review";
  }

  return lowConfidencePacket ? "ocr_unreadable" : "low_confidence";
}

function makePacketFormItem(
  spec: PacketFormReviewSpec,
  packet: DocumentPacket,
  status: FieldStatus
): ValidationResultItem {
  const templateLocation = equitrustMarketEarlyNJ.reviewItemLocations[spec.locationKey];
  const rule: ValidationRule = {
    id: spec.id,
    section: PACKET_FORMS_SECTION,
    label: spec.label,
    severity: spec.requiredStatus === "supporting" ? "recommended" : "required",
    kind: "page_type",
    locationKey: spec.locationKey,
    pageTypes: spec.documentType ? [spec.documentType] : undefined,
    condition: spec.condition
      ? { dependsOn: spec.condition === "replacement" ? "replacement" : "transfer_1035", whenTruthy: true }
      : undefined,
  };

  const location = resolveFindingLocation(rule, packet, {});
  const expectedPageLabel =
    location.expectedPageLabel ??
    (templateLocation ? formatExpectedPageLabel(templateLocation) : null);

  const message =
    status === "conditional_review" && spec.condition
      ? `Verify whether ${spec.label} is required based on application answers (trigger could not be read from OCR).`
      : status === "missing"
        ? `${spec.label} required by application answers but not detected in OCR.`
        : status === "ocr_unreadable"
          ? "No readable OCR output — confirm this form using template guidance."
          : status === "low_confidence"
            ? "Form presence could not be confirmed from OCR — verify manually."
            : undefined;

  return {
    ruleId: spec.id,
    label: spec.label,
    section: PACKET_FORMS_SECTION,
    documentType: location.documentType,
    status,
    severity: rule.severity,
    message,
    confidence: "low",
    isConditional: Boolean(spec.condition),
    actualPage: location.actualPage,
    actualPageLabel: location.actualPageLabel,
    expectedDocument: location.expectedDocument ?? templateLocation?.expectedDocument ?? null,
    typicalLocation: location.typicalLocation ?? templateLocation?.typicalLocation ?? null,
    typicalPageRange: location.typicalPageRange ?? templateLocation?.typicalPageRange ?? null,
    locationConfidence: location.locationConfidence,
    manualReviewHint: location.manualReviewHint ?? templateLocation?.manualReviewHint ?? null,
    expectedPageLabel,
    page: location.actualPage,
    pageLabel: location.pageLabel,
    boundingBox: null,
    evidenceReason: message ?? null,
    statusDisplay: getStatusDisplayLabel(status),
    detectedFormName: location.detectedFormName ?? null,
  };
}

export function buildPacketFormsReviewItems(packet: DocumentPacket): ValidationResultItem[] {
  const hasUsableText =
    packet.hasEmbeddedText ||
    Boolean(packet.hasOcrText) ||
    packet.pages.some((p) => pageHasUsableText(p));
  const lowConfidencePacket = !hasUsableText;

  const items: ValidationResultItem[] = [];

  for (const spec of PACKET_FORM_SPECS) {
    const status = resolvePacketFormStatus(spec, packet, lowConfidencePacket);
    if (!status) continue;
    items.push(makePacketFormItem(spec, packet, status));
  }

  return items;
}

export function appendPacketFormsReview(
  items: ValidationResultItem[],
  packet: DocumentPacket
): ValidationResultItem[] {
  if (!shouldIncludePacketFormsReview(packet)) return items;

  const withoutSuperseded = items.filter(
    (item) => !PACKET_FORM_RULES_SUPERSEDED.includes(item.ruleId as (typeof PACKET_FORM_RULES_SUPERSEDED)[number])
  );

  return [...withoutSuperseded, ...buildPacketFormsReviewItems(packet)];
}
