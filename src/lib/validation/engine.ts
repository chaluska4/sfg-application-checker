import type {
  ChecklistItem,
  ChecklistItemStatus,
  ExtractedField,
  GroupedChecklist,
  ReviewResult,
  ReviewStatus,
  ValidationRule,
  ValidationType,
} from "./types";
import { FORM_NAME, validationSchema } from "./schema";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  "ready-to-submit": "Ready to Submit",
  "needs-review": "Needs Review",
  "missing-required": "Missing Required Information",
  "manual-review": "Manual Review Needed",
};

function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findMatchingField(
  rule: ValidationRule,
  fields: ExtractedField[]
): ExtractedField | undefined {
  const patterns = rule.fieldPatterns.map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ""));

  for (const field of fields) {
    const normalized = normalizeFieldName(field.name);
    for (const pattern of patterns) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        return field;
      }
    }
  }
  return undefined;
}

function isTruthyCheckbox(value: string): boolean {
  const v = value.toLowerCase().trim();
  return v === "yes" || v === "true" || v === "on" || v === "1" || v === "checked";
}

function validateValue(value: string, type: ValidationType): { valid: boolean; message?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false };

  switch (type) {
    case "text":
    case "selection":
      return trimmed.length > 0 ? { valid: true } : { valid: false };

    case "checkbox":
      return isTruthyCheckbox(trimmed) ? { valid: true } : { valid: false };

    case "signature":
      return trimmed.length > 0 ? { valid: true } : { valid: false, message: "Signature field appears empty" };

    case "date": {
      const datePatterns = [
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
        /^\d{4}-\d{2}-\d{2}$/,
        /^\d{1,2}-\d{1,2}-\d{2,4}$/,
      ];
      if (datePatterns.some((p) => p.test(trimmed))) return { valid: true };
      if (trimmed.length >= 6) return { valid: true };
      return { valid: false, message: "Date format may be invalid" };
    }

    case "currency": {
      const cleaned = trimmed.replace(/[$,\s]/g, "");
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > 0) return { valid: true };
      return { valid: false, message: "Premium amount must be a positive value" };
    }

    case "phone": {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length >= 10) return { valid: true };
      return { valid: false, message: "Phone number must contain at least 10 digits" };
    }

    case "email": {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { valid: true };
      return { valid: false, message: "Email format appears invalid" };
    }

    case "ssn": {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length === 9) return { valid: true };
      if (trimmed.includes("***") || trimmed.includes("XXX")) return { valid: true };
      return { valid: false, message: "SSN must be 9 digits" };
    }

    default:
      return trimmed.length > 0 ? { valid: true } : { valid: false };
  }
}

function isConditionMet(
  rule: ValidationRule,
  ruleResults: Map<string, { value: string; status: ChecklistItemStatus }>,
  fields: ExtractedField[]
): boolean {
  if (!rule.condition) return true;

  const dependent = ruleResults.get(rule.condition.dependsOnRuleId);
  let dependentValue = dependent?.value ?? "";

  if (!dependentValue) {
    const depRule = validationSchema.find((r) => r.id === rule.condition!.dependsOnRuleId);
    if (depRule) {
      const matched = findMatchingField(depRule, fields);
      dependentValue = matched?.value ?? "";
    }
  }

  const normalized = dependentValue.toLowerCase().trim();
  return rule.condition.whenValues.some((v) => normalized === v.toLowerCase().trim());
}

function groupItems(items: ChecklistItem[]): GroupedChecklist[] {
  const map = new Map<string, GroupedChecklist>();

  for (const item of items) {
    const key = `${item.page}::${item.section}`;
    if (!map.has(key)) {
      map.set(key, { page: item.page, section: item.section, items: [] });
    }
    map.get(key)!.items.push(item);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return a.section.localeCompare(b.section);
  });
}

function determineStatus(
  items: ChecklistItem[],
  hasFillableFields: boolean
): ReviewStatus {
  if (!hasFillableFields) return "manual-review";

  const hasMissingRequired = items.some(
    (i) => i.status === "missing" && i.severity === "required"
  );
  const hasWarnings = items.some((i) => i.status === "warning" || i.status === "missing");

  if (hasMissingRequired) return "missing-required";
  if (hasWarnings) return "needs-review";
  return "ready-to-submit";
}

function calculateScore(items: ChecklistItem[]): number {
  const requiredItems = items.filter((i) => i.severity === "required");
  if (requiredItems.length === 0) return 0;

  const completed = requiredItems.filter((i) => i.status === "completed").length;
  return Math.round((completed / requiredItems.length) * 100);
}

export function runValidation(
  fields: ExtractedField[],
  hasFillableFields: boolean,
  fileName: string,
  schema: ValidationRule[] = validationSchema
): ReviewResult {
  const ruleResults = new Map<string, { value: string; status: ChecklistItemStatus }>();
  const items: ChecklistItem[] = [];

  for (const rule of schema) {
    const conditionMet = isConditionMet(rule, ruleResults, fields);
    const isConditional = !!rule.condition;

    if (isConditional && !conditionMet) {
      ruleResults.set(rule.id, { value: "", status: "completed" });
      continue;
    }

    const matched = findMatchingField(rule, fields);
    const value = matched?.value ?? "";

    let status: ChecklistItemStatus;
    let message: string | undefined;

    if (!hasFillableFields) {
      status = "missing";
      message = "PDF does not expose fillable fields — manual verification required";
    } else if (!matched) {
      if (rule.required && rule.severity === "required") {
        status = "missing";
        message = "Expected field not found in PDF";
      } else if (rule.severity === "warning") {
        status = "warning";
        message = "Optional field not found in PDF";
      } else {
        status = "missing";
        message = "Expected field not found in PDF";
      }
    } else {
      const isSignatureField =
        rule.validationType === "signature" ||
        matched.type === "signature" ||
        matched.type === "PDFSignature";

      if (isSignatureField) {
        if (value.length > 0) {
          status = "completed";
        } else {
          status = rule.severity === "required" ? "missing" : "warning";
          message = "Signature field appears unsigned";
        }
      } else {
        const result = validateValue(value, rule.validationType);
        if (result.valid) {
          status = "completed";
        } else if (rule.severity === "required") {
          status = "missing";
          message = result.message ?? "Required field is empty or invalid";
        } else {
          status = "warning";
          message = result.message ?? "Field may need attention";
        }
      }
    }

    if (isConditional && conditionMet && status === "missing") {
      message = message
        ? `Conditional requirement: ${message}`
        : "Conditional requirement not satisfied";
    }

    ruleResults.set(rule.id, { value, status });
    items.push({
      ruleId: rule.id,
      label: rule.label,
      page: rule.page,
      section: rule.section,
      status,
      severity: rule.severity,
      message,
      isConditional,
    });
  }

  const completed = items.filter((i) => i.status === "completed").length;
  const warnings = items.filter((i) => i.status === "warning").length;
  const missing = items.filter((i) => i.status === "missing").length;
  const status = determineStatus(items, hasFillableFields);

  return {
    formName: FORM_NAME,
    fileName,
    completionScore: hasFillableFields ? calculateScore(items) : 0,
    status,
    statusLabel: STATUS_LABELS[status],
    hasFillableFields,
    summary: {
      completed,
      warnings,
      missing,
      total: items.length,
    },
    items,
    groupedItems: groupItems(items),
  };
}
