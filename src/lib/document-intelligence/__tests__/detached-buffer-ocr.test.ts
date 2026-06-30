import { MessageChannel } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { clonePdfArrayBuffer, isPdfArrayBufferDetached } from "@/lib/pdf-buffer";
import { enrichPagesWithOcr } from "../ocr/enrich-pages-with-ocr";
import type { OcrProvider } from "../ocr/ocr-provider";
import type { OcrRecognizeRequest, OcrResult } from "../ocr/types";
import type { PageAnalysis } from "../types";

function detachArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const { port1, port2 } = new MessageChannel();
  port1.postMessage(buffer, [buffer]);
  port2.on("message", () => {});
  return buffer;
}

function emptyScannedPage(pageNumber: number): PageAnalysis {
  return {
    pageNumber,
    rawText: "",
    normalizedText: "",
    charCount: 0,
    hasEmbeddedText: false,
    textSource: "none",
    classification: "unknown",
    classificationConfidence: "low",
  };
}

function createCaptureProvider(
  onRecognize: (request: OcrRecognizeRequest) => Promise<OcrResult>
): OcrProvider {
  return {
    name: "azure",
    isAvailable: () => true,
    recognize: onRecognize,
  };
}

describe("detached buffer OCR regression", () => {
  it("simulates blob download buffer detached before OCR and still succeeds", async () => {
    const pooled = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const downloaded = pooled.buffer.slice(pooled.byteOffset, pooled.byteOffset + pooled.byteLength);

    const parseBuffer = clonePdfArrayBuffer(downloaded);
    detachArrayBuffer(downloaded);

    expect(isPdfArrayBufferDetached(downloaded)).toBe(true);

    let received: ArrayBuffer | undefined;
    const provider = createCaptureProvider(async (request) => {
      received = request.pdfBuffer;
      expect(() => Buffer.from(request.pdfBuffer!)).not.toThrow();
      return {
        provider: "azure",
        pages: [
          {
            pageNumber: 1,
            fullText: "Individual Annuity Application Owner Information",
            lines: [{ text: "Individual Annuity Application Owner Information", confidence: "high" }],
            confidence: "high",
          },
        ],
      };
    });

    const result = await enrichPagesWithOcr(
      [emptyScannedPage(1)],
      "scan.pdf",
      provider,
      parseBuffer
    );

    expect(received).toBeDefined();
    expect(isPdfArrayBufferDetached(received!)).toBe(false);
    expect(result.pages[0]?.hasOcrText).toBe(true);
    expect(result.pages[0]?.rawText).toContain("Individual Annuity Application");
    expect(result.diagnostics.error).toBeUndefined();
  });

  it("clones pdfBuffer before calling provider.recognize", async () => {
    const source = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const safeBeforeProvider = clonePdfArrayBuffer(source);
    detachArrayBuffer(source);

    let received: ArrayBuffer | undefined;
    const provider = createCaptureProvider(async (request) => {
      received = request.pdfBuffer;
      return { provider: "azure", pages: [] };
    });

    await enrichPagesWithOcr([emptyScannedPage(1)], "scan.pdf", provider, safeBeforeProvider);

    expect(received).toBeDefined();
    expect(isPdfArrayBufferDetached(received!)).toBe(false);
  });
});
