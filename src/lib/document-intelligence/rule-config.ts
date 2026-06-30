import type { DetectionKind, IssueSeverity, PageClassification, ValidationRule } from "./types";
import type { DocumentTypeId, PageSubtypeId } from "./document-taxonomy";
import type { ScopedFieldTarget } from "./scoped-validation";
import { toLegacyPageClassification } from "./document-taxonomy";
import {
  EQUITRUST_CONFIGURABLE_RULES as EQUITRUST_RULE_DEFINITIONS,
  EQUITRUST_CORE_RULE_IDS,
  EQUITRUST_IMAGE_ONLY_OVERLAY_RULE_IDS,
} from "./templates/equitrust-configurable-rules";

export type ConfigurableEvidenceKind =
  | "signature"
  | "date"
  | "value"
  | "checkbox"
  | "page_type"
  | "allocation_100";

export interface ConfigurableRuleDefinition {
  id: string;
  label: string;
  section: string;
  severity: IssueSeverity;
  kind: DetectionKind;
  requiredDocument: DocumentTypeId;
  requiredSection?: string;
  expectedPageSubtype?: PageSubtypeId;
  evidence: ConfigurableEvidenceKind[];
  labelPatterns?: string[];
  valuePatterns?: string[];
  signatureLabel?: string;
  checkboxLabel?: string;
  locationKey?: string;
  condition?: { dependsOn: string; whenTruthy?: boolean };
  confidenceThreshold?: number;
  allowGlobalFallback?: boolean;
  includeAdministrativePages?: boolean;
  imageOnlyOverlay?: boolean;
}

export {
  EQUITRUST_RULE_DEFINITIONS as EQUITRUST_CONFIGURABLE_RULES,
  EQUITRUST_CORE_RULE_IDS,
  EQUITRUST_IMAGE_ONLY_OVERLAY_RULE_IDS,
};

function toRegex(pattern: string): RegExp {
  return new RegExp(pattern, "i");
}

export function compileConfigurableRule(def: ConfigurableRuleDefinition): ValidationRule {
  const pageTypes: PageClassification[] = [
    toLegacyPageClassification(def.requiredDocument, def.expectedPageSubtype ?? "generic"),
  ];

  return {
    id: def.id,
    label: def.label,
    section: def.section,
    severity: def.severity,
    kind: def.kind,
    pageTypes,
    labelPatterns: def.labelPatterns?.map(toRegex),
    valuePatterns: def.valuePatterns?.map(toRegex),
    signatureLabel: def.signatureLabel,
    checkboxLabel: def.checkboxLabel,
    locationKey: def.locationKey,
    condition: def.condition,
    allowGlobalFallback: def.allowGlobalFallback,
    includeAdministrativePages: def.includeAdministrativePages,
  };
}

export function compileConfigurableRules(defs: ConfigurableRuleDefinition[]): ValidationRule[] {
  return defs.map(compileConfigurableRule);
}

export function compileEquitrustCoreRules(): ValidationRule[] {
  return compileConfigurableRules(
    EQUITRUST_RULE_DEFINITIONS.filter((rule) => !rule.imageOnlyOverlay)
  );
}

export function compileEquitrustImageOnlyOverlayRules(): ValidationRule[] {
  return compileConfigurableRules(
    EQUITRUST_RULE_DEFINITIONS.filter((rule) => rule.imageOnlyOverlay)
  );
}

export function getScopedTargetForRule(def: ConfigurableRuleDefinition): ScopedFieldTarget {
  return {
    requiredDocument: def.requiredDocument,
    expectedPageSubtype: def.expectedPageSubtype,
    sectionPatterns: def.requiredSection ? [new RegExp(def.requiredSection, "i")] : undefined,
    fieldPatterns: def.labelPatterns?.map(toRegex),
    valuePatterns: def.valuePatterns?.map(toRegex),
    includeAdministrativePages: def.includeAdministrativePages,
  };
}

const LEGACY_PAGE_SCOPE: Partial<
  Record<PageClassification, { documentType: DocumentTypeId; pageSubtype?: PageSubtypeId }>
> = {
  sfg_cover_sheet: { documentType: "packet_cover", pageSubtype: "cover_sheet" },
  application_page_1: { documentType: "individual_application", pageSubtype: "owner_info" },
  application_page_2: { documentType: "individual_application", pageSubtype: "beneficiary" },
  application_page_3_signatures: { documentType: "individual_application", pageSubtype: "signatures" },
  product_disclosure: { documentType: "product_disclosure", pageSubtype: "disclosure_body" },
  initial_premium_allocation: {
    documentType: "initial_premium_allocation",
    pageSubtype: "allocation_table",
  },
  fna_page_1: { documentType: "financial_needs_analysis", pageSubtype: "suitability" },
  fna_page_2: { documentType: "financial_needs_analysis", pageSubtype: "objectives" },
  fna_page_3: { documentType: "financial_needs_analysis", pageSubtype: "personal_info" },
  agent_producer_disclosure: { documentType: "agent_disclosure", pageSubtype: "generic" },
  acknowledgments_signatures: { documentType: "agent_disclosure", pageSubtype: "generic" },
  transfer_1035_form: { documentType: "transfer_1035", pageSubtype: "transfer_page_1" },
  replacement_notice: { documentType: "replacement_notice", pageSubtype: "generic" },
  disclosure_comparison: { documentType: "disclosure_comparison", pageSubtype: "generic" },
};

export function resolveScopedTargetForRule(rule: ValidationRule): ScopedFieldTarget | null {
  const configured = getConfigurableRuleById(rule.id);
  if (configured) return getScopedTargetForRule(configured);

  const pageType = rule.pageTypes?.[0];
  if (!pageType) {
    if (rule.kind === "allocation_100") {
      return {
        requiredDocument: "initial_premium_allocation",
        expectedPageSubtype: "allocation_table",
      };
    }
    return null;
  }

  const scope = LEGACY_PAGE_SCOPE[pageType];
  if (!scope) return null;

  return {
    requiredDocument: scope.documentType,
    expectedPageSubtype: scope.pageSubtype,
    sectionPatterns: rule.labelPatterns,
    fieldPatterns: rule.labelPatterns,
    valuePatterns: rule.valuePatterns,
    includeAdministrativePages: rule.includeAdministrativePages,
  };
}

export function legacyClassificationFromDocument(
  documentType: DocumentTypeId,
  pageSubtype: PageSubtypeId = "generic"
): PageClassification {
  return toLegacyPageClassification(documentType, pageSubtype);
}

export function getConfigurableRuleById(id: string): ConfigurableRuleDefinition | undefined {
  return EQUITRUST_RULE_DEFINITIONS.find((rule) => rule.id === id);
}
