import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, recordFailedAttempt, resetAttempts } from "./rate-limit";

const TEST_IP = "203.0.113.7";

afterEach(() => {
  resetAttempts(TEST_IP);
  vi.useRealTimers();
});

describe("login rate limit", () => {
  it("locks after five failed attempts", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) recordFailedAttempt(TEST_IP);

    const result = checkRateLimit(TEST_IP);
    expect(result.allowed).toBe(false);
    expect(result.remainingLockMs).toBeGreaterThan(0);
  });

  it("allows a new attempt after the lock expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00Z"));
    for (let attempt = 0; attempt < 5; attempt += 1) recordFailedAttempt(TEST_IP);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(checkRateLimit(TEST_IP)).toEqual({ allowed: true });
    expect(checkRateLimit(TEST_IP)).toEqual({ allowed: true });
  });

  it("clears failures after a successful login", () => {
    recordFailedAttempt(TEST_IP);
    resetAttempts(TEST_IP);

    expect(checkRateLimit(TEST_IP)).toEqual({ allowed: true });
  });
});
