import { afterEach, describe, expect, it, vi } from "vitest";
import { binanceConfigurationStatus, getBinanceAccountSnapshot, signedQuery } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Binance account observability", () => {
  it("stays optional when credentials are absent", async () => {
    vi.stubEnv("BINANCE_API_KEY", "");
    vi.stubEnv("BINANCE_API_SECRET", "");
    expect(binanceConfigurationStatus()).toBe("not_configured");
    await expect(getBinanceAccountSnapshot(vi.fn() as typeof fetch)).resolves.toMatchObject({
      status: "not_configured",
      configured: false,
    });
  });

  it("signs the query without exposing the secret", () => {
    const query = signedQuery({ timestamp: 1_700_000_000_000, recvWindow: 5_000 }, "test-secret");
    expect(query).toContain("timestamp=1700000000000");
    expect(query).toContain("signature=");
    expect(query).not.toContain("test-secret");
  });

  it("normalizes a read-only account and filters zero balances", async () => {
    vi.stubEnv("BINANCE_API_KEY", "public-test-key");
    vi.stubEnv("BINANCE_API_SECRET", "private-test-secret");
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/api/v3/time")) {
        return new Response(JSON.stringify({ serverTime: 1_700_000_000_123 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        canTrade: true,
        canWithdraw: false,
        canDeposit: true,
        permissions: ["SPOT"],
        balances: [
          { asset: "USDT", free: "20.5", locked: "1.5" },
          { asset: "BTC", free: "0", locked: "0" },
        ],
      }), { status: 200 });
    });
    const result = await getBinanceAccountSnapshot(fetcher);
    expect(result).toMatchObject({ status: "available", can_trade: true, can_withdraw: false });
    expect(result.balances).toEqual([{ asset: "USDT", free: 20.5, locked: 1.5, total: 22 }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("classifies unauthorized and rate-limited responses", async () => {
    vi.stubEnv("BINANCE_API_KEY", "public-test-key");
    vi.stubEnv("BINANCE_API_SECRET", "private-test-secret");
    const unauthorized = vi.fn<typeof fetch>(async () => new Response("", { status: 401 }));
    const rateLimited = vi.fn<typeof fetch>(async () => new Response("", { status: 429 }));
    await expect(getBinanceAccountSnapshot(unauthorized)).resolves.toMatchObject({ status: "unauthorized" });
    await expect(getBinanceAccountSnapshot(rateLimited)).resolves.toMatchObject({ status: "rate_limited" });
  });
});
