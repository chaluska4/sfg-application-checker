import { describe, expect, it } from "vitest";
import {
  generateBlobName,
  isAllowedBlobName,
  slugifyOriginalFilenameForBlob,
} from "@/lib/azure-blob-storage";

const FIXED_DATE = new Date("2026-06-30T12:00:00.000Z");

describe("blob name generation", () => {
  it("slugifies filenames with spaces, uppercase, and business identifiers", () => {
    expect(slugifyOriginalFilenameForBlob("Palmaffy Robert EQT EQ0001545688F Johnson.pdf")).toBe(
      "palmaffy-robert-eqt-eq0001545688f-johnson"
    );
  });

  it("slugifies filenames with parentheses and apostrophes", () => {
    expect(slugifyOriginalFilenameForBlob("Smith (Annuity) O'Brien Application.pdf")).toBe(
      "smith-annuity-obrien-application"
    );
  });

  it("generates a server-controlled blob name that passes validation", () => {
    const blobName = generateBlobName(
      "Palmaffy Robert EQT EQ0001545688F Johnson.pdf",
      FIXED_DATE
    );

    expect(blobName).toMatch(
      /^review-uploads\/2026-06-30\/[a-z0-9]{8}-palmaffy-robert-eqt-eq0001545688f-johnson\.pdf$/
    );
    expect(isAllowedBlobName(blobName)).toBe(true);
    expect(blobName).not.toContain(" ");
    expect(blobName).not.toContain("(");
  });

  it("handles long filenames by truncating the slug", () => {
    const longName = `${"VeryLongClientName ".repeat(20)}Application.pdf`;
    const slug = slugifyOriginalFilenameForBlob(longName);
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(isAllowedBlobName(generateBlobName(longName, FIXED_DATE))).toBe(true);
  });

  it("rejects path traversal and arbitrary container paths", () => {
    expect(isAllowedBlobName("../secrets.pdf")).toBe(false);
    expect(isAllowedBlobName("review-uploads/../secrets.pdf")).toBe(false);
    expect(isAllowedBlobName("other-container/2026-06-30/file.pdf")).toBe(false);
    expect(isAllowedBlobName("review-uploads/2026-06-30/evil name.pdf")).toBe(false);
    expect(isAllowedBlobName("reviews/old-format.pdf")).toBe(false);
  });

  it("never uses the raw original filename as the blob name", () => {
    const original = "Palmaffy Robert EQT EQ0001545688F Johnson.pdf";
    const blobName = generateBlobName(original, FIXED_DATE);
    expect(blobName).not.toContain("Palmaffy");
    expect(blobName).not.toContain(" ");
  });
});
