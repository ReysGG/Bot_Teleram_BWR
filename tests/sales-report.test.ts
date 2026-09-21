import { describe, expect, it } from "vitest";
import { parseSalesReportRange, salesReportStartDate } from "@/server/admin/sales-report";

describe("admin sales report", () => {
  it("accepts only bounded report ranges", () => {
    expect(parseSalesReportRange("7")).toBe(7);
    expect(parseSalesReportRange("90")).toBe(90);
    expect(parseSalesReportRange("365")).toBe(30);
    expect(parseSalesReportRange("invalid")).toBe(30);
  });

  it("starts the range at midnight Jakarta time", () => {
    expect(salesReportStartDate(7, new Date("2026-08-07T10:00:00.000Z")).toISOString()).toBe(
      "2026-07-31T17:00:00.000Z",
    );
  });
});
