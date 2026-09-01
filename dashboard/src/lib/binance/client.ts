import { createHmac } from "node:crypto";

export type BinanceAvailability =
  | "not_configured"
  | "available"
  | "unauthorized"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface BinanceAccountSnapshot {
  status: BinanceAvailability;
  configured: boolean;
  checked_at: string;
  request_latency_ms: number | null;
  server_time_ms: number | null;
  can_trade: boolean | null;
  can_withdraw: boolean | null;
  can_deposit: boolean | null;
  permissions: string[];
  balances: BinanceBalance[];
  error_code?: string;
}

const DEFAULT_BASE_URL = "https://api.binance.com";
const configuredTimeout = Number(process.env.BINANCE_TIMEOUT_MS ?? 8_000);
const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.min(Math.max(configuredTimeout, 1_000), 20_000)
  : 8_000;

function config() {
  return {
    apiKey: process.env.BINANCE_API_KEY?.trim() ?? "",
    apiSecret: process.env.BINANCE_API_SECRET?.trim() ?? "",
    baseUrl: (process.env.BINANCE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

export function binanceConfigurationStatus(): "configured" | "not_configured" {
  const { apiKey, apiSecret } = config();
  return apiKey && apiSecret ? "configured" : "not_configured";
}

function unsignedQuery(params: Record<string, string | number>) {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

export function signedQuery(
  params: Record<string, string | number>,
  secret: string,
): string {
  const query = unsignedQuery(params);
  const signature = createHmac("sha256", secret).update(query).digest("hex");
  return `${query}&signature=${signature}`;
}

function emptySnapshot(status: BinanceAvailability, errorCode?: string): BinanceAccountSnapshot {
  return {
    status,
    configured: status !== "not_configured",
    checked_at: new Date().toISOString(),
    request_latency_ms: null,
    server_time_ms: null,
    can_trade: null,
    can_withdraw: null,
    can_deposit: null,
    permissions: [],
    balances: [],
    ...(errorCode ? { error_code: errorCode } : {}),
  };
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBalances(value: unknown): BinanceBalance[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const asset = typeof source.asset === "string" ? source.asset.trim().toUpperCase() : "";
      if (!asset) return null;
      const free = finiteNumber(source.free);
      const locked = finiteNumber(source.locked);
      return { asset, free, locked, total: free + locked };
    })
    .filter((item): item is BinanceBalance => item !== null && item.total > 0);
}

async function request(
  path: string,
  query: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<Response> {
  try {
    return await fetcher(`${config().baseUrl}${path}?${query}`, {
      cache: "no-store",
      headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new Error(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
}

function classifyHttp(status: number): BinanceAvailability {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 418 || status === 429) return "rate_limited";
  return "api_error";
}

export async function getBinanceAccountSnapshot(
  fetcher: typeof fetch = fetch,
): Promise<BinanceAccountSnapshot> {
  const { apiKey, apiSecret } = config();
  if (!apiKey || !apiSecret) return emptySnapshot("not_configured");

  const startedAt = performance.now();
  const timestamp = Date.now();
  const accountQuery = signedQuery(
    { recvWindow: 5_000, timestamp },
    apiSecret,
  );

  try {
    const [accountResponse, timeResponse] = await Promise.all([
      request("/api/v3/account", accountQuery, apiKey, fetcher),
      request("/api/v3/time", "", apiKey, fetcher),
    ]);
    const latency = Math.round(performance.now() - startedAt);
    if (!accountResponse.ok) return { ...emptySnapshot(classifyHttp(accountResponse.status)), request_latency_ms: latency };
    const account = (await accountResponse.json()) as Record<string, unknown>;
    let serverTime: number | null = null;
    if (timeResponse.ok) {
      const timePayload = (await timeResponse.json()) as Record<string, unknown>;
      const parsed = finiteNumber(timePayload.serverTime);
      serverTime = parsed > 0 ? parsed : null;
    }
    const permissions = Array.isArray(account.permissions)
      ? account.permissions.filter((item): item is string => typeof item === "string")
      : [];
    return {
      status: "available",
      configured: true,
      checked_at: new Date().toISOString(),
      request_latency_ms: latency,
      server_time_ms: serverTime,
      can_trade: typeof account.canTrade === "boolean" ? account.canTrade : null,
      can_withdraw: typeof account.canWithdraw === "boolean" ? account.canWithdraw : null,
      can_deposit: typeof account.canDeposit === "boolean" ? account.canDeposit : null,
      permissions,
      balances: normalizeBalances(account.balances),
    };
  } catch (error) {
    const errorCode = error instanceof Error && error.message === "timeout" ? "timeout" : "network_error";
    return {
      ...emptySnapshot("network_error", errorCode),
      request_latency_ms: Math.round(performance.now() - startedAt),
    };
  }
}
