export type PdfBufferKind = "ArrayBuffer" | "Uint8Array" | "Buffer" | "unknown";

export interface PdfBufferDiagnostics {
  byteLength: number;
  kind: PdfBufferKind;
  constructorName: string;
  detached: boolean;
}

function detectPdfBufferKind(value: unknown): PdfBufferKind {
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return "ArrayBuffer";
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) return "Uint8Array";
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return "Buffer";
  return "unknown";
}

export function isPdfArrayBufferDetached(buffer: ArrayBuffer | ArrayBufferLike): boolean {
  if (buffer.byteLength === 0) {
    try {
      new Uint8Array(buffer);
      return false;
    } catch {
      return true;
    }
  }

  try {
    new Uint8Array(buffer);
    return false;
  } catch {
    return true;
  }
}

export function describePdfBuffer(value: unknown): PdfBufferDiagnostics {
  const kind = detectPdfBufferKind(value);
  const constructorName =
    value && typeof value === "object" && value.constructor?.name
      ? String(value.constructor.name)
      : typeof value;

  if (kind === "ArrayBuffer") {
    const buffer = value as ArrayBuffer;
    return {
      byteLength: buffer.byteLength,
      kind,
      constructorName,
      detached: isPdfArrayBufferDetached(buffer),
    };
  }

  if (kind === "Uint8Array") {
    const bytes = value as Uint8Array;
    return {
      byteLength: bytes.byteLength,
      kind,
      constructorName,
      detached: isPdfArrayBufferDetached(bytes.buffer),
    };
  }

  if (kind === "Buffer") {
    const buffer = value as Buffer;
    return {
      byteLength: buffer.byteLength,
      kind,
      constructorName,
      detached: isPdfArrayBufferDetached(buffer.buffer),
    };
  }

  return {
    byteLength: 0,
    kind,
    constructorName,
    detached: true,
  };
}

/**
 * Returns an independent ArrayBuffer copy safe to pass to unpdf, Azure OCR, or Buffer.from.
 */
export function clonePdfArrayBuffer(source: ArrayBuffer | Uint8Array | Buffer): ArrayBuffer {
  if (typeof Uint8Array !== "undefined" && source instanceof Uint8Array) {
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy.buffer;
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(source)) {
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy.buffer;
  }

  const bytes = new Uint8Array(source as ArrayBuffer);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function logPdfBufferDiagnostics(stage: string, value: unknown): void {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_OCR_DEBUG !== "true") {
    return;
  }

  const diagnostics = describePdfBuffer(value);
  console.info("[document-intelligence][pdf-buffer]", stage, {
    byteLength: diagnostics.byteLength,
    kind: diagnostics.kind,
    constructorName: diagnostics.constructorName,
    detached: diagnostics.detached,
  });
}
