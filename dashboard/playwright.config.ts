import { defineConfig, devices } from "@playwright/test";

const dashboardPort = 3100;
const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: dashboardUrl,
    colorScheme: "dark",
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run qa:mock",
      url: "http://127.0.0.1:18080/api/v1/show_config",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run start",
      url: `${dashboardUrl}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        HOSTNAME: "127.0.0.1",
        PORT: String(dashboardPort),
        FREQTRADE_URL: "http://127.0.0.1:18080",
        FREQTRADE_WS_TOKEN: "qa-websocket-token",
        FREQTRADE_TIMEOUT_MS: "3000",
      },
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
