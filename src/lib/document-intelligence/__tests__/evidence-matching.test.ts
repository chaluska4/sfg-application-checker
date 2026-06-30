import { describe, expect, it } from "vitest";
import { classifyPage } from "../classify-pages";
import { hasSignatureDateNearLabels } from "../detect-dates";
import { computeAllocationTotal } from "../parse-allocation-table";

describe("page classification accuracy", () => {
  it("classifies SFG cover sheet separately from application", () => {
    const result = classifyPage(
      "sfg annuity advisors submission checklist cover sheet equitrust annuity packet",
      1
    );
    expect(result.classification).toBe("sfg_cover_sheet");
    expect(result.classification).not.toBe("application_page_1");
  });

  it("classifies transfer/1035 pages separately from application", () => {
    const result = classifyPage(
      "1035 exchange transfer request annuitant owner information transfer authorization",
      16
    );
    expect(result.classification).toBe("transfer_1035_form");
    expect(result.classification).not.toBe("application_page_1");
  });

  it("requires individual annuity application marker for application page 1", () => {
    const result = classifyPage("owner information annuitant premium details only", 2);
    expect(result.classification).not.toBe("application_page_1");
  });
});

describe("allocation table parsing", () => {
  const allocationTable = `
INITIAL PREMIUM ALLOCATION - REQUIRED
Fixed Account 40%
S&P 500 Index 35%
Global Index 25%
Total 100%
`;

  it("parses allocation percentages only from the required table section", () => {
    expect(computeAllocationTotal(allocationTable)).toBe(100);
  });

  it("ignores explanatory percentages outside the allocation table", () => {
    const text = `
Product disclosure may earn up to 100% participation in some market years.
Illustration shows 50% surrender charge in year one.
${allocationTable}
`;
    expect(computeAllocationTotal(text)).toBe(100);
  });

  it("returns null when required allocation header is absent", () => {
    expect(computeAllocationTotal("Allocation 60% Fixed 40% Index")).toBeNull();
  });
});

describe("signature date detection", () => {
  it("finds owner signature date near signature label", () => {
    const result = hasSignatureDateNearLabels("Owner Signature Date 03/15/2026");
    expect(result.present).toBe(true);
  });

  it("does not treat date of birth as owner signature date", () => {
    const result = hasSignatureDateNearLabels("Owner Date of Birth 01/02/1960");
    expect(result.present).toBe(false);
  });

  it("does not treat annuitant DOB as signature date", () => {
    const result = hasSignatureDateNearLabels("Annuitant Date of Birth 12/31/1955");
    expect(result.present).toBe(false);
  });
});
