import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_EVIDENCE_FILE_BYTES = 1024 * 1024;
const RUN_STATUSES = new Set([
  "collecting",
  "needs_iteration",
  "passed",
  "research_failed",
]);

export type ForwardRunStatus =
  | "not_configured"
  | "unavailable"
  | "collecting"
  | "needs_iteration"
  | "passed"
  | "research_failed";

export interface ForwardRunSnapshot {
  status: ForwardRunStatus;
  configured: boolean;
  run_id: string | null;
  started_at: string | null;
  updated_at: string | null;
  minimum_observation_days: number | null;
  observation_days: number | null;
  progress_ratio: number | null;
  trade_count: number | null;
  profit_factor: number | null;
  net_return_ratio: number | null;
  max_drawdown_ratio: number | null;
  signal_divergence_ratio: number | null;
  fill_deviation_ratio: number | null;
  uptime_ratio: number | null;
  api_error_ratio: number | null;
  restart_recovery: boolean | null;
  data_integrity: boolean | null;
  expected_sample_count: number | null;
  successful_sample_count: number | null;
  failed_checks: string[];
  lineage: Record<string, string>;
  error_code?: "evidence_unavailable";
}

function emptySnapshot(status: "not_configured" | "unavailable"): ForwardRunSnapshot {
  return {
    status,
    configured: status !== "not_configured",
    run_id: null,
    started_at: null,
    updated_at: null,
    minimum_observation_days: null,
    observation_days: null,
    progress_ratio: null,
    trade_count: null,
    profit_factor: null,
    net_return_ratio: null,
    max_drawdown_ratio: null,
    signal_divergence_ratio: null,
    fill_deviation_ratio: null,
    uptime_ratio: null,
    api_error_ratio: null,
    restart_recovery: null,
    data_integrity: null,
    expected_sample_count: null,
    successful_sample_count: null,
    failed_checks: [],
    lineage: {},
    ...(status === "unavailable" ? { error_code: "evidence_unavailable" as const } : {}),
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 ? value : null;
}

async function readEvidence(path: string): Promise<Record<string, unknown>> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > MAX_EVIDENCE_FILE_BYTES) {
    throw new Error("Invalid evidence file");
  }
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const document = object(parsed);
  if (!document || document.schema_version !== 1) throw new Error("Invalid evidence schema");
  return document;
}

export async function getForwardRunSnapshot(
  runPath = process.env.FORWARD_RUN_PATH?.trim() ?? "",
): Promise<ForwardRunSnapshot> {
  if (!runPath) return emptySnapshot("not_configured");
  try {
    const [manifest, verdict] = await Promise.all([
      readEvidence(join(runPath, "manifest.json")),
      readEvidence(join(runPath, "verdict.json")),
    ]);
    const metrics = object(verdict.metrics);
    const evidence = object(metrics?.evidence);
    const rawLineage = object(metrics?.lineage) ?? object(manifest.lineage) ?? {};
    const status = text(verdict.status);
    const minimumDays = finite(manifest.minimum_observation_days);
    const observationDays = finite(metrics?.observation_days);
    if (!metrics || !status || !RUN_STATUSES.has(status) || minimumDays === null) {
      throw new Error("Invalid forward verdict");
    }
    const failedChecks = Array.isArray(verdict.failed_checks)
      ? verdict.failed_checks.filter((item): item is string => typeof item === "string").slice(0, 32)
      : [];
    const lineage = Object.fromEntries(
      Object.entries(rawLineage)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key.slice(0, 64), value.slice(0, 256)])
        .slice(0, 16),
    );
    return {
      status: status as ForwardRunStatus,
      configured: true,
      run_id: text(manifest.run_id),
      started_at: text(manifest.started_at),
      updated_at: text(verdict.generated_at),
      minimum_observation_days: minimumDays,
      observation_days: observationDays,
      progress_ratio: observationDays === null
        ? null
        : Math.min(1, Math.max(0, observationDays / Math.max(minimumDays, 0.000001))),
      trade_count: finite(metrics.trade_count),
      profit_factor: finite(metrics.profit_factor),
      net_return_ratio: finite(metrics.net_return_ratio),
      max_drawdown_ratio: finite(metrics.max_drawdown_ratio),
      signal_divergence_ratio: finite(metrics.signal_divergence_ratio),
      fill_deviation_ratio: finite(metrics.fill_deviation_ratio),
      uptime_ratio: finite(metrics.uptime_ratio),
      api_error_ratio: finite(metrics.api_error_ratio),
      restart_recovery: typeof metrics.restart_recovery === "boolean" ? metrics.restart_recovery : null,
      data_integrity: typeof metrics.data_integrity === "boolean" ? metrics.data_integrity : null,
      expected_sample_count: finite(evidence?.expected_sample_count),
      successful_sample_count: finite(evidence?.successful_sample_count),
      failed_checks: failedChecks,
      lineage,
    };
  } catch {
    return emptySnapshot("unavailable");
  }
}
