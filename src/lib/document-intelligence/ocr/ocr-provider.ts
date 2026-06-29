import type { OcrRecognizeRequest, OcrResult } from "./types";

export interface OcrProvider {
  readonly name: string;
  isAvailable(): boolean;
  recognize(request: OcrRecognizeRequest): Promise<OcrResult>;
}

/** Default production path — OCR disabled until a provider is configured. */
export const disabledOcrProvider: OcrProvider = {
  name: "disabled",
  isAvailable() {
    return false;
  },
  async recognize() {
    return { provider: "disabled", pages: [] };
  },
};
