import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;
const children = [];

function start(script, env = {}) {
  const child = spawn(node, [script], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode ?? 1);
  }
  return new Promise((resolve) => {
    child.once("close", (code) => resolve(code ?? 1));
    child.once("error", () => resolve(1));
  });
}

async function waitForUrl(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Test service exited before becoming ready: ${url}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for test service: ${url}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    child.unref();
    // On Windows, TerminateProcess can end the child without Node emitting its
    // close event to the parent. The taskkill result is the authoritative
    // teardown signal; waiting for close here would make an otherwise passing
    // e2e run hang forever.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

let exitCode = 1;
try {
  const mock = start("scripts/mock-freqtrade.mjs");
  await waitForUrl("http://127.0.0.1:18080/api/v1/show_config", mock);

  const dashboard = start("scripts/start-standalone.mjs", {
    HOSTNAME: "127.0.0.1",
    PORT: "3100",
    FREQTRADE_URL: "http://127.0.0.1:18080",
    FREQTRADE_WS_TOKEN: "qa-websocket-token",
    FREQTRADE_TIMEOUT_MS: "3000",
    GIT_SHA: "a".repeat(40),
    STRATEGY_SHA: "b".repeat(64),
  });
  await waitForUrl("http://127.0.0.1:3100/login", dashboard);

  const playwright = spawnSync(node, [
    join(projectRoot, "node_modules", "@playwright", "test", "cli.js"),
    "test",
    ...process.argv.slice(2),
  ], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  exitCode = playwright.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  for (const child of children.slice().reverse()) await stop(child);
}

// The server children are intentionally force-terminated above. Explicitly
// exit so Windows does not retain stale stdio handles after their processes
// have already been reaped by taskkill.
process.exit(exitCode);
