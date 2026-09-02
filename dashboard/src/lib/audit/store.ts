import { appendFile, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

export interface AuditEvent {
  decision_id: string;
  event_type: "rule_signal" | "llm_explanation" | "risk_check" | "system";
  request_timestamp: string;
  market_data_timestamp?: string;
  experiment_id?: string;
  git_sha?: string;
  strategy_sha?: string;
  strategy_version?: string;
  freqtrade_version?: string;
  docker_image_digest?: string;
  protocol_version?: string;
  prompt_version?: string;
  provider?: string;
  model?: string | null;
  input_snapshot_hash?: string;
  latency_ms?: number | null;
  token_usage?: { prompt: number; completion: number; total: number } | null;
  result_status: string;
  payload?: Record<string, unknown>;
}

const memoryEvents: AuditEvent[] = [];
const MAX_EVENTS = 500;

function logPath() {
  return process.env.AUDIT_LOG_PATH || "/tmp/freqtrade-dashboard-audit.jsonl";
}

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      /(key|secret|token|password|authorization|cookie)/i.test(key)
        ? []
        : [[key, safeValue(item, depth + 1)]],
    ),
  );
}

function safePayload(value: unknown): Record<string, unknown> | undefined {
  const sanitized = safeValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : undefined;
}

export function makeDecisionId() {
  return randomUUID();
}

export function payloadSnapshotHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(safeValue(payload))).digest("hex");
}

export async function appendAuditEvent(event: AuditEvent) {
  const sanitized: AuditEvent = {
    ...event,
    payload: safePayload(event.payload),
  };
  memoryEvents.unshift(sanitized);
  if (memoryEvents.length > MAX_EVENTS) memoryEvents.length = MAX_EVENTS;
  try {
    await appendFile(
      /* turbopackIgnore: true */ logPath(),
      `${JSON.stringify(sanitized)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // The in-memory fallback keeps research UI usable on read-only/serverless filesystems.
  }
}

export async function readAuditEvents(limit = 50): Promise<AuditEvent[]> {
  const bounded = Math.min(Math.max(Math.floor(limit), 1), 200);
  try {
    const content = await readFile(/* turbopackIgnore: true */ logPath(), "utf8");
    const persisted = content
      .split("\n")
      .filter(Boolean)
      .slice(-bounded)
      .reverse()
      .flatMap((line) => {
        try {
          const value = JSON.parse(line);
          return value && typeof value === "object" ? [value as AuditEvent] : [];
        } catch {
          return [];
        }
      });
    return persisted;
  } catch {
    return memoryEvents.slice(0, bounded);
  }
}
