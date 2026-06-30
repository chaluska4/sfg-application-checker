import type {
  ConfidenceLevel,
  DocumentPacket,
  FieldStatus,
  FindingDisposition,
  PageAnalysis,
  ValidationRule,
} from "./types";
import { getPageClassificationLabel } from "./page-classification-labels";
import { pageHasUsableText } from "./ocr";
import { pageHasAllocationTable } from "./parse-allocation-table";
import {
  findPageByClassification,
  findPageMatchingLabelPatterns,
  resolveEvidenceBoundingBox,
  type PageEvidence,
} from "./resolve-finding-page";
import { isCheckboxChecked } from "./detect-checkboxes";
import { isSignaturePresent } from "./detect-signatures";
import { hasSignatureDateNearLabels } from "./detect-dates";
import { minConfidence } from "./confidence";

const PII_SNIPPET_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{9}\b/g,
  /\b\d{3}\s\d{2}\s\d{4}\b/g,
];

export interface FieldEvidenceResult {
  status: FieldStatus;
  confidence: ConfidenceLevel;
  disposition: FindingDisposition;
  message?: string;
  evidenceSnippet?: string;
  evidenceReason?: string;
  detectedFormName?: string;
  pageEvidence: PageEvidence;
}

export function maskEvidenceSnippet(text: string): string {
  let masked = text;
  for (const pattern of PII_SNIPPET_PATTERNS) {
    masked = masked.replace(pattern, "[redacted]");
  }
  return masked.trim().slice(0, 160);
}

export function packetHasUsableText(packet: DocumentPacket): boolean {
  return (
    packet.hasEmbeddedText ||
    Boolean(packet.hasOcrText) ||
    packet.pages.some(pageHasUsableText)
  );
}

export function findSectionPage(rule: ValidationRule, packet: DocumentPacket): number | null {
  if (rule.page) return rule.page;

  const labelPage = findPageMatchingLabelPatterns(rule, packet);
  if (labelPage) return labelPage;

  if (rule.pageTypes?.length) {
    const byType = findPageByClassification(rule, packet);
    if (byType.page !== null) return byType.page;
  }

  return null;
}

export function searchOcrSnippetNearLabel(
  page: PageAnalysis,
  labelPatterns: RegExp[] | undefined,
  valuePatterns?: RegExp[]
): { snippet: string; confidence: ConfidenceLevel } | null {
  if (!page.ocrLines?.length && !page.rawText) return null;

  const lines = page.ocrLines ?? page.rawText.split("\n").map((text) => ({
    text,
    confidence: "medium" as ConfidenceLevel,
  }));

  for (const line of lines) {
    if (!labelPatterns?.some((pattern) => pattern.test(line.text))) continue;

    if (valuePatterns?.some((pattern) => pattern.test(line.text))) {
      return { snippet: maskEvidenceSnippet(line.text), confidence: line.confidence ?? "medium" };
    }

    const lineIndex = lines.indexOf(line);
    const nearby = lines.slice(lineIndex, lineIndex + 4);
    for (const nearLine of nearby) {
      if (valuePatterns?.some((pattern) => pattern.test(nearLine.text))) {
        return {
          snippet: maskEvidenceSnippet(nearLine.text),
          confidence: minConfidence(line.confidence ?? "medium", nearLine.confidence ?? "medium"),
        };
      }
    }

    return { snippet: maskEvidenceSnippet(line.text), confidence: line.confidence ?? "medium" };
  }

  if (valuePatterns?.length) {
    for (const line of lines) {
      if (valuePatterns.some((pattern) => pattern.test(line.text))) {
        return { snippet: maskEvidenceSnippet(line.text), confidence: line.confidence ?? "medium" };
      }
    }
  }

  return null;
}

