import { describe, it, expect } from "vitest";
import { PDFJS_WORKER_SRC } from "@/lib/pdfjs-config";

describe("pdfjs-config", () => {
  it("uses a self-hosted worker path on the app domain", () => {
    expect(PDFJS_WORKER_SRC).toBe("/pdf.worker.min.mjs");
    expect(PDFJS_WORKER_SRC).not.toMatch(/^https?:\/\//);
    expect(PDFJS_WORKER_SRC).not.toContain("unpkg");
  });
});
