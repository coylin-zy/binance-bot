import { describe, expect, it } from "vitest";
import { latestPeriod, periodRows, tradeProfitRatio, tradeRows } from "./normalizers";

describe("Freqtrade response normalizers", () => {
  it("unwraps periodic response objects", () => {
    const row = { date: "2026-08-26", abs_profit: 12, rel_profit: 0.012 } as never;
    expect(periodRows({ data: [row] })).toEqual([row]);
    expect(latestPeriod({ data: [row] })).toBe(row);
  });

  it("unwraps trade response objects", () => {
    const trade = { trade_id: 7, profit_ratio: -0.0042 } as never;
    expect(tradeRows({ trades: [trade], trades_count: 1, total_trades: 1, offset: 0 })).toEqual([trade]);
  });

  it("uses ratio units for percent formatting", () => {
    expect(tradeProfitRatio({ profit_ratio: -0.0042, close_profit: -0.42 })).toBe(-0.0042);
  });
});
