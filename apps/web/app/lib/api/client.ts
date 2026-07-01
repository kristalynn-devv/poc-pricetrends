import { API_PATHS, withQuery } from '#shared/api/paths'
import type { LogErrorType } from '#shared/types/log'

/** Thrown by apiJson on non-ok responses; carries the backend's standard error shape. */
export class ApiClientError extends Error {
  statusCode: number
  errorType: LogErrorType

  constructor(statusCode: number, errorType: LogErrorType, message: string) {
    super(message)
    this.name = 'ApiClientError'
    this.statusCode = statusCode
    this.errorType = errorType
  }
}

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
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { data?: { errorType?: LogErrorType; message?: string }; message?: string } | null
    const errorType = body?.data?.errorType ?? null
    const message = body?.data?.message ?? body?.message ?? `HTTP ${res.status}`
    throw new ApiClientError(res.status, errorType, message)
  }
  return res.json() as Promise<T>
}

export { API_PATHS, withQuery }
