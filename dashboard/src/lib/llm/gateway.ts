import { createHash } from "node:crypto";

export type LlmTask = "market_summary" | "strategy_review" | "trade_explanation";
export type LlmStatus =
  | "available"
  | "not_configured"
  | "budget_exceeded"
  | "rate_limited"
  | "timeout"
  | "invalid_response"
  | "provider_error";

export interface LlmOutput {
  summary: string;
  risk_flags: string[];
  evidence: string[];
  limitations: string[];
  expires_at: string;
}

export interface LlmRequest {
  task: LlmTask;
  promptVersion: string;
  context: Record<string, unknown>;
}

export interface LlmResult {
  status: LlmStatus;
  task: LlmTask;
  provider: string;
  model: string | null;
  prompt_version: string;
  input_snapshot_hash: string;
  latency_ms: number | null;
  token_usage: { prompt: number; completion: number; total: number } | null;
  output: LlmOutput | null;
  error_code?: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const MAX_CONTEXT_BYTES = 12_000;
const MAX_ATTEMPTS = 3;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_OPEN_MS = 60_000;

interface GatewayConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  dailyBudgetUsd: number;
  costPer1kTokensUsd: number;
  retryBaseMs: number;
  maxOutputTokens: number;
  temperature: number;
}

interface CircuitState {
  failures: number;
  openUntil: number;
}

let circuit: CircuitState = { failures: 0, openUntil: 0 };
let spend = { day: "", usd: 0 };

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function getConfig(): GatewayConfig {
  return {
    provider: process.env.LLM_PROVIDER?.trim() || "none",
    apiKey: process.env.LLM_API_KEY?.trim() || "",
    baseUrl: (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL?.trim() || "",
    timeoutMs: boundedNumber(process.env.LLM_TIMEOUT_MS, 10_000, 1_000, 30_000),
    dailyBudgetUsd: boundedNumber(process.env.LLM_DAILY_BUDGET_USD, 0, 0, 10_000),
    costPer1kTokensUsd: boundedNumber(process.env.LLM_COST_PER_1K_TOKENS_USD, 0.002, 0, 100),
    retryBaseMs: boundedNumber(process.env.LLM_RETRY_BASE_MS, 150, 0, 2_000),
    maxOutputTokens: Math.floor(boundedNumber(process.env.LLM_MAX_OUTPUT_TOKENS, 800, 128, 4_000)),
    temperature: boundedNumber(process.env.LLM_TEMPERATURE, 0, 0, 1),
  };
}

export function llmConfigurationStatus(): "configured" | "not_configured" {
  const config = getConfig();
  return config.provider !== "none" && Boolean(config.apiKey) && Boolean(config.model)
    ? "configured"
    : "not_configured";
}

export function llmPublicConfig() {
  const config = getConfig();
  return {
    status: llmConfigurationStatus(),
    provider: config.provider,
    model: config.model || null,
    daily_budget_usd: config.dailyBudgetUsd,
  };
}

function isSensitiveKey(key: string) {
  return /(api[_-]?key|secret|token|password|authorization|cookie|credential)/i.test(key);
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redact(item, depth + 1),
      ]),
    );
  }
  return value;
}

export function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  return redact(context) as Record<string, unknown>;
}

export function inputSnapshotHash(context: Record<string, unknown>): string {
  const encoded = JSON.stringify(sanitizeContext(context));
  return createHash("sha256").update(encoded).digest("hex");
}

function emptyResult(request: LlmRequest, status: LlmStatus, errorCode?: string): LlmResult {
  return {
    status,
    task: request.task,
    provider: getConfig().provider,
    model: getConfig().model || null,
    prompt_version: request.promptVersion,
    input_snapshot_hash: inputSnapshotHash(request.context),
    latency_ms: null,
    token_usage: null,
    output: null,
    ...(errorCode ? { error_code: errorCode } : {}),
  };
}

function validateRequest(request: LlmRequest): string | null {
  if (!request.promptVersion || request.promptVersion.length > 128) return "invalid_prompt_version";
  const encoded = JSON.stringify(sanitizeContext(request.context));
  if (new TextEncoder().encode(encoded).byteLength > MAX_CONTEXT_BYTES) return "context_too_large";
  return null;
}

