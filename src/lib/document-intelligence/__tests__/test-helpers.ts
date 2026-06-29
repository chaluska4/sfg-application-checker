import type { PageAnalysis } from "../types";
import { classifyPage } from "../classify-pages";
import { detectCheckboxes } from "../detect-checkboxes";
import { detectSignatures } from "../detect-signatures";
import { detectDates } from "../detect-dates";
import { extractKnownValues, detectPacketFlags } from "../extract-known-values";
import { runValidationOnPacket } from "../validation-engine";
import { equitrustMarketEarlyNjRules } from "../templates/equitrust-marketearly-nj";

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
    extractionMode: fullText.trim().length < 20 ? ("image_only" as const) : ("embedded_text" as const),
    hasEmbeddedText: fullText.trim().length >= 20,
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
