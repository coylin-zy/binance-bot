export const ALLOWED_ENDPOINTS: Record<string, Set<string>> = {
  GET: new Set([
    "balance",
    "profit",
    "daily",
    "weekly",
    "monthly",
    "status",
    "trades",
    "show_config",
    "whitelist",
    "health",
    "version",
  ]),
  POST: new Set(["pair_candles", "pause", "stop", "start"]),
};

export function isAllowed(method: string, path: string): boolean {
  const allowed = ALLOWED_ENDPOINTS[method];
  if (!allowed) return false;
  const root = path.split("/")[0];
  return allowed.has(root);
}
