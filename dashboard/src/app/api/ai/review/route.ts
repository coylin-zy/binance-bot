import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { appendAuditEvent, makeDecisionId } from "@/lib/audit/store";
import { runtimeLineage } from "@/lib/audit/lineage";
import { requestLlm, type LlmTask } from "@/lib/llm/gateway";
import { checkLlmRateLimit } from "@/lib/llm/rate-limit";

export const dynamic = "force-dynamic";

const TASKS = new Set<LlmTask>(["market_summary", "strategy_review", "trade_explanation"]);

function responseStatus(status: string) {
  if (status === "rate_limited") return 429;
  if (status === "timeout") return 504;
  if (status === "invalid_response" || status === "provider_error") return 502;
  return 200;
}

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const identity = req.headers.get("x-real-ip")?.trim() || forwardedFor || "unknown";
  const rate = checkLlmRateLimit(identity);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "LLM request rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }
  const body = await req.json().catch(() => null) as {
    task?: unknown;
    prompt_version?: unknown;
    market_data_timestamp?: unknown;
    context?: unknown;
  } | null;
  const task = typeof body?.task === "string" ? body.task as LlmTask : null;
  const promptVersion = typeof body?.prompt_version === "string" ? body.prompt_version.trim() : "";
  const context = body?.context;
  if (!task || !TASKS.has(task) || !promptVersion || !context || typeof context !== "object" || Array.isArray(context)) {
    return NextResponse.json({ error: "task, prompt_version and object context are required" }, { status: 400 });
  }
  const decisionId = makeDecisionId();
  const result = await requestLlm({ task, promptVersion, context: context as Record<string, unknown> });
  await appendAuditEvent({
    decision_id: decisionId,
    event_type: "llm_explanation",
    request_timestamp: new Date().toISOString(),
    market_data_timestamp: typeof body?.market_data_timestamp === "string"
      ? body.market_data_timestamp
      : undefined,
    ...runtimeLineage(),
    prompt_version: result.prompt_version,
    provider: result.provider,
    model: result.model,
    input_snapshot_hash: result.input_snapshot_hash,
    latency_ms: result.latency_ms,
    token_usage: result.token_usage,
    result_status: result.status,
    payload: {
      task,
      output: result.output,
      error_code: result.error_code,
      read_only: true,
    },
  });
  return NextResponse.json({ decision_id: decisionId, ...result }, { status: responseStatus(result.status) });
}
