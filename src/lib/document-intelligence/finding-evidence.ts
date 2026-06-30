import type {
  ConfidenceLevel,
  DocumentPacket,
  FieldStatus,
  FindingDisposition,
  HighlightRegion,
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
import { resolveScopedTargetForRule, getConfigurableRuleById } from "./rule-config";
import {
  getScopedBoundingBox,
  runScopedSearch,
  scopedDocumentLocated,
  scopedSectionLocated,
  type ScopedSearchContext,
} from "./scoped-validation";
import { getNonIgnoredPages } from "./classify-pages";

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
  scopedContext?: ScopedSearchContext;
  hasValueEvidence?: boolean;
  highlightRegions?: HighlightRegion[];
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
  const scopedTarget = resolveScopedTargetForRule(rule);
  if (scopedTarget) {
    const searchPages =
      scopedTarget.includeAdministrativePages || rule.includeAdministrativePages
        ? packet.pages
        : getNonIgnoredPages(packet.pages);
    const scoped = runScopedSearch(searchPages, scopedTarget);
    if (scoped.pageNumber) return scoped.pageNumber;
  }

  if (rule.page) return rule.page;

  const labelPage = findPageMatchingLabelPatterns(rule, packet);
  if (labelPage) return labelPage;

  if (rule.pageTypes?.length) {
    const byType = findPageByClassification(rule, packet);
    if (byType.page !== null) return byType.page;
  }

  return null;
}

function buildHighlightRegions(context?: ScopedSearchContext): HighlightRegion[] | undefined {
  if (!context) return undefined;
  const regions: HighlightRegion[] = [];
  for (const stage of context.stages) {
    if (!stage.boundingBox || !stage.pageNumber) continue;
    regions.push({
      pageNumber: stage.pageNumber,
      boundingBox: stage.boundingBox,
      label: stage.stage,
      snippet: stage.snippet,
    });
  }
  return regions.length ? regions : undefined;
}

function appendScopedReason(base: string, context?: ScopedSearchContext): string {
  if (!context?.stages.length) return base;
  const trace = context.stages.map((stage) => stage.detail).join(" → ");
  return `${base} Scoped trace: ${trace}`;
}

function pagesForRuleSearch(rule: ValidationRule, packet: DocumentPacket): PageAnalysis[] {
  const configured = getConfigurableRuleById(rule.id);
  if (rule.includeAdministrativePages || configured?.includeAdministrativePages) {
    return packet.pages.filter(
      (page) => page.isIgnored && page.documentType === configured?.requiredDocument
    );
  }
  return getNonIgnoredPages(packet.pages);
}

function ruleAllowsGlobalFallback(rule: ValidationRule): boolean {
  return rule.allowGlobalFallback === true || getConfigurableRuleById(rule.id)?.allowGlobalFallback === true;
}