function parseJsonContent(content: unknown): unknown {
  if (typeof content !== "string") return null;
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function validateOutput(value: unknown): LlmOutput | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.summary !== "string" || !source.summary.trim() || source.summary.length > 4_000) return null;
  const list = (candidate: unknown, limit: number) =>
    Array.isArray(candidate)
      && candidate.length <= limit
      && candidate.every((item) => typeof item === "string" && item.length <= 500)
      ? candidate as string[]
      : null;
  const riskFlags = list(source.risk_flags, 20);
  const evidence = list(source.evidence, 30);
  const limitations = list(source.limitations, 20);
  if (!riskFlags || !evidence || !limitations || typeof source.expires_at !== "string") return null;
  const expires = Date.parse(source.expires_at);
  if (!Number.isFinite(expires)) return null;
  return {
    summary: source.summary.trim(),
    risk_flags: riskFlags,
    evidence,
    limitations,
    expires_at: new Date(expires).toISOString(),
  };
}

function tokenUsage(payload: Record<string, unknown>) {
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") return null;
  const source = usage as Record<string, unknown>;
  const prompt = Number(source.prompt_tokens ?? 0);
  const completion = Number(source.completion_tokens ?? 0);
  const total = Number(source.total_tokens ?? prompt + completion);
  if (![prompt, completion, total].every((value) => Number.isFinite(value) && value >= 0)) return null;
  return { prompt, completion, total };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function budgetAllows(config: GatewayConfig) {
  const day = todayKey();
  if (spend.day !== day) spend = { day, usd: 0 };
  return config.dailyBudgetUsd > 0 && spend.usd < config.dailyBudgetUsd;
}

function recordSpend(config: GatewayConfig, usage: { total: number }) {
  spend.usd += (usage.total / 1_000) * config.costPer1kTokensUsd;
}

function circuitOpen() {
  return circuit.openUntil > Date.now();
}

function recordFailure() {
  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_LIMIT) circuit.openUntil = Date.now() + CIRCUIT_OPEN_MS;
}

function recordSuccess() {
  circuit = { failures: 0, openUntil: 0 };
}

async function wait(ms: number) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function providerUrl(baseUrl: string) {
  return baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
}

function errorStatus(status: number): LlmStatus {
  if (status === 429) return "rate_limited";
  return "provider_error";
}

export function resetGatewayForTests() {
  circuit = { failures: 0, openUntil: 0 };
  spend = { day: "", usd: 0 };
}

export async function requestLlm(
  request: LlmRequest,
  fetcher: typeof fetch = fetch,
): Promise<LlmResult> {
  const config = getConfig();
  const invalid = validateRequest(request);
  if (invalid) return emptyResult(request, "invalid_response", invalid);
  if (llmConfigurationStatus() === "not_configured") return emptyResult(request, "not_configured");
  if (!budgetAllows(config)) return emptyResult(request, "budget_exceeded");
  if (circuitOpen()) return emptyResult(request, "provider_error", "circuit_open");

  const sanitized = sanitizeContext(request.context);
  const system = [
    "You are a read-only research assistant for a deterministic Freqtrade spot strategy.",
    "Never place, suggest, or authorize an order. Do not output buy/sell signals or confidence scores.",
    "Return JSON only with summary, risk_flags, evidence, limitations, and expires_at.",
  ].join(" ");
  const user = `Task: ${request.task}\nPrompt version: ${request.promptVersion}\nResearch context:\n${JSON.stringify(sanitized)}`;
  const startedAt = performance.now();
  let lastStatus: LlmStatus = "provider_error";
  let lastError = "provider_error";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(providerUrl(config.baseUrl), {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) {
        lastStatus = errorStatus(response.status);
        lastError = `http_${response.status}`;
        if (![408, 409, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS - 1) break;
        await wait(config.retryBaseMs * (2 ** attempt));
        continue;
      }
      const payload = await response.json() as Record<string, unknown>;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const content = choices[0] && typeof choices[0] === "object"
        ? (choices[0] as Record<string, unknown>).message
        : null;
      const message = content && typeof content === "object"
        ? (content as Record<string, unknown>).content
        : null;
      const output = validateOutput(parseJsonContent(message));
      const usage = tokenUsage(payload);
      if (!output) {
        recordFailure();
        return {
          ...emptyResult(request, "invalid_response", "schema_validation_failed"),
          latency_ms: Math.round(performance.now() - startedAt),
          token_usage: usage,
        };
      }
      recordSuccess();
      if (usage) recordSpend(config, usage);
      return {
        ...emptyResult(request, "available"),
        latency_ms: Math.round(performance.now() - startedAt),
        token_usage: usage,
        output,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      lastStatus = isTimeout ? "timeout" : "provider_error";
      lastError = isTimeout ? "timeout" : "network_error";
      if (attempt < MAX_ATTEMPTS - 1) {
        await wait(config.retryBaseMs * (2 ** attempt));
        continue;
      }
    }
  }
  recordFailure();
  return {
    ...emptyResult(request, lastStatus, lastError),
    latency_ms: Math.round(performance.now() - startedAt),
  };
}
