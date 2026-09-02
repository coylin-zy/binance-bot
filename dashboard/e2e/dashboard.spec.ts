import { expect, test, type Page } from "@playwright/test";

const routes = [
  ["/", "量化机器人控制台", "DRY-RUN / SPOT"],
  ["/chart", "市场遥测与策略标记", "READY"],
  ["/trades", "收益分析与执行记录", "EXECUTIONS"],
  ["/settings", "运行控制与安全配置", "BOT_RUNNING"],
  ["/research", "策略研究终端", "RESEARCH_ONLY"],
] as const;

function watchRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function authenticate(page: Page) {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Neural Terminal/);
  await expect(page.getByRole("heading", { name: "身份验证终端" })).toBeVisible();
  await page.getByLabel(/Access id/i).fill("qa-user");
  await page.getByLabel(/Secret key/i).fill("qa-password");
  await page.getByRole("button", { name: /Initialize secure session/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "量化机器人控制台" })).toBeVisible();
}

test("authentication and server-side security boundaries", async ({ page, request }) => {
  const runtimeErrors = watchRuntimeErrors(page);

  const unauthenticatedBff = await request.get("/api/ft/balance");
  expect(unauthenticatedBff.status()).toBe(401);
  const unauthenticatedEvents = await request.get("/api/events");
  expect(unauthenticatedEvents.status()).toBe(401);
  const protectedEndpoints = [
    ["GET", "/api/research/baseline"],
    ["GET", "/api/ai/status"],
    ["GET", "/api/audit"],
    ["GET", "/api/binance/account"],
    ["POST", "/api/ai/review"],
    ["POST", "/api/audit/decision"],
  ] as const;
  for (const [method, path] of protectedEndpoints) {
    const response = method === "GET"
      ? await request.get(path)
      : await request.post(path, { data: {} });
    expect(response.status(), `${method} ${path} should require auth`).toBe(401);
  }

  const loginResponse = await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  expect(loginResponse?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(loginResponse?.headers()["x-frame-options"]).toBe("DENY");

  await authenticate(page);

  const aiStatus = await page.evaluate(async () => {
    const response = await fetch("/api/ai/status", { credentials: "same-origin" });
    return { status: response.status, body: await response.json() };
  });
  expect(aiStatus.status).toBe(200);
  expect(aiStatus.body).toMatchObject({ read_only: true, status: "not_configured" });

  const review = await page.evaluate(async () => {
    const response = await fetch("/api/ai/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        task: "strategy_review",
        prompt_version: "strategy-review-v1",
        context: { strategy: "SimpleSpot", api_secret: "must-not-be-stored" },
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(review.status).toBe(200);
  expect(review.body).toMatchObject({ status: "not_configured", output: null });

  const auditEvent = await page.evaluate(async () => {
    const response = await fetch("/api/audit/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        event_type: "risk_check",
        payload: { allowed: true, nested: { api_token: "must-not-be-stored" } },
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(auditEvent.status).toBe(200);
  expect(auditEvent.body.status).toBe("recorded");

  const cookies = await page.context().cookies();
  for (const name of ["ft_access", "ft_refresh", "ft_user"]) {
    const cookie = cookies.find((item) => item.name === name);
    expect(cookie, `${name} cookie should exist`).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
  }
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }))).toEqual({ local: [], session: [] });

  const forbiddenRequests = [
    ["POST", "/api/ft/forceenter"],
    ["POST", "/api/ft/forceexit"],
    ["DELETE", "/api/ft/trades/1048"],
    ["POST", "/api/ft/reload_config"],
  ] as const;
  for (const [method, path] of forbiddenRequests) {
    const response = await page.evaluate(async ({ method, path }) => {
      const result = await fetch(path, { method });
      return { status: result.status, body: await result.json() };
    }, { method, path });
    expect(response.status, `${method} ${path}`).toBe(403);
    expect(response.body).toMatchObject({ error: expect.stringContaining("not allowed") });
  }

  expect(runtimeErrors.filter((error) => !error.includes("403 (Forbidden)"))).toEqual([]);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const cookiesAfterLogout = await page.context().cookies();
  for (const name of ["ft_access", "ft_refresh", "ft_user"]) {
    expect(cookiesAfterLogout.find((item) => item.name === name)).toBeUndefined();
  }
});

test("authenticated SSE and lifecycle transition are reversible", async ({ page }) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await authenticate(page);
  await expect(page.getByText("实时数据链路已连接", { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.goto("/settings");
  await expect(page.getByText("RUNNING", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "暂停新开仓" }).click();
  const pauseDialog = page.getByRole("alertdialog", { name: "确认暂停新开仓？" });
  await expect(pauseDialog).toBeVisible();
  await pauseDialog.getByRole("button", { name: "确认暂停" }).click();
  await expect(page.getByText("PAUSED", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status")).toContainText("暂停新开仓指令已由 Freqtrade 接收");

  await page.getByRole("button", { name: "恢复运行" }).click();
  const resumeDialog = page.getByRole("alertdialog", { name: "确认启动机器人？" });
  await expect(resumeDialog).toBeVisible();
  await resumeDialog.getByRole("button", { name: "确认启动" }).click();
  await expect(page.getByText("RUNNING", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status")).toContainText("启动机器人指令已由 Freqtrade 接收");

  expect(runtimeErrors).toEqual([]);
});

test("all product routes render without horizontal overflow", async ({ page }) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await authenticate(page);

  for (const [route, heading, readyText] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(readyText, { exact: true }).first()).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, `${route} document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, `${route} body overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }

  expect(runtimeErrors).toEqual([]);
});
