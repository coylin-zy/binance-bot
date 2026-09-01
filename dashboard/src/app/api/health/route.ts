import packageInfo from "../../../../package.json";
import { binanceConfigurationStatus } from "@/lib/binance/client";

const FT_BASE_URL = process.env.FREQTRADE_URL ?? "http://freqtrade:8080";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  let freqtrade: "up" | "down" = "down";

  try {
    const response = await fetch(`${FT_BASE_URL}/api/v1/ping`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) freqtrade = "up";
  } catch {
    freqtrade = "down";
  }

  const realtimeConfigured = Boolean(process.env.FREQTRADE_WS_TOKEN);
  const healthy = freqtrade === "up" && realtimeConfigured;

  return Response.json({
    status: healthy ? "ok" : "degraded",
    service: "freqtrade-dashboard",
    version: packageInfo.version,
    dependencies: {
      freqtrade,
      realtime: realtimeConfigured ? "configured" : "missing_configuration",
      binance_account: binanceConfigurationStatus(),
    },
    latency_ms: Math.round(performance.now() - startedAt),
    timestamp: new Date().toISOString(),
  }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
