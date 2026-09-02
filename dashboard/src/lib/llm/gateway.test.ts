import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inputSnapshotHash,
  llmConfigurationStatus,
  requestLlm,
  resetGatewayForTests,
  sanitizeContext,
} from "./gateway";

const request = {
  task: "strategy_review" as const,
  promptVersion: "strategy-review-v1",
  context: { pair: "BTC/USDT", apiKey: "never-send-this", metrics: { net_return: -0.02 } },
};

const validBody = {
  choices: [{ message: { content: JSON.stringify({
    summary: "The holdout sample is sparse and should remain research-only.",
    risk_flags: ["sparse_sample"],
    evidence: ["7 closed trades in the sealed holdout"],
    limitations: ["No causal edge is established"],
    expires_at: "2099-01-01T00:00:00Z",
  }) } }],
  usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
};

afterEach(() => {
  resetGatewayForTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function configure() {
  vi.stubEnv("LLM_PROVIDER", "openai-compatible");
  vi.stubEnv("LLM_API_KEY", "server-only-key");
  vi.stubEnv("LLM_MODEL", "research-model");
  vi.stubEnv("LLM_DAILY_BUDGET_USD", "10");
  vi.stubEnv("LLM_RETRY_BASE_MS", "0");
}

describe("read-only LLM gateway", () => {
  it("reports an explicit not_configured state without calling a provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubEnv("LLM_PROVIDER", "none");
    const result = await requestLlm(request, fetcher);
    expect(llmConfigurationStatus()).toBe("not_configured");
    expect(result).toMatchObject({ status: "not_configured", output: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts credential-shaped context keys before hashing or sending", () => {
    const safe = sanitizeContext(request.context);
    expect(safe).toMatchObject({ apiKey: "[REDACTED]" });
    expect(inputSnapshotHash(request.context)).not.toContain("never-send-this");
  });

  it("parses the strict read-only output schema", async () => {
    configure();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(validBody), { status: 200 }));
    const result = await requestLlm(request, fetcher);
    expect(result).toMatchObject({ status: "available", model: "research-model" });
    expect(result.output?.risk_flags).toEqual(["sparse_sample"]);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.messages[1].content).not.toContain("never-send-this");
    expect(body.messages[1].content).not.toContain("server-only-key");
  });

  it("returns invalid_response when the provider violates the schema", async () => {
    configure();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }));
    const result = await requestLlm(request, fetcher);
    expect(result).toMatchObject({ status: "invalid_response", error_code: "schema_validation_failed" });
  });

  it("retries transient provider responses and then succeeds", async () => {
    configure();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validBody), { status: 200 }));
    await expect(requestLlm(request, fetcher)).resolves.toMatchObject({ status: "available" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops before a provider call when the daily budget is disabled", async () => {
    configure();
    vi.stubEnv("LLM_DAILY_BUDGET_USD", "0");
    const fetcher = vi.fn<typeof fetch>();
    const result = await requestLlm(request, fetcher);
    expect(result.status).toBe("budget_exceeded");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