function runRuleScopedContext(
  rule: ValidationRule,
  packet: DocumentPacket
): ScopedSearchContext | undefined {
  const target = resolveScopedTargetForRule(rule);
  if (!target) return undefined;
  const searchPages =
    target.includeAdministrativePages || rule.includeAdministrativePages
      ? packet.pages
      : getNonIgnoredPages(packet.pages);
  return runScopedSearch(searchPages, target);
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
  const scopedContext = runRuleScopedContext(rule, packet);
  const sectionPageNumber = scopedContext?.pageNumber ?? findSectionPage(rule, packet);
  const sectionPage = sectionPageNumber
    ? packet.pages.find((p) => p.pageNumber === sectionPageNumber)
    : undefined;
  const highlightRegions = buildHighlightRegions(scopedContext);

  if (!packetHasUsableText(packet)) {
    return {
      ...unableToDetermine(
        rule,
        packet,
        "No readable text or OCR output — cannot verify this requirement automatically."
      ),
      scopedContext,
      highlightRegions,
    };
  }

  switch (rule.kind) {
    case "page_type": {
      const required = rule.pageTypes ?? [];
      const searchPages = pagesForRuleSearch(rule, packet);
      const scopedPage = scopedContext?.pageNumber
        ? packet.pages.find((p) => p.pageNumber === scopedContext.pageNumber)
        : undefined;
      const match =
        (scopedPage && scopedDocumentLocated(scopedContext) ? scopedPage : undefined) ??
        required
          .map((type) => searchPages.find((p) => p.classification === type))
          .find(Boolean);
      if (match) {
        return {
          status: "present",
          confidence: match.classificationConfidence,
          disposition: "found_complete",
          evidenceSnippet: maskEvidenceSnippet(match.rawText.slice(0, 120)),
          evidenceReason: appendScopedReason(
            `Detected ${getPageClassificationLabel(match.classification)} on page ${match.pageNumber}.`,
            scopedContext
          ),
          detectedFormName: getPageClassificationLabel(match.classification),
          pageEvidence: buildBaseEvidence(rule, packet, match.pageNumber),
          scopedContext,
          hasValueEvidence: true,
          highlightRegions,
        };
      }

      const searchedWithOcr = searchPages.some((p) => pageHasUsableText(p));
      if (!searchedWithOcr) {
        return {
          ...unableToDetermine(rule, packet, "OCR could not identify this form type in the packet."),
          scopedContext,
          highlightRegions,
        };
      }

      if (!scopedDocumentLocated(scopedContext) && !ruleAllowsGlobalFallback(rule)) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            `Required document not located in scoped search: ${rule.label}.`
          ),
          scopedContext,
          highlightRegions,
        };
      }

      return {
        status: "missing",
        confidence: "medium",
        disposition: "not_found",
        message: `Expected form section not found: ${rule.label}.`,
        evidenceReason: appendScopedReason(
          "Scoped document search did not locate the required form type.",
          scopedContext
        ),
        pageEvidence: buildBaseEvidence(rule, packet, null),
        scopedContext,
        highlightRegions,
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
          evidenceReason: appendScopedReason(
            "Signature indicator found in OCR/text near expected signature line.",
            scopedContext
          ),
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: {
            ...sigEvidence,
            signaturePage: sigPage ?? undefined,
            boundingBox: sigEvidence.boundingBox ?? getScopedBoundingBox(scopedContext),
          },
          scopedContext,
          highlightRegions,
          hasValueEvidence: true,
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
          evidenceReason: appendScopedReason(
            "OCR located the signature block; no e-sign or signature marker found.",
            scopedContext
          ),
          detectedFormName: getPageClassificationLabel(signaturePageMeta.classification),
          pageEvidence: { ...sigEvidence, signaturePage: signaturePageMeta.pageNumber },
          scopedContext,
          highlightRegions,
        };
      }

      if (!scopedDocumentLocated(scopedContext) && !ruleAllowsGlobalFallback(rule)) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            "Signature area could not be located within scoped application document.",
            sigPage
          ),
          scopedContext,
          highlightRegions,
        };
      }

      return {
        ...unableToDetermine(
          rule,
          packet,
          "Signature area could not be confidently located in OCR output.",
          sigPage
        ),
        scopedContext,
        highlightRegions,
      };
    }

    case "date_near_label": {
      const datePage = sectionPageNumber;
      const scopedPages = getNonIgnoredPages(packet.pages);
      const pageText = datePage
        ? (scopedPages.find((p) => p.pageNumber === datePage)?.rawText ?? "")
        : scopedPages
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
          evidenceReason: appendScopedReason(
            "Signature date found near expected label (DOB excluded).",
            scopedContext
          ),
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: { ...dateEvidence, datePage: datePage ?? undefined },
          scopedContext,
          highlightRegions,
          hasValueEvidence: true,
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
      const activePages = getNonIgnoredPages(packet.pages);
      const allocationPage =
        activePages.find((p) => pageHasAllocationTable(p)) ??
        activePages.find((p) => p.classification === "initial_premium_allocation");
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
          evidenceReason: appendScopedReason(
            "Allocation percentages sum to 100% within INITIAL PREMIUM ALLOCATION - REQUIRED table.",
            scopedContext
          ),
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: evidence,
          scopedContext,
          highlightRegions,
          hasValueEvidence: true,
        };
      }
      if (total === undefined) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            "Allocation table not readable from OCR/text.",
            sectionPageNumber
          ),
          scopedContext,
          highlightRegions,
        };
      }

      if (!scopedDocumentLocated(scopedContext)) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            "INITIAL PREMIUM ALLOCATION - REQUIRED table not located in scoped search.",
            sectionPageNumber
          ),
          scopedContext,
          highlightRegions,
        };
      }

      return {
        status: "missing",
        confidence: "medium",
        disposition: "not_found",
        message: `Allocation total is ${total}%, expected 100%.`,
        evidenceReason: appendScopedReason(
          "OCR/text parsed allocation values that do not total 100%.",
          scopedContext
        ),
        pageEvidence: evidence,
        scopedContext,
        highlightRegions,
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
          evidenceReason: appendScopedReason(
            "Required value detected in OCR/text extraction.",
            scopedContext
          ),
          detectedFormName: sectionPage ? getPageClassificationLabel(sectionPage.classification) : undefined,
          pageEvidence: { ...valueEvidence, valuePage: extracted.page ?? undefined },
          scopedContext,
          highlightRegions,
          hasValueEvidence: true,
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
          evidenceReason: appendScopedReason(
            "Value pattern matched in OCR near section label.",
            scopedContext
          ),
          detectedFormName: getPageClassificationLabel(targetPage!.classification),
          pageEvidence: { ...valueEvidence, valuePage: targetPage!.pageNumber },
          scopedContext,
          highlightRegions,
          hasValueEvidence: true,
        };
      }

      if (targetPage && rule.labelPatterns?.some((p) => p.test(targetPage.rawText))) {
        return {
          status: "incomplete",
          confidence: "medium",
          disposition: "found_incomplete",
          message: "Section label found but required value not extracted.",
          evidenceSnippet: snippetResult?.snippet,
          evidenceReason: appendScopedReason(
            "OCR located the field label; value missing or illegible.",
            scopedContext
          ),
          detectedFormName: getPageClassificationLabel(targetPage.classification),
          pageEvidence: { ...valueEvidence, valuePage: targetPage.pageNumber },
          scopedContext,
          highlightRegions,
        };
      }

      if (targetPage && pageHasUsableText(targetPage)) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            "Section page located but field label not confidently matched.",
            targetPage.pageNumber
          ),
          scopedContext,
          highlightRegions,
        };
      }

      if (!scopedDocumentLocated(scopedContext) && !ruleAllowsGlobalFallback(rule)) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            `Could not locate scoped document for ${rule.label}.`
          ),
          scopedContext,
          highlightRegions,
        };
      }

      const anyText =
        ruleAllowsGlobalFallback(rule) &&
        rule.labelPatterns?.some((p) => p.test(packet.fullText));
      if (!anyText) {
        return {
          ...unableToDetermine(rule, packet, "Could not locate this section in scoped OCR output."),
          scopedContext,
          highlightRegions,
        };
      }

      if (!scopedSectionLocated(scopedContext) && !ruleAllowsGlobalFallback(rule)) {
        return {
          ...unableToDetermine(
            rule,
            packet,
            `Document located but section not confirmed for ${rule.label}.`
          ),
          scopedContext,
          highlightRegions,
        };
      }

      return {
        status: "missing",
        confidence: "medium",
        disposition: "not_found",
        message: `Required information not detected: ${rule.label}.`,
        evidenceReason: appendScopedReason(
          "Scoped section located but required value absent.",
          scopedContext
        ),
        pageEvidence: valueEvidence,
        scopedContext,
        highlightRegions,
      };
    }
  }
}
