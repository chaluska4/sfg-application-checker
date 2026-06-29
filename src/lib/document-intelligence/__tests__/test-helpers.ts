import type { PageAnalysis } from "../types";
import { classifyPage } from "../classify-pages";
import { detectCheckboxes } from "../detect-checkboxes";
import { detectSignatures } from "../detect-signatures";
import { detectDates } from "../detect-dates";
import { extractKnownValues, detectPacketFlags } from "../extract-known-values";
import { runValidationOnPacket } from "../validation-engine";
import { equitrustMarketEarlyNjRules } from "../templates/equitrust-marketearly-nj";
import {
  createMockOcrProvider,
  deriveExtractionMode,
  enrichPagesWithOcr,
  packetHasOcrText,
  type MockOcrProviderOptions,
} from "../ocr";

function buildPacket(fullText: string, pages?: PageAnalysis[]) {
  const pageList =
    pages ??
    [fullText].map((text, i) => {
      const normalized = text.toLowerCase();
      const { classification, confidence } = classifyPage(normalized, i + 1);
      return {
        pageNumber: i + 1,
        rawText: text,
        normalizedText: normalized,
        charCount: text.length,
        hasEmbeddedText: text.trim().length >= 20,
        textSource: text.trim().length >= 20 ? ("embedded" as const) : ("none" as const),
        classification,
        classificationConfidence: confidence,
      } satisfies PageAnalysis;
    });

  const checkboxes = detectCheckboxes(pageList);
  const signatures = detectSignatures(pageList);
  const dates = detectDates(pageList);
  const values = extractKnownValues(pageList, fullText);
  const flags = detectPacketFlags(pageList, fullText, checkboxes);

  return {
    fileName: "test.pdf",
    pageCount: pageList.length,
    extractionMode: deriveExtractionMode(pageList),
    hasEmbeddedText: pageList.some((p) => p.hasEmbeddedText),
    hasOcrText: packetHasOcrText(pageList),
    pages: pageList,
    fullText,
    checkboxes,
    signatures,
    dates,
    values,
    flags,
  };
}

export function validatePacketLogic(fullText: string, pages?: PageAnalysis[]) {
  return runValidationOnPacket(buildPacket(fullText, pages), equitrustMarketEarlyNjRules);
}

export async function validatePacketWithMockOcr(
  scannedPages: PageAnalysis[],
  mockOcr: MockOcrProviderOptions
) {
  const provider = createMockOcrProvider(mockOcr);
  const enriched = await enrichPagesWithOcr(scannedPages, "test.pdf", provider);
  const fullText = enriched.map((p) => p.rawText).join("\n\n");
  return runValidationOnPacket(buildPacket(fullText, enriched), equitrustMarketEarlyNjRules);
}
