export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

let sessionRedirectInProgress = false;

function redirectExpiredSession() {
  if (typeof window === "undefined" || sessionRedirectInProgress || window.location.pathname === "/login") return;
  sessionRedirectInProgress = true;
  void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", keepalive: true })
    .finally(() => window.location.replace("/login?reason=session-expired"));
}

function ensureSuccessfulResponse(response: Response, body: unknown) {
  if (response.ok) return;
  if (response.status === 401) redirectExpiredSession();
  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : `Request failed (${response.status})`;
  throw new ApiError(response.status, message);
}

export async function apiFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);

  ensureSuccessfulResponse(response, body);

  return body as T;
}

export async function postApi<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: body === undefined ? { Accept: "application/json" } : {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  ensureSuccessfulResponse(response, payload);

  return payload as T;
}
