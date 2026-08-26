interface RateEntry {
  attempts: number;
  lockedUntil: number;
}

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

const rateMap = new Map<string, RateEntry>();

export function checkRateLimit(ip: string): { allowed: boolean; remainingLockMs?: number } {
  const entry = rateMap.get(ip);
  if (!entry) return { allowed: true };
  if (Date.now() < entry.lockedUntil) {
    return { allowed: false, remainingLockMs: entry.lockedUntil - Date.now() };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
    rateMap.set(ip, entry);
    return { allowed: false, remainingLockMs: LOCK_DURATION_MS };
  }
  return { allowed: true };
}

export function recordFailedAttempt(ip: string) {
  const entry = rateMap.get(ip) ?? { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
  }
  rateMap.set(ip, entry);
}

export function resetAttempts(ip: string) {
  rateMap.delete(ip);
}
