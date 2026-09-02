interface LlmRateEntry {
  startedAt: number;
  count: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const entries = new Map<string, LlmRateEntry>();

export function checkLlmRateLimit(identity: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const current = entries.get(identity);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    entries.set(identity, { startedAt: now, count: 1 });
    return { allowed: true };
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1_000) };
  }
  current.count += 1;
  return { allowed: true };
}

export function resetLlmRateLimitForTests() {
  entries.clear();
}
