export async function fetchJson<T = any>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.error || "Falha na comunicacao com o servidor.") as Error & {
      payload?: any;
      retryAfterSeconds?: number;
      status?: number;
    };
    error.payload = payload;
    error.retryAfterSeconds = Number(payload?.retry_after_seconds || response.headers.get("Retry-After") || 0);
    error.status = response.status;
    throw error;
  }
  return payload as T;
}
