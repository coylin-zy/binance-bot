import { describe, expect, it } from "vitest";
import { formatPct, formatUsd, positionRiskDistance, profitClass } from "./utils";

describe("display formatters", () => {
  it("formats ratio values as signed percentages", () => {
    expect(formatPct(0.125)).toBe("+12.50%");
    expect(formatPct(-0.0418)).toBe("-4.18%");
    expect(formatPct(null)).toBe("--");
  });

  it("formats USD values without losing negative signs", () => {
    expect(formatUsd(1024.93)).toBe("$1024.93");
    expect(formatUsd(-1.1)).toBe("-$1.10");
    expect(formatUsd(undefined)).toBe("--");
  });

  it("selects a profit tone only for non-zero values", () => {
    expect(profitClass(1)).toBe("profit-pos");
    expect(profitClass(-1)).toBe("profit-neg");
    expect(profitClass(0)).toBe("");
  });
});

describe("positionRiskDistance", () => {
  it("calculates the remaining long-side distance to stop loss", () => {
    expect(positionRiskDistance(100, 92, false)).toBeCloseTo(0.08);
  });

  it("calculates the remaining short-side distance to stop loss", () => {
    expect(positionRiskDistance(100, 108, true)).toBeCloseTo(0.08);
  });

  it("rejects missing and invalid rates", () => {
    expect(positionRiskDistance(0, 92, false)).toBeNull();
    expect(positionRiskDistance(100, null, false)).toBeNull();
  });
});
