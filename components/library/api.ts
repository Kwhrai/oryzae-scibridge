export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((data as { error?: string }).error || "リクエストに失敗しました") as Error & { code?: string };
    error.code = (data as { code?: string }).code;
    throw error;
  }
  return data as T;
}
