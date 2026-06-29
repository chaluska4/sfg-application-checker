import type { ConfidenceLevel, DetectedSignature, PageAnalysis } from "./types";

const ESIGN_PATTERNS = [
  /e\s*signed/i,
  /electronically signed/i,
  /signed by[:\s]+([A-Za-z][A-Za-z\s.'-]{2,40})/i,
  /docusign/i,
  /adobe sign/i,
];

const SIGNATURE_LABELS = [
  { label: "owner_signature", patterns: [/owner.{0,30}signature/i, /applicant.{0,30}signature/i] },
  { label: "agent_signature", patterns: [/agent.{0,30}signature/i, /producer.{0,30}signature/i] },
  { label: "product_disclosure_signature", patterns: [/product disclosure.{0,40}signature/i, /pds.{0,20}signature/i] },
  { label: "acknowledgment_signature", patterns: [/acknowledg.{0,30}signature/i] },
];

export function detectSignatures(pages: PageAnalysis[]): DetectedSignature[] {
  const results: DetectedSignature[] = [];

  for (const page of pages) {
    if (!page.hasEmbeddedText) {
      for (const { label } of SIGNATURE_LABELS) {
        if (
          page.classification === "application_page_3_signatures" ||
          page.classification === "acknowledgments_signatures"
        ) {
          results.push({
            label,
            page: page.pageNumber,
            signed: false,
            confidence: "low",
          });
        }
      }
      continue;
    }

    const text = page.rawText;
    const hasEsign = ESIGN_PATTERNS.some((p) => p.test(text));

    for (const { label, patterns } of SIGNATURE_LABELS) {
      const labelNear = patterns.some((p) => p.test(text));
      if (!labelNear && !hasEsign) continue;

      let signerPreview: string | undefined;
      for (const pattern of ESIGN_PATTERNS) {
        const match = text.match(pattern);
        if (match?.[1]) {
          signerPreview = maskName(match[1].trim());
          break;
        }
      }

      const signed = hasEsign || /signed\s+on|signature\s+date/i.test(text);
      results.push({
        label,
        page: page.pageNumber,
        signed,
        signerPreview,
        confidence: signed ? (signerPreview ? "high" : "medium") : "low",
      });
    }
  }

  return dedupeSignatures(results);
}

function maskName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "***";
  if (parts.length === 1) return `${parts[0][0]}***`;
  return `${parts[0][0]}*** ${parts[parts.length - 1][0]}***`;
}

function dedupeSignatures(items: DetectedSignature[]): DetectedSignature[] {
  const map = new Map<string, DetectedSignature>();
  for (const item of items) {
    const key = item.label;
    const existing = map.get(key);
    if (!existing || (item.signed && !existing.signed)) map.set(key, item);
  }
  return [...map.values()];
}

export function isSignaturePresent(
  signatures: DetectedSignature[],
  label: string
): { signed: boolean; confidence: ConfidenceLevel } {
  const hit = signatures.find((s) => s.label === label);
  if (!hit) return { signed: false, confidence: "low" };
  return { signed: hit.signed, confidence: hit.confidence };
}
