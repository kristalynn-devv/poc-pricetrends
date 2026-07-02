/**
 * Nitro's `routeRules: { '/api/**': { cors: true } }` adds CORS response headers,
 * but does NOT short-circuit the OPTIONS preflight request itself — routes defined
 * with method-suffixed files (e.g. `foo.post.ts`) only register a handler for POST,
 * so a browser's OPTIONS preflight 405s and the whole cross-origin request fails.
 * This middleware answers OPTIONS directly before the router tries to match a method.
 */
export default defineEventHandler((event) => {
  if (getMethod(event) !== 'OPTIONS') return
  if (!getRequestURL(event).pathname.startsWith('/api/')) return

  setResponseHeader(event, 'Access-Control-Allow-Origin', getHeader(event, 'origin') ?? '*')
  setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  setResponseHeader(event, 'Access-Control-Allow-Headers', getHeader(event, 'access-control-request-headers') ?? '*')
  setResponseHeader(event, 'Access-Control-Max-Age', '600')
  setResponseStatus(event, 204)
  return ''
})
