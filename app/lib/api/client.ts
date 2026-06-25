import { API_PATHS, withQuery } from '#shared/api/paths'

/** Resolve API path with optional base URL (empty = same-origin). */
export function apiUrl(path: string, apiBase = ''): string {
  if (!apiBase) return path
  const base = apiBase.replace(/\/$/, '')
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
}

export async function apiFetch(path: string, init?: RequestInit, apiBase = ''): Promise<Response> {
  return fetch(apiUrl(path, apiBase), init)
}

export async function apiJson<T>(path: string, init?: RequestInit, apiBase = ''): Promise<T> {
  const res = await apiFetch(path, init, apiBase)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export { API_PATHS, withQuery }
