import type { OcrBoundingBox } from "./ocr/types";

export type ConfidenceLevel = "high" | "medium" | "low";

export type IssueSeverity = "required" | "recommended";

export type FieldStatus =
  | "present"
  | "missing"
  | "needs_manual_verification"
  | "conditional_review"
  | "not_applicable";

export type ReviewStatus =
  | "ready-to-submit"
  | "needs-review"
  | "missing-required"
  | "manual-review";

export type PageClassification =
  | "sfg_cover_sheet"
  | "application_page_1"
  | "application_page_2"
  | "application_page_3_signatures"
  | "product_disclosure"
  | "initial_premium_allocation"
  | "fna_page_1"
  | "fna_page_2"
  | "fna_page_3"
  | "agent_producer_disclosure"
  | "acknowledgments_signatures"
  | "transfer_1035_form"
  | "replacement_notice"
  | "disclosure_comparison"
  | "unknown";

export type ExtractionMode = "embedded_text" | "image_only" | "mixed";

export type PageTextSource = "embedded" | "ocr" | "none";

export type { OcrBoundingBox };

export interface PageAnalysis {
  pageNumber: number;
  rawText: string;
  normalizedText: string;
  charCount: number;
  hasEmbeddedText: boolean;
  /** True when OCR supplied usable text for this page (embedded text may still be absent). */
  hasOcrText?: boolean;
  textSource?: PageTextSource;
  ocrConfidence?: ConfidenceLevel;
  /** Retained for evidence resolution; not exposed on API responses. */
  ocrLines?: { text: string; confidence: ConfidenceLevel; boundingBox?: OcrBoundingBox }[];
  classification: PageClassification;
  classificationConfidence: ConfidenceLevel;
}

export interface DetectedCheckbox {
  label: string;
  checked: boolean;
  page: number | null;
  confidence: ConfidenceLevel;
}

export interface DetectedSignature {
  label: string;
  page: number | null;
  signed: boolean;
  signerPreview?: string;
  confidence: ConfidenceLevel;
}

export interface DetectedDate {
  label: string;
  page: number | null;
  present: boolean;
  confidence: ConfidenceLevel;
}

export interface SafeExtractedValue {
  key: string;
  label: string;
  present: boolean;
  maskedPreview?: string;
  page: number | null;
  confidence: ConfidenceLevel;
}

export interface DocumentPacket {
  fileName: string;
  pageCount: number;
  extractionMode: ExtractionMode;
  hasEmbeddedText: boolean;
  /** True when any page received OCR text (production default: false). */
  hasOcrText?: boolean;
  pages: PageAnalysis[];
  fullText: string;
  checkboxes: DetectedCheckbox[];
  signatures: DetectedSignature[];
  dates: DetectedDate[];
  values: SafeExtractedValue[];
  flags: {
    replacementSelected: boolean;
    transferSelected: boolean;
    sourceOfFundsOther: boolean;
    allocationTotal?: number;
  };
}

export interface RuleCondition {
  dependsOn: string;
  whenTruthy?: boolean;
  whenValues?: string[];
}

export type DetectionKind =
  | "label_value"
  | "page_type"
  | "signature"
  | "checkbox_yes"
  | "date_near_label"
  | "allocation_100"
  | "boolean_flag";

export interface ValidationRule {
  id: string;
  section: string;
  label: string;
  severity: IssueSeverity;
  page?: number;
  pageTypes?: PageClassification[];
  kind: DetectionKind;
  labelPatterns?: RegExp[];
  valuePatterns?: RegExp[];
  signatureLabel?: string;
  checkboxLabel?: string;
  flagKey?: keyof DocumentPacket["flags"];
  condition?: RuleCondition;
  /** Key into template reviewItemLocations for manual-review guidance */
  locationKey?: string;
}

export type TemplatePageConfidence = "fixed" | "approximate" | "unknown";
export type LocationConfidence = "actual" | "template" | "packet";

export interface ReviewItemLocation {
  label: string;
  expectedDocument: string;
  typicalLocation: string;
  typicalPageRange: string;
  pageConfidence: TemplatePageConfidence;
  manualReviewHint: string;
}

export interface ValidationResultItem {
  ruleId: string;
  label: string;
  section: string;
  documentType: PageClassification;
  status: FieldStatus;
  severity: IssueSeverity;
  message?: string;
  confidence: ConfidenceLevel;
  isConditional: boolean;
  actualPage: number | null;
  actualPageLabel: string | null;
  expectedDocument: string | null;
  typicalLocation: string | null;
  typicalPageRange: string | null;
  locationConfidence: LocationConfidence;
  manualReviewHint: string | null;
  /** Display label for expected page guidance (Expected Page X / Typical Page Range X-Y) */
  expectedPageLabel: string | null;
  /** @deprecated Use actualPage — kept for grouping sort */
  page: number | null;
  /** Primary location line for grouping and headers */
  pageLabel: string;
  /** Populated when OCR/evidence supplies geometry for the finding */
  boundingBox?: OcrBoundingBox | null;
}

export interface ValidationResult {
  formName: string;
  fileName: string;
  completionScore: number;
  status: ReviewStatus;
  statusLabel: string;
  extractionMode: ExtractionMode;
  hasEmbeddedText: boolean;
  pageCount: number;
  disclaimer: string;
  summary: {
    present: number;
    missing: number;
    needsManualVerification: number;
    conditionalReview: number;
    notApplicable: number;
    total: number;
  };
  items: ValidationResultItem[];
}

export interface GroupedChecklist {
  page: number | null;
  pageLabel: string;
  section: string;
  documentType: PageClassification;
  locationConfidence: LocationConfidence;
  expectedDocument: string | null;
  typicalLocation: string | null;
  expectedPageLabel: string | null;
  items: ValidationResultItem[];
}

// UI-compatible aliases
export type ChecklistItem = ValidationResultItem;
export type ChecklistItemStatus = FieldStatus;
export type ReviewResult = ValidationResult & { groupedItems: GroupedChecklist[] };
