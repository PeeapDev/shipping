"use client";

function getAuthToken(): string | null {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/peeap_token=([^;]+)/);
    if (match) return match[1];
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("peeap_auth_token");
  }
  return null;
}

export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const token = getAuthToken();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPut<T = any>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await apiFetch(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
