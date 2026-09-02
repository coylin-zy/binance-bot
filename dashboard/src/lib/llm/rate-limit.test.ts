import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLlmRateLimit, resetLlmRateLimitForTests } from "./rate-limit";

afterEach(() => {
  resetLlmRateLimitForTests();
  vi.useRealTimers();
});

describe("LLM request rate limit", () => {
  it("allows twenty requests and rejects the next request", () => {
    for (let index = 0; index < 20; index += 1) expect(checkLlmRateLimit("qa").allowed).toBe(true);
    expect(checkLlmRateLimit("qa").allowed).toBe(false);
  });

  it("opens a new window after sixty seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    for (let index = 0; index < 20; index += 1) checkLlmRateLimit("qa");
    vi.advanceTimersByTime(60_001);
    expect(checkLlmRateLimit("qa")).toEqual({ allowed: true });
  });
});
