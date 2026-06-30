import { MessageChannel } from "node:worker_threads";
import { describe, expect, it, vi } from "vitest";
import {
  clonePdfArrayBuffer,
  describePdfBuffer,
  isPdfArrayBufferDetached,
} from "../pdf-buffer";

function detachArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const { port1, port2 } = new MessageChannel();
  port1.postMessage(buffer, [buffer]);
  port2.on("message", () => {});
  return buffer;
}

describe("clonePdfArrayBuffer", () => {
  it("creates an independent ArrayBuffer copy from ArrayBuffer input", () => {
    const source = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const copy = clonePdfArrayBuffer(source);
    expect(copy).not.toBe(source);
    expect(new Uint8Array(copy)).toEqual(new Uint8Array(source));
  });

  it("creates an independent copy from Uint8Array and Buffer inputs", () => {
    const uint8 = new Uint8Array([1, 2, 3]);
    const fromUint8 = clonePdfArrayBuffer(uint8);
    expect(new Uint8Array(fromUint8)).toEqual(uint8);

    const nodeBuffer = Buffer.from([4, 5, 6]);
    const fromBuffer = clonePdfArrayBuffer(nodeBuffer);
    expect(new Uint8Array(fromBuffer)).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("produces a readable buffer after the source ArrayBuffer is detached", () => {
    const source = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const safeCopy = clonePdfArrayBuffer(source);
    detachArrayBuffer(source);

    expect(isPdfArrayBufferDetached(source)).toBe(true);
    expect(isPdfArrayBufferDetached(safeCopy)).toBe(false);
    expect(() => Buffer.from(safeCopy)).not.toThrow();
    expect(Buffer.from(safeCopy).toString("base64")).toBeTruthy();
  });
});

describe("describePdfBuffer", () => {
  it("reports buffer metadata without content", () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const diagnostics = describePdfBuffer(buffer);
    expect(diagnostics.byteLength).toBe(3);
    expect(diagnostics.kind).toBe("ArrayBuffer");
    expect(diagnostics.constructorName).toBe("ArrayBuffer");
    expect(diagnostics.detached).toBe(false);
  });
});

describe("detached buffer regression for Azure OCR", () => {
  it("allows base64 encoding after blob-style pooled buffer is detached by unpdf consumer", async () => {
    const pooled = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const downloaded = pooled.buffer.slice(pooled.byteOffset, pooled.byteOffset + pooled.byteLength);

    const parseBuffer = clonePdfArrayBuffer(downloaded);
    detachArrayBuffer(downloaded);

    expect(isPdfArrayBufferDetached(downloaded)).toBe(true);

    const ocrBuffer = clonePdfArrayBuffer(parseBuffer);
    const { createAzureDocumentIntelligenceProvider } = await import(
      "../document-intelligence/ocr/azure-document-intelligence-provider"
    );

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes(":analyze")) {
        const body = JSON.parse(String(init?.body)) as { base64Source: string };
        expect(body.base64Source.length).toBeGreaterThan(0);
        return new Response(null, {
          status: 202,
          headers: { "operation-location": "https://example.test/operations/1" },
        });
      }

      return new Response(
        JSON.stringify({
          status: "succeeded",
          analyzeResult: { pages: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const provider = createAzureDocumentIntelligenceProvider({
      endpoint: "https://example.cognitiveservices.azure.com",
      apiKey: "test-key",
      fetchFn: fetchMock as typeof fetch,
    });

    await expect(
      provider.recognize({
        fileName: "scan.pdf",
        pages: [{ pageNumber: 1 }],
        pdfBuffer: ocrBuffer,
      })
    ).resolves.toEqual({ provider: "azure", pages: [] });
  });
});
