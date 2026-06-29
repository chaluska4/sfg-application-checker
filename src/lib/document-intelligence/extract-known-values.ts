import type { DocumentPacket, PageAnalysis, SafeExtractedValue } from "./types";
import { hasDateNearLabels } from "./detect-dates";
import { pageTextConfidence } from "./confidence";
import { findPageForAllocation } from "./resolve-finding-page";

const SSN_PATTERN = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/;
const CURRENCY_PATTERN = /\$[\d,]+(?:\.\d{2})?/g;
const PERCENT_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*%/g;

const FIELD_SPECS: {
  key: string;
  label: string;
  labelPatterns: RegExp[];
  valuePattern?: RegExp;
  mask?: (raw: string) => string;
}[] = [
  { key: "owner_name", label: "Owner Name", labelPatterns: [/owner.{0,10}name/i, /first name/i] },
  { key: "annuitant_name", label: "Annuitant Name", labelPatterns: [/annuitant.{0,10}name/i] },
  { key: "owner_ssn", label: "Owner SSN", labelPatterns: [/social security|owner ssn/i], valuePattern: SSN_PATTERN, mask: maskSsn },
  { key: "product_name", label: "Product Name", labelPatterns: [/product name/i, /marketearly/i, /certainty select/i] },
  { key: "agent_name", label: "Agent Name", labelPatterns: [/agent.{0,10}name/i, /producer.{0,10}name/i] },
  { key: "premium_amount", label: "Premium Amount", labelPatterns: [/premium/i, /initial premium/i], valuePattern: /\$[\d,]+/ },
  { key: "beneficiary", label: "Beneficiary Designation", labelPatterns: [/beneficiary/i, /primary beneficiary/i] },
  { key: "risk_tolerance", label: "Risk Tolerance", labelPatterns: [/risk tolerance/i, /conservative|moderate|aggressive/i] },
  { key: "source_of_funds", label: "Source of Funds", labelPatterns: [/source of funds/i] },
  { key: "distribution_objectives", label: "Distribution Objectives", labelPatterns: [/distribution objectives/i] },
];

export function extractKnownValues(pages: PageAnalysis[], fullText: string): SafeExtractedValue[] {
  const values: SafeExtractedValue[] = [];

  for (const spec of FIELD_SPECS) {
    let best: SafeExtractedValue | null = null;

    for (const page of pages) {
      if (!page.hasEmbeddedText) continue;
      const text = page.rawText;
      const labelHit = spec.labelPatterns.some((p) => p.test(text));
      if (!labelHit && !spec.valuePattern?.test(text)) continue;

      let present = labelHit;
      let maskedPreview: string | undefined;
      let confidence = pageTextConfidence(page.charCount, true);

      if (spec.valuePattern) {
        const match = text.match(spec.valuePattern);
        if (match) {
          present = true;
          maskedPreview = spec.mask ? spec.mask(match[0]) : undefined;
          confidence = "high";
        }
      } else if (labelHit) {
        present = text.length > 80;
        confidence = "medium";
      }

      const entry: SafeExtractedValue = {
        key: spec.key,
        label: spec.label,
        present,
        maskedPreview,
        page: page.pageNumber,
        confidence,
      };

      if (!best || (entry.present && !best.present)) best = entry;
    }

    if (best) values.push(best);
    else if (pages.some((p) => p.hasEmbeddedText)) {
      values.push({
        key: spec.key,
        label: spec.label,
        present: false,
        page: null,
        confidence: "low",
      });
    }
  }

  const allocationTotal = computeAllocationTotal(fullText);
  values.push({
    key: "allocation_total",
    label: "Allocation Total",
    present: allocationTotal !== null,
    maskedPreview: allocationTotal !== null ? `${allocationTotal}%` : undefined,
    page: findPageForAllocation(pages),
    confidence: allocationTotal !== null ? (allocationTotal === 100 ? "high" : "medium") : "low",
  });

  return values;
}

export function computeAllocationTotal(fullText: string): number | null {
  const percents: number[] = [];
  let m: RegExpExecArray | null;
  PERCENT_PATTERN.lastIndex = 0;
  while ((m = PERCENT_PATTERN.exec(fullText)) !== null) {
    const n = parseFloat(m[1]);
    if (!isNaN(n) && n <= 100) percents.push(n);
  }
  if (percents.length < 2) return null;
  const sum = percents.reduce((a, b) => a + b, 0);
  return Math.round(sum * 100) / 100;
}

function maskSsn(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 9) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}

export function detectPacketFlags(
  pages: PageAnalysis[],
  fullText: string,
  checkboxes: { label: string; checked: boolean }[]
): DocumentPacket["flags"] {
  const text = fullText.toLowerCase();
  const replacementSelected =
    checkboxes.some((c) => c.label === "replacement" && c.checked) ||
    /\breplacement\b.*\byes\b/i.test(fullText) ||
    /replacing existing/i.test(fullText);

  const transferSelected =
    checkboxes.some((c) => c.label === "transfer_1035" && c.checked) ||
    /1035/.test(text) ||
    /transfer.{0,40}yes/i.test(fullText);

  const sourceOfFundsOther =
    checkboxes.some((c) => c.label === "source_of_funds_other" && c.checked) ||
    /source of funds.{0,60}other/i.test(fullText);

  return {
    replacementSelected,
    transferSelected,
    sourceOfFundsOther,
    allocationTotal: computeAllocationTotal(fullText) ?? undefined,
  };
}

export function hasCurrencyAmount(text: string): boolean {
  CURRENCY_PATTERN.lastIndex = 0;
  return CURRENCY_PATTERN.test(text);
}

export function hasSsnPresent(text: string): boolean {
  return SSN_PATTERN.test(text);
}

export { hasDateNearLabels };
