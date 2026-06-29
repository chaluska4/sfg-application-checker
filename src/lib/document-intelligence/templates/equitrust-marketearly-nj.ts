import type { ValidationRule } from "../types";

export const FORM_NAME = "EquiTrust MarketEarly Income Index NJ Application Packet";

export const equitrustMarketEarlyNjRules: ValidationRule[] = [
  // Owner / Annuitant
  { id: "owner-info", section: "Owner Information", label: "Owner Information", severity: "required", kind: "label_value", labelPatterns: [/owner/i, /first name/i], pageTypes: ["application_page_1"] },
  { id: "annuitant-info", section: "Annuitant Information", label: "Annuitant Information", severity: "required", kind: "label_value", labelPatterns: [/annuitant/i], pageTypes: ["application_page_1"] },
  { id: "owner-ssn", section: "Owner Information", label: "Owner SSN (presence only)", severity: "required", kind: "label_value", labelPatterns: [/social security|ssn/i] },
  { id: "product-name", section: "Product Selection", label: "Product Name", severity: "required", kind: "label_value", labelPatterns: [/marketearly|certainty select|product name/i] },
  { id: "agent-info", section: "Agent Information", label: "Agent / Producer Information", severity: "required", kind: "label_value", labelPatterns: [/agent|producer/i] },
  { id: "tax-qualification", section: "Tax Qualification", label: "Tax Qualification", severity: "required", kind: "label_value", labelPatterns: [/tax.?qualif/i, /ira|non-qualified/i], pageTypes: ["application_page_2"] },
  { id: "premium-payment", section: "Premium Payment", label: "Premium Payment Details", severity: "required", kind: "label_value", labelPatterns: [/premium/i, /payment/i] },
  { id: "existing-coverage", section: "Replacement Questions", label: "Existing Coverage / Replacement Questions", severity: "required", kind: "label_value", labelPatterns: [/existing coverage|replacement/i] },
  { id: "beneficiary", section: "Beneficiary Designation", label: "Beneficiary Designation", severity: "required", kind: "label_value", labelPatterns: [/beneficiary/i], pageTypes: ["application_page_2"] },

  // Signatures
  { id: "owner-signature", section: "Signatures", label: "Owner Signature", severity: "required", kind: "signature", signatureLabel: "owner_signature", pageTypes: ["application_page_3_signatures"] },
  { id: "owner-signature-date", section: "Signatures", label: "Owner Signature Date", severity: "required", kind: "date_near_label", labelPatterns: [/owner.{0,20}date/i] },
  { id: "agent-signature", section: "Signatures", label: "Agent Signature", severity: "required", kind: "signature", signatureLabel: "agent_signature" },
  { id: "agent-signature-date", section: "Signatures", label: "Agent Signature Date", severity: "required", kind: "date_near_label", labelPatterns: [/agent.{0,20}date/i] },
  { id: "pds-signature", section: "Product Disclosure", label: "Product Disclosure Signature", severity: "required", kind: "signature", signatureLabel: "product_disclosure_signature", pageTypes: ["product_disclosure"] },
  { id: "pds-signature-date", section: "Product Disclosure", label: "Product Disclosure Signature Date", severity: "required", kind: "date_near_label", labelPatterns: [/disclosure.{0,20}date/i] },

  // Allocation
  { id: "allocation-page", section: "Initial Premium Allocation", label: "Initial Premium Allocation Form", severity: "required", kind: "page_type", pageTypes: ["initial_premium_allocation"] },
  { id: "allocation-100", section: "Initial Premium Allocation", label: "Allocation Total Equals 100%", severity: "required", kind: "allocation_100" },

  // FNA
  { id: "fna-page-1", section: "Financial Needs Analysis", label: "Financial Needs Analysis (Page 1)", severity: "required", kind: "page_type", pageTypes: ["fna_page_1"] },
  { id: "fna-risk", section: "Financial Needs Analysis", label: "Risk Tolerance", severity: "required", kind: "label_value", labelPatterns: [/risk tolerance/i] },
  { id: "fna-source", section: "Financial Needs Analysis", label: "Source of Funds", severity: "required", kind: "label_value", labelPatterns: [/source of funds/i] },
  { id: "fna-distribution", section: "Financial Needs Analysis", label: "Distribution Objectives", severity: "required", kind: "label_value", labelPatterns: [/distribution objectives/i] },
  { id: "fna-source-other-explain", section: "Financial Needs Analysis", label: "Source of Funds — Other Explanation", severity: "required", kind: "label_value", labelPatterns: [/other.{0,30}explain/i, /specify/i], condition: { dependsOn: "source_of_funds_other", whenTruthy: true } },

  // Agent disclosure & acknowledgments
  { id: "agent-disclosure", section: "Agent/Producer Disclosure", label: "Insurance Agent/Producer Disclosure", severity: "required", kind: "page_type", pageTypes: ["agent_producer_disclosure"] },
  { id: "acknowledgments", section: "Acknowledgments", label: "Acknowledgments and Signatures", severity: "required", kind: "page_type", pageTypes: ["acknowledgments_signatures"] },

  // Conditional — replacement
  { id: "replacement-notice", section: "Replacement", label: "Replacement Notice", severity: "required", kind: "page_type", pageTypes: ["replacement_notice"], condition: { dependsOn: "replacement", whenTruthy: true } },
  { id: "disclosure-comparison", section: "Replacement", label: "Disclosure & Comparison of Products", severity: "required", kind: "page_type", pageTypes: ["disclosure_comparison"], condition: { dependsOn: "replacement", whenTruthy: true } },

  // Conditional — transfer
  { id: "transfer-form", section: "Transfer / 1035", label: "Transfer / 1035 Exchange Form", severity: "required", kind: "page_type", pageTypes: ["transfer_1035_form"], condition: { dependsOn: "transfer_1035", whenTruthy: true } },
];
