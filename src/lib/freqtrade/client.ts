const FT_BASE_URL =
  process.env.FREQTRADE_URL ?? "http://freqtrade:8080";

const configuredTimeout = Number(process.env.FREQTRADE_TIMEOUT_MS ?? 10_000);
const FT_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.min(Math.max(configuredTimeout, 1_000), 30_000)
  : 10_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface StoredTokens {
  accessToken?: string;
  refreshToken: string;
}

export interface FreqtradeResponse<T> {
  data: T;
  refreshedTokens?: TokenPair;
}

export class FreqtradeApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "FreqtradeApiError";
  }
}

async function ftRequest(url: string, init: RequestInit = {}) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(FT_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new FreqtradeApiError(504, "Freqtrade request timed out");
    }
    throw new FreqtradeApiError(502, "Freqtrade service unavailable");
  }
}

async function fetchTokens(username: string, password: string): Promise<TokenPair> {
  const res = await ftRequest(`${FT_BASE_URL}/api/v1/token/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
  });
  if (!res.ok) throw new FreqtradeApiError(res.status, "Freqtrade login failed");
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function refreshTokens(refresh: string): Promise<TokenPair> {
  const res = await ftRequest(`${FT_BASE_URL}/api/v1/token/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${refresh}` },
  });
  if (!res.ok) throw new FreqtradeApiError(res.status, "Token refresh failed");
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refresh,
  };
}

export async function login(username: string, password: string): Promise<TokenPair> {
  return fetchTokens(username, password);
}

export async function ftFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; tokens?: StoredTokens } = {}
): Promise<FreqtradeResponse<T>> {
  const tokens = options.tokens;
  if (!tokens) throw new Error("Not authenticated");

  let activeTokens: StoredTokens = tokens;
  let refreshedTokens: TokenPair | undefined;

  if (!activeTokens.accessToken) {
    refreshedTokens = await refreshTokens(activeTokens.refreshToken);
    activeTokens = refreshedTokens;
  }

  let res = await ftRequest(`${FT_BASE_URL}/api/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${activeTokens.accessToken}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    const refreshed = await refreshTokens(activeTokens.refreshToken);
    refreshedTokens = refreshed;
    res = await ftRequest(`${FT_BASE_URL}/api/v1/${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${refreshed.accessToken}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FreqtradeApiError(res.status, text || "Freqtrade API request failed");
  }
  return {
    data: (await res.json()) as T,
    refreshedTokens,
  };
}
