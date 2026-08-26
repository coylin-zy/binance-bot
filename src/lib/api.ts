export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body && typeof body.error === "string"
      ? body.error
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return body as T;
}

export async function postApi<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: body === undefined ? { Accept: "application/json" } : {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload && typeof payload.error === "string"
      ? payload.error
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}