function buildBaseEvidence(rule: ValidationRule, packet: DocumentPacket, pageNumber: number | null): PageEvidence {
  const valueKey = mapRuleToValueKey(rule.id);
  const extracted = packet.values.find((v) => v.key === valueKey);
  const signaturePage = packet.signatures.find((s) => s.label === rule.signatureLabel)?.page ?? undefined;
  const checkboxPage = packet.checkboxes.find((c) => c.label === rule.checkboxLabel)?.page ?? undefined;

  const evidencePage = pageNumber ?? extracted?.page ?? signaturePage ?? checkboxPage ?? undefined;
  const boundingBox = resolveEvidenceBoundingBox(rule, packet, evidencePage) ?? undefined;

  return {
    valuePage: extracted?.page ?? pageNumber ?? undefined,
    signaturePage,
    checkboxPage,
    boundingBox,
  };
}

function unableToDetermine(
  rule: ValidationRule,
  packet: DocumentPacket,
  reason: string,
  pageNumber: number | null = null
): FieldEvidenceResult {
  const page = pageNumber ? packet.pages.find((p) => p.pageNumber === pageNumber) : undefined;
  return {
    status: packetHasUsableText(packet) ? "low_confidence" : "ocr_unreadable",
    confidence: "low",
    disposition: "unable_to_determine",
    message: reason,
    evidenceReason: reason,
    detectedFormName: page ? getPageClassificationLabel(page.classification) : undefined,
    pageEvidence: buildBaseEvidence(rule, packet, pageNumber),
  };
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

export function evaluateFieldWithEvidence(
  rule: ValidationRule,
  packet: DocumentPacket
): FieldEvidenceResult {
  const sectionPageNumber = findSectionPage(rule, packet);
  const sectionPage = sectionPageNumber
    ? packet.pages.find((p) => p.pageNumber === sectionPageNumber)
    : undefined;

  if (!packetHasUsableText(packet)) {
    return unableToDetermine(
      rule,
      packet,
      "No readable text or OCR output — cannot verify this requirement automatically."
    );
  }

  switch (rule.kind) {
    case "page_type": {
      const required = rule.pageTypes ?? [];
      const match = required
        .map((type) => packet.pages.find((p) => p.classification === type))
        .find(Boolean);
      if (match) {
        return {
          status: "present",
          confidence: match.classificationConfidence,
          disposition: "found_complete",
          evidenceSnippet: maskEvidenceSnippet(match.rawText.slice(0, 120)),
          evidenceReason: `Detected ${getPageClassificationLabel(match.classification)} on page ${match.pageNumber}.`,
          detectedFormName: getPageClassificationLabel(match.classification),
          pageEvidence: buildBaseEvidence(rule, packet, match.pageNumber),
        };
      }

      const searchedWithOcr = packet.pages.some((p) => pageHasUsableText(p));
      if (!searchedWithOcr) {
        return unableToDetermine(rule, packet, "OCR could not identify this form type in the packet.");
      }

      return {
        status: "missing",
        confidence: "medium",
        disposition: "not_found",
        message: `Expected form section not found: ${rule.label}.`,
        evidenceReason: "Searched OCR text across all pages; no matching form header detected.",
        pageEvidence: buildBaseEvidence(rule, packet, null),
      };
    }

    case "signature": {
      const sig = isSignaturePresent(packet.signatures, rule.signatureLabel ?? "");
      const sigRecord = packet.signatures.find((s) => s.label === rule.signatureLabel);
      const sigPage = sigRecord?.page ?? sectionPageNumber;
      const sigEvidence = buildBaseEvidence(rule, packet, sigPage ?? null);

      if (sig.signed) {
        return {
          status: "present",
          confidence: sig.confidence,
          disposition: "found_complete",
          evidenceReason: "Signature indicator found in OCR/text near expected signature line.",
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: { ...sigEvidence, signaturePage: sigPage ?? undefined },
        };
      }

      const signatureSectionFound =
        Boolean(sigRecord?.page) ||
        packet.pages.some(
          (p) =>
            pageHasUsableText(p) &&
            (rule.labelPatterns?.some((pat) => pat.test(p.rawText)) ||
              (rule.pageTypes?.length ? rule.pageTypes.includes(p.classification) : false))
        );
      const signaturePageMeta =
        (sigRecord?.page ? packet.pages.find((p) => p.pageNumber === sigRecord.page) : undefined) ??
        sectionPage ??
        packet.pages.find(
          (p) => pageHasUsableText(p) && rule.labelPatterns?.some((pat) => pat.test(p.rawText))
        );

      if (signatureSectionFound && signaturePageMeta) {
        return {
          status: "missing",
          confidence: "medium",
          disposition: "not_found",
          message: "Signature section found but no signature detected.",
          evidenceReason: "OCR located the signature block; no e-sign or signature marker found.",
          detectedFormName: getPageClassificationLabel(signaturePageMeta.classification),
          pageEvidence: { ...sigEvidence, signaturePage: signaturePageMeta.pageNumber },
        };
      }

      return unableToDetermine(
        rule,
        packet,
        "Signature area could not be confidently located in OCR output.",
        sigPage
      );
    }

    case "date_near_label": {
      const datePage = sectionPageNumber;
      const pageText = datePage
        ? (packet.pages.find((p) => p.pageNumber === datePage)?.rawText ?? "")
        : packet.pages
            .filter((p) =>
              p.classification === "application_page_3_signatures" ||
              p.classification === "acknowledgments_signatures" ||
              p.classification === "product_disclosure"
            )
            .map((p) => p.rawText)
            .join("\n");
      const { present, confidence, matchedDate } = hasSignatureDateNearLabels(
        pageText,
        rule.labelPatterns
      );
      const dateEvidence = buildBaseEvidence(rule, packet, datePage);

      if (present) {
        return {
          status: "present",
          confidence,
          disposition: "found_complete",
          evidenceSnippet: matchedDate,
          evidenceReason: "Signature date found near expected label (DOB excluded).",
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: { ...dateEvidence, datePage: datePage ?? undefined },
        };
      }

      if (sectionPage && rule.labelPatterns?.some((p) => p.test(sectionPage.rawText))) {
        return {
          status: "incomplete",
          confidence: "medium",
          disposition: "found_incomplete",
          message: "Date label found but date value not detected.",
          evidenceReason: "OCR found the date field label; handwritten date may require review.",
          detectedFormName: getPageClassificationLabel(sectionPage.classification),
          pageEvidence: { ...dateEvidence, datePage: sectionPage.pageNumber },
        };
      }

      return unableToDetermine(rule, packet, "Date field could not be located in OCR output.", datePage);
    }

    case "checkbox_yes": {
      const checked = rule.checkboxLabel
        ? isCheckboxChecked(packet.checkboxes, rule.checkboxLabel)
        : false;
      const checkboxPage =
        packet.checkboxes.find((c) => c.label === rule.checkboxLabel)?.page ?? sectionPageNumber;
      const checkboxEvidence = buildBaseEvidence(rule, packet, checkboxPage ?? null);

      if (checked) {
        return {
          status: "present",
          confidence: "medium",
          disposition: "found_complete",
          evidenceReason: "Checkbox/selection mark indicates Yes.",
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: { ...checkboxEvidence, checkboxPage: checkboxPage ?? undefined },
        };
      }

      if (sectionPage && pageHasUsableText(sectionPage)) {
        const hasSelectionMarks = (sectionPage.ocrSelectionMarks?.length ?? 0) > 0;
        if (hasSelectionMarks) {
          return {
            status: "missing",
            confidence: "high",
            disposition: "not_found",
            message: "Checkbox section found but required selection not marked.",
            evidenceReason: "Azure selection marks present; expected option not selected.",
            detectedFormName: getPageClassificationLabel(sectionPage.classification),
            pageEvidence: { ...checkboxEvidence, checkboxPage: sectionPage.pageNumber },
          };
        }

        if (rule.labelPatterns?.some((p) => p.test(sectionPage.rawText))) {
          return {
            status: "low_confidence",
            confidence: "low",
            disposition: "unable_to_determine",
            message: "Checkbox area found; selection could not be confirmed from OCR.",
            evidenceReason: "Section label found without reliable checkbox/selection mark data.",
            detectedFormName: getPageClassificationLabel(sectionPage.classification),
            pageEvidence: { ...checkboxEvidence, checkboxPage: sectionPage.pageNumber },
          };
        }
      }

      return unableToDetermine(rule, packet, "Checkbox section not located in OCR output.", checkboxPage);
    }

    case "allocation_100": {
      const allocationPage =
        packet.pages.find((p) => pageHasAllocationTable(p)) ??
        packet.pages.find((p) => p.classification === "initial_premium_allocation");
      const total = packet.flags.allocationTotal;
      const evidence = buildBaseEvidence(
        rule,
        packet,
        allocationPage?.pageNumber ?? sectionPageNumber
      );
      if (total === 100) {
        return {
          status: "present",
          confidence: "high",
          disposition: "found_complete",
          evidenceReason: "Allocation percentages sum to 100%.",
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: evidence,
        };
      }
      if (total === undefined) {
        return unableToDetermine(rule, packet, "Allocation table not readable from OCR/text.", sectionPageNumber);
      }
      return {
        status: "missing",
        confidence: "medium",
        disposition: "not_found",
        message: `Allocation total is ${total}%, expected 100%.`,
        evidenceReason: "OCR/text parsed allocation values that do not total 100%.",
        pageEvidence: evidence,
      };
    }

    case "label_value":
    default: {
      const valueKey = mapRuleToValueKey(rule.id);
      const extracted = packet.values.find((v) => v.key === valueKey);
      const valueEvidence = buildBaseEvidence(rule, packet, extracted?.page ?? sectionPageNumber);

      if (extracted?.present) {
        return {
          status: "present",
          confidence: extracted.confidence,
          disposition: "found_complete",
          message: extracted.maskedPreview ? `Detected (${extracted.maskedPreview})` : undefined,
          evidenceSnippet: extracted.maskedPreview,
          evidenceReason: "Required value detected in OCR/text extraction.",
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: { ...valueEvidence, valuePage: extracted.page ?? undefined },
        };
      }

      const targetPage = sectionPage ?? (sectionPageNumber ? packet.pages.find((p) => p.pageNumber === sectionPageNumber) : undefined);
      const snippetResult = targetPage
        ? searchOcrSnippetNearLabel(targetPage, rule.labelPatterns, rule.valuePatterns)
        : null;

      if (snippetResult && rule.valuePatterns?.some((p) => p.test(snippetResult.snippet))) {
        return {
          status: "present",
          confidence: snippetResult.confidence,
          disposition: "found_complete",
          evidenceSnippet: snippetResult.snippet,
          evidenceReason: "Value pattern matched in OCR near section label.",
          detectedFormName: getPageClassificationLabel(targetPage!.classification),
          pageEvidence: { ...valueEvidence, valuePage: targetPage!.pageNumber },
        };
      }

      if (targetPage && rule.labelPatterns?.some((p) => p.test(targetPage.rawText))) {
        return {
          status: "incomplete",
          confidence: "medium",
          disposition: "found_incomplete",
          message: "Section label found but required value not extracted.",
          evidenceSnippet: snippetResult?.snippet,
          evidenceReason: "OCR located the field label; value missing or illegible.",
          detectedFormName: getPageClassificationLabel(targetPage.classification),
          pageEvidence: { ...valueEvidence, valuePage: targetPage.pageNumber },
        };
      }

      if (targetPage && pageHasUsableText(targetPage)) {
        return unableToDetermine(
          rule,
          packet,
          "Section page located but field label not confidently matched.",
          targetPage.pageNumber
        );
      }

      const anyText = rule.labelPatterns?.some((p) => p.test(packet.fullText));
      if (!anyText) {
        return unableToDetermine(rule, packet, "Could not locate this section in OCR output.");
      }

      return {
        status: "missing",
        confidence: "medium",
        disposition: "not_found",
        message: `Required information not detected: ${rule.label}.`,
        evidenceReason: "Searched packet text; section markers absent.",
        pageEvidence: valueEvidence,
      };
    }
  }
}
