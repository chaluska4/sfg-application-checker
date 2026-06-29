import type {
  DocumentPacket,
  LocationConfidence,
  PageAnalysis,
  PageClassification,
  ReviewItemLocation,
  ValidationRule,
} from "./types";
import { getLocationForRule } from "./templates/equitrust-template-metadata";

export const PACKET_LEVEL_LABEL = "Packet-level review";

export function formatPageLabel(page: number | null): string {
  return page === null ? PACKET_LEVEL_LABEL : `Page ${page}`;
}

export interface PageResolution {
  page: number | null;
  pageLabel: string;
  documentType: PageClassification;
}

export interface PageEvidence {
  valuePage?: number;
  signaturePage?: number;
  checkboxPage?: number;
  datePage?: number;
}

export interface FindingLocation {
  actualPage: number | null;
  actualPageLabel: string | null;
  expectedDocument: string | null;
  typicalLocation: string | null;
  typicalPageRange: string | null;
  locationConfidence: LocationConfidence;
  manualReviewHint: string | null;
  expectedPageLabel: string | null;
  page: number | null;
  pageLabel: string;
  documentType: PageClassification;
}

export function formatExpectedPageLabel(location: ReviewItemLocation): string {
  if (location.pageConfidence === "approximate") {
    return `Typical Page Range ${location.typicalPageRange}`;
  }
  return `Expected Page ${location.typicalPageRange}`;
}

function resolveActualPageNumber(
  rule: ValidationRule,
  packet: DocumentPacket,
  evidence: PageEvidence
): number | null {
  if (rule.page) return rule.page;

  const evidencePage =
    evidence.valuePage ??
    evidence.signaturePage ??
    evidence.checkboxPage ??
    evidence.datePage;

  if (evidencePage) return evidencePage;

  const labelPage = findPageMatchingLabelPatterns(rule, packet);
  if (labelPage) return labelPage;

  if (rule.kind === "page_type" || rule.pageTypes?.length) {
    const byType = findPageByClassification(rule, packet);
    if (byType.page !== null) return byType.page;
  }

  if (rule.kind === "allocation_100") {
    return findPageForAllocation(packet.pages);
  }

  return null;
}

function isActualPageConfident(packet: DocumentPacket, pageNumber: number): boolean {
  const pageMeta = packet.pages.find((p) => p.pageNumber === pageNumber);
  return Boolean(pageMeta?.hasEmbeddedText);
}

export function resolveFindingLocation(
  rule: ValidationRule,
  packet: DocumentPacket,
  evidence: PageEvidence = {}
): FindingLocation {
  const templateLocation = getLocationForRule(rule.id);
  const documentType =
    rule.pageTypes?.[0] ??
    (templateLocation ? inferDocumentType(templateLocation) : "unknown");

  const candidatePage = resolveActualPageNumber(rule, packet, evidence);
  if (candidatePage !== null && isActualPageConfident(packet, candidatePage)) {
    const actualPageLabel = `Page ${candidatePage}`;
    return {
      actualPage: candidatePage,
      actualPageLabel,
      expectedDocument: templateLocation?.expectedDocument ?? null,
      typicalLocation: templateLocation?.typicalLocation ?? null,
      typicalPageRange: templateLocation?.typicalPageRange ?? null,
      locationConfidence: "actual",
      manualReviewHint: templateLocation?.manualReviewHint ?? null,
      expectedPageLabel: null,
      page: candidatePage,
      pageLabel: `Actual Page: ${actualPageLabel}`,
      documentType,
    };
  }

  if (templateLocation) {
    const expectedPageLabel = formatExpectedPageLabel(templateLocation);
    return {
      actualPage: null,
      actualPageLabel: null,
      expectedDocument: templateLocation.expectedDocument,
      typicalLocation: templateLocation.typicalLocation,
      typicalPageRange: templateLocation.typicalPageRange,
      locationConfidence: "template",
      manualReviewHint: templateLocation.manualReviewHint,
      expectedPageLabel,
      page: null,
      pageLabel: `Expected Location: ${templateLocation.expectedDocument}, ${expectedPageLabel}`,
      documentType,
    };
  }

  return {
    actualPage: null,
    actualPageLabel: null,
    expectedDocument: null,
    typicalLocation: null,
    typicalPageRange: null,
    locationConfidence: "packet",
    manualReviewHint: null,
    expectedPageLabel: null,
    page: null,
    pageLabel: PACKET_LEVEL_LABEL,
    documentType,
  };
}

function inferDocumentType(location: ReviewItemLocation): PageClassification {
  const doc = location.expectedDocument.toLowerCase();
  if (doc.includes("transfer/1035")) return "transfer_1035_form";
  if (doc.includes("replacement")) return "replacement_notice";
  if (doc.includes("comparison")) return "disclosure_comparison";
  if (doc.includes("financial needs")) return "fna_page_1";
  if (doc.includes("agent/producer disclosure")) return "agent_producer_disclosure";
  if (doc.includes("disclosure statement")) return "product_disclosure";
  return "application_page_1";
}

export function findPageMatchingLabelPatterns(
  rule: ValidationRule,
  packet: DocumentPacket
): number | null {
  if (!rule.labelPatterns?.length) return null;

  for (const page of packet.pages) {
    if (!page.rawText) continue;
    if (rule.labelPatterns.some((pattern) => pattern.test(page.rawText))) {
      return page.pageNumber;
    }
  }
  return null;
}

export function findPageByClassification(
  rule: ValidationRule,
  packet: DocumentPacket
): { page: number | null; documentType: PageClassification } {
  if (!rule.pageTypes?.length) {
    return { page: null, documentType: "unknown" };
  }

  for (const pageType of rule.pageTypes) {
    const match = packet.pages.find((p) => p.classification === pageType);
    if (match) {
      return { page: match.pageNumber, documentType: pageType };
    }
  }

  return { page: null, documentType: rule.pageTypes[0] };
}

export function findPageForAllocation(pages: PageAnalysis[]): number | null {
  const allocationPage = pages.find(
    (p) => p.classification === "initial_premium_allocation"
  );
  if (allocationPage) return allocationPage.pageNumber;

  for (const page of pages) {
    if (/allocation|premium allocation/i.test(page.rawText)) {
      return page.pageNumber;
    }
  }
  return null;
}

/** @deprecated Use resolveFindingLocation */
export function resolveFindingPage(
  rule: ValidationRule,
  packet: DocumentPacket,
  evidence: PageEvidence = {}
): PageResolution {
  const location = resolveFindingLocation(rule, packet, evidence);
  return {
    page: location.page,
    pageLabel: location.pageLabel,
    documentType: location.documentType,
  };
}

export function getLocationSortKey(item: {
  page: number | null;
  typicalPageRange?: string | null;
  locationConfidence?: LocationConfidence;
}): number {
  if (item.locationConfidence === "actual" && item.page !== null) return item.page;
  if (item.typicalPageRange) {
    const match = item.typicalPageRange.match(/(\d+)/);
    if (match) return 1000 + parseInt(match[1], 10);
  }
  return Number.MAX_SAFE_INTEGER;
}

export function comparePageGroups(
  a: { page: number | null; section: string; typicalPageRange?: string | null; locationConfidence?: LocationConfidence },
  b: { page: number | null; section: string; typicalPageRange?: string | null; locationConfidence?: LocationConfidence }
): number {
  const sortDiff = getLocationSortKey(a) - getLocationSortKey(b);
  return sortDiff || a.section.localeCompare(b.section);
}
