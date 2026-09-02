import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getForwardRunSnapshot } from "./forward";

const temporaryDirectories: string[] = [];

async function temporaryRun() {
  const path = await mkdtemp(join(tmpdir(), "forward-run-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("forward-run evidence reader", () => {
  it("is optional when no evidence mount is configured", async () => {
    await expect(getForwardRunSnapshot("")).resolves.toMatchObject({
      status: "not_configured",
      configured: false,
    });
  });

  it("returns only the safe machine-readable forward status", async () => {
    const path = await temporaryRun();
    await writeFile(join(path, "manifest.json"), JSON.stringify({
      schema_version: 1,
      run_id: "simple-v1-forward-v1",
      started_at: "2026-09-02T00:00:00Z",
      minimum_observation_days: 30,
      lineage: { git_sha: "abc123", secret: 123 },
    }));
    await writeFile(join(path, "verdict.json"), JSON.stringify({
      schema_version: 1,
      status: "collecting",
      generated_at: "2026-09-02T01:00:00Z",
      failed_checks: ["min_trade_count"],
      metrics: {
        observation_days: 3,
        trade_count: 2,
        profit_factor: 1.2,
        net_return_ratio: 0.01,
        max_drawdown_ratio: 0.02,
        signal_divergence_ratio: null,
        fill_deviation_ratio: 0.001,
        uptime_ratio: 0.999,
        api_error_ratio: 0.001,
        restart_recovery: true,
        data_integrity: true,
        evidence: { expected_sample_count: 10, successful_sample_count: 9 },
        lineage: { git_sha: "abc123", strategy_sha: "def456" },
      },
    }));

    const snapshot = await getForwardRunSnapshot(path);
    expect(snapshot).toMatchObject({
      status: "collecting",
      configured: true,
      run_id: "simple-v1-forward-v1",
      observation_days: 3,
      progress_ratio: 0.1,
      trade_count: 2,
      uptime_ratio: 0.999,
      restart_recovery: true,
      data_integrity: true,
      lineage: { git_sha: "abc123", strategy_sha: "def456" },
    });
    expect(snapshot).not.toHaveProperty("secret");
  });

  it("fails closed for malformed or missing evidence", async () => {
    const path = await temporaryRun();
    await writeFile(join(path, "manifest.json"), "not-json");
    await expect(getForwardRunSnapshot(path)).resolves.toMatchObject({
      status: "unavailable",
      error_code: "evidence_unavailable",
    });
  });
});
