import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped flag so search routes can tell they were invoked by /api/sourcecheck
 * (via the internal ?sourceCheck=1 query param, set in server/middleware/sourceCheckContext.ts)
 * without every route file having to thread the flag through manually.
 */
const als = new AsyncLocalStorage<boolean>()

export function markSourceCheckRequest(): void {
  als.enterWith(true)
}

export function isSourceCheckRequest(): boolean {
  return als.getStore() === true
}
