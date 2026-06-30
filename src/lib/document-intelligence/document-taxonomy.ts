import type { PageClassification } from "./types";

/** Hierarchical document identity (carrier-agnostic). */
export type DocumentTypeId =
  | "packet_cover"
  | "individual_application"
  | "transfer_1035"
  | "financial_needs_analysis"
  | "product_disclosure"
  | "replacement_notice"
  | "disclosure_comparison"
  | "agent_disclosure"
  | "initial_premium_allocation"
  | "electronic_delivery"
  | "hold_issue"
  | "commission_election"
  | "administrative"
  | "unknown";

export type PageSubtypeId =
  | "cover_sheet"
  | "owner_info"
  | "beneficiary"
  | "premium"
  | "signatures"
  | "transfer_page_1"
  | "transfer_page_2"
  | "personal_info"
  | "suitability"
  | "objectives"
  | "disclosure_body"
  | "allocation_table"
  | "fax_confirmation"
  | "privacy_notice"
  | "transmission_report"
  | "carrier_confirmation"
  | "generic"
  | "unknown";

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeId, string> = {
  packet_cover: "Packet Cover Sheet",
  individual_application: "Individual Annuity Application",
  transfer_1035: "Transfer / 1035 Exchange",
  financial_needs_analysis: "Financial Needs Analysis",
  product_disclosure: "Product Disclosure",
  replacement_notice: "Replacement Notice",
  disclosure_comparison: "Disclosure & Comparison",
  agent_disclosure: "Agent/Producer Disclosure",
  initial_premium_allocation: "Initial Premium Allocation",
  electronic_delivery: "Electronic Delivery",
  hold_issue: "Authorization to Hold Issue",
  commission_election: "Commission Election",
  administrative: "Administrative",
  unknown: "Unclassified",
};

export const PAGE_SUBTYPE_LABELS: Record<PageSubtypeId, string> = {
  cover_sheet: "Cover Sheet",
  owner_info: "Owner Information",
  beneficiary: "Beneficiary",
  premium: "Premium Payment",
  signatures: "Signatures",
  transfer_page_1: "Transfer Page 1",
  transfer_page_2: "Transfer Page 2",
  personal_info: "Personal Information",
  suitability: "Suitability",
  objectives: "Objectives",
  disclosure_body: "Disclosure Body",
  allocation_table: "Allocation Table",
  fax_confirmation: "Fax Confirmation",
  privacy_notice: "Privacy Notice",
  transmission_report: "Transmission Report",
  carrier_confirmation: "Carrier Confirmation",
  generic: "General",
  unknown: "Unknown Section",
};

/** Maps hierarchical type → legacy checklist document type (UI compatibility). */
export function toLegacyPageClassification(
  documentType: DocumentTypeId,
  pageSubtype: PageSubtypeId
): PageClassification {
  switch (documentType) {
    case "packet_cover":
      return "sfg_cover_sheet";
    case "individual_application":
      if (pageSubtype === "beneficiary" || pageSubtype === "premium") return "application_page_2";
      if (pageSubtype === "signatures") return "application_page_3_signatures";
      return "application_page_1";
    case "transfer_1035":
      return "transfer_1035_form";
    case "financial_needs_analysis":
      if (pageSubtype === "objectives") return "fna_page_2";
      if (pageSubtype === "suitability") return "fna_page_1";
      return "fna_page_3";
    case "product_disclosure":
      return "product_disclosure";
    case "replacement_notice":
      return "replacement_notice";
    case "disclosure_comparison":
      return "disclosure_comparison";
    case "agent_disclosure":
      return "agent_producer_disclosure";
    case "initial_premium_allocation":
      return "initial_premium_allocation";
    case "electronic_delivery":
    case "hold_issue":
    case "commission_election":
      return "acknowledgments_signatures";
    case "administrative":
      return "unknown";
    default:
      return "unknown";
  }
}

export function isAdministrativeDocument(documentType: DocumentTypeId): boolean {
  return documentType === "administrative";
}
