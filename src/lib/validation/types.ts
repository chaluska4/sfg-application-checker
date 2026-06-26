export type ValidationType =
  | "text"
  | "checkbox"
  | "signature"
  | "date"
  | "currency"
  | "phone"
  | "email"
  | "ssn"
  | "selection";

export type Severity = "required" | "warning";

export type ReviewStatus =
  | "ready-to-submit"
  | "needs-review"
  | "missing-required"
  | "manual-review";

export type ChecklistItemStatus = "completed" | "warning" | "missing";

export interface ValidationCondition {
  /** ID of the rule this condition depends on */
  dependsOnRuleId: string;
  /** When the dependent field has any of these values, this rule becomes active */
  whenValues: string[];
}

export interface ValidationRule {
  id: string;
  formName: string;
  page: number;
  section: string;
  label: string;
  required: boolean;
  validationType: ValidationType;
  severity: Severity;
  /** Substrings to match against PDF AcroForm field names (case-insensitive) */
  fieldPatterns: string[];
  condition?: ValidationCondition;
}

export interface ExtractedField {
  name: string;
  value: string;
  type: string;
}

export interface ChecklistItem {
  ruleId: string;
  label: string;
  page: number;
  section: string;
  status: ChecklistItemStatus;
  severity: Severity;
  message?: string;
  isConditional: boolean;
}

export interface GroupedChecklist {
  page: number;
  section: string;
  items: ChecklistItem[];
}

export interface ReviewResult {
  formName: string;
  fileName: string;
  completionScore: number;
  status: ReviewStatus;
  statusLabel: string;
  hasFillableFields: boolean;
  summary: {
    completed: number;
    warnings: number;
    missing: number;
    total: number;
  };
  items: ChecklistItem[];
  groupedItems: GroupedChecklist[];
}
