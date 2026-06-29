/** Maximum allowed PDF upload size (25 MB). */
export const MAX_PDF_SIZE = 25 * 1024 * 1024;

export const MAX_PDF_SIZE_ERROR = "File size must not exceed 25 MB.";

export const MAX_PDF_SIZE_LABEL = "25 MB";

export function isPdfWithinSizeLimit(sizeInBytes: number): boolean {
  return sizeInBytes > 0 && sizeInBytes <= MAX_PDF_SIZE;
}

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-

/** Verifies the buffer begins with a PDF magic header (%PDF-). */
export function isPdfBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength > MAX_PDF_SIZE) return false;
  if (buffer.byteLength < PDF_HEADER.length) return false;
  const bytes = new Uint8Array(buffer, 0, PDF_HEADER.length);
  return PDF_HEADER.every((byte, index) => bytes[index] === byte);
}

/** Strips path segments and control characters from an uploaded file name. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f\x7f]/g, "");
  const trimmed = base.trim().slice(0, 255);
  return trimmed.length > 0 ? trimmed : "upload.pdf";
}

/** Formats a byte count for display in the upload UI. */
export function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes >= 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(sizeInBytes / 1024).toFixed(0)} KB`;
}
