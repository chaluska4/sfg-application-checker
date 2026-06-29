import type { DocumentPacket, PageAnalysis, PageClassification, ValidationRule } from "./types";

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

export function findPageForSignature(
  rule: ValidationRule,
  packet: DocumentPacket
): number | null {
  const label = rule.signatureLabel;
  if (!label) return null;

  const sig = packet.signatures.find((s) => s.label === label);
  if (sig) return sig.page;

  const byType = findPageByClassification(rule, packet);
  return byType.page;
}

export function findPageForDate(rule: ValidationRule, packet: DocumentPacket): number | null {
  if (rule.labelPatterns?.length) {
    const labelPage = findPageMatchingLabelPatterns(rule, packet);
    if (labelPage) return labelPage;
  }

  const dateHit = packet.dates.find((d) => d.present);
  return dateHit?.page ?? null;
}

export function resolveFindingPage(
  rule: ValidationRule,
  packet: DocumentPacket,
  evidence: PageEvidence = {}
): PageResolution {
  if (rule.page) {
    return {
      page: rule.page,
      pageLabel: formatPageLabel(rule.page),
      documentType: rule.pageTypes?.[0] ?? packet.pages[rule.page - 1]?.classification ?? "unknown",
    };
  }

  const evidencePage =
    evidence.valuePage ??
    evidence.signaturePage ??
    evidence.checkboxPage ??
    evidence.datePage;

  if (evidencePage) {
    const pageMeta = packet.pages.find((p) => p.pageNumber === evidencePage);
    return {
      page: evidencePage,
      pageLabel: formatPageLabel(evidencePage),
      documentType:
        rule.pageTypes?.[0] ?? pageMeta?.classification ?? "unknown",
    };
  }

  const labelPage = findPageMatchingLabelPatterns(rule, packet);
  if (labelPage) {
    const pageMeta = packet.pages.find((p) => p.pageNumber === labelPage);
    return {
      page: labelPage,
      pageLabel: formatPageLabel(labelPage),
      documentType: rule.pageTypes?.[0] ?? pageMeta?.classification ?? "unknown",
    };
  }

  if (rule.kind === "page_type" || rule.pageTypes?.length) {
    const byType = findPageByClassification(rule, packet);
    if (byType.page !== null) {
      return {
        page: byType.page,
        pageLabel: formatPageLabel(byType.page),
        documentType: byType.documentType,
      };
    }
    return {
      page: null,
      pageLabel: PACKET_LEVEL_LABEL,
      documentType: byType.documentType,
    };
  }

  if (rule.kind === "allocation_100") {
    const allocationPage = findPageForAllocation(packet.pages);
    return {
      page: allocationPage,
      pageLabel: formatPageLabel(allocationPage),
      documentType: "initial_premium_allocation",
    };
  }

  return {
    page: null,
    pageLabel: PACKET_LEVEL_LABEL,
    documentType: rule.pageTypes?.[0] ?? "unknown",
  };
}

export function comparePageGroups(
  a: { page: number | null; section: string },
  b: { page: number | null; section: string }
): number {
  const aSort = a.page ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.page ?? Number.MAX_SAFE_INTEGER;
  return aSort - bSort || a.section.localeCompare(b.section);
}
