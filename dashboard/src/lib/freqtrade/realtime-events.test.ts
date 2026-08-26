import { describe, expect, it } from "vitest";
import { summarizeRealtimeEvent } from "./realtime-events";

describe("summarizeRealtimeEvent", () => {
  it("creates a safe market summary for filled entries", () => {
    expect(summarizeRealtimeEvent("entry_fill", { pair: "BTC/USDT", timeframe: "5m" })).toEqual({
      label: "入场订单已成交",
      detail: "BTC/USDT / 5m",
      tone: "success",
    });
  });

  it("summarizes warnings without serializing arbitrary payload fields", () => {
    expect(summarizeRealtimeEvent("warning", { status: "Dry run is enabled", secret: "hidden" })).toEqual({
      label: "Freqtrade 风险告警",
      detail: "Dry run is enabled",
      tone: "warning",
    });
  });

  it("ignores noisy events without a product-facing summary", () => {
    expect(summarizeRealtimeEvent("analyzed_df", { pair: "BTC/USDT" })).toBeNull();
  });
});
