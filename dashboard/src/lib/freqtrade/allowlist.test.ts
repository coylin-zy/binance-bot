import { describe, expect, it } from "vitest";
import { isAllowed } from "./allowlist";

describe("Freqtrade BFF allowlist", () => {
  it("allows read-only monitoring and safe lifecycle actions", () => {
    expect(isAllowed("GET", "profit")).toBe(true);
    expect(isAllowed("POST", "pair_candles")).toBe(true);
    expect(isAllowed("POST", "pause")).toBe(true);
  });

  it("blocks manual trading and configuration mutation", () => {
    expect(isAllowed("POST", "forcebuy")).toBe(false);
    expect(isAllowed("POST", "forcesell")).toBe(false);
    expect(isAllowed("POST", "reload_config")).toBe(false);
    expect(isAllowed("DELETE", "trades/1")).toBe(false);
  });
});
