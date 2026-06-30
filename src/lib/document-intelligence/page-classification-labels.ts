import type { PageClassification } from "./types";

const PAGE_CLASSIFICATION_LABELS: Record<PageClassification, string> = {
  sfg_cover_sheet: "SFG Cover Sheet",
  application_page_1: "Individual Annuity Application",
  application_page_2: "Application — Beneficiary & Premium",
  application_page_3_signatures: "Application — Signatures",
  product_disclosure: "Disclosure Statement",
  initial_premium_allocation: "Initial Premium Allocation",
  fna_page_1: "Financial Needs Analysis",
  fna_page_2: "Financial Needs Analysis — Source of Funds",
  fna_page_3: "Financial Needs Analysis — Acknowledgment",
  agent_producer_disclosure: "Agent/Producer Disclosure",
  acknowledgments_signatures: "Acknowledgments & Signatures",
  transfer_1035_form: "Transfer/1035 Exchange Form",
  replacement_notice: "Replacement Notice",
  disclosure_comparison: "Disclosure & Comparison",
  unknown: "Unclassified Form Page",
};

export function getPageClassificationLabel(classification: PageClassification): string {
  return PAGE_CLASSIFICATION_LABELS[classification] ?? "Form Page";
}
