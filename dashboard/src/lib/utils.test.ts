import { describe, expect, it } from "vitest";
import { formatPct, formatUsd } from "./utils";

describe("number formatting", () => {
  it("formats ratios as percentages", () => {
    expect(formatPct(-0.0042)).toBe("-0.42%");
    expect(formatPct(0.0205)).toBe("+2.05%");
  });

  it("puts the minus sign before the currency symbol", () => {
    expect(formatUsd(-1.84)).toBe("-$1.84");
  });
});
