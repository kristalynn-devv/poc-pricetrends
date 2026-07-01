import { createError } from 'h3'
import type { LogErrorType } from '#shared/types/log'

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function isTimeoutError(err: unknown): boolean {
  const msg = errorMessage(err)
  return /timeout/i.test(msg) || (err instanceof Error && err.name === 'TimeoutError')
}

/** Classify a caught error into the standard errorType, upgrading to 'timeout' when detected. */
export function classifyError(err: unknown, fallback: LogErrorType): { errorType: LogErrorType; message: string } {
  return { errorType: isTimeoutError(err) ? 'timeout' : fallback, message: errorMessage(err) }
}

/** Standard API error shape: statusCode + errorType + message, consistent across all routes. */
export function apiError(statusCode: number, errorType: LogErrorType, message: string) {
  return createError({ statusCode, statusMessage: message, data: { errorType, message } })
}
