import { SEARCH_ROUTES, SEARCH_ROUTE_CATEGORY, type SearchRouteKey } from '#shared/constants/searchRoutes'
import type { SourceCheckResult } from '#shared/types/sourcecheck'
import type { StreamEvent } from '#shared/types/stream'

/** Query ตัวอย่างต่อหมวด ใช้เป็น input จริงตอนตรวจ source */
const SOURCECHECK_QUERIES: Record<string, string> = {
  '103': 'Rolex',
  '106': 'พระสมเด็จ',
  '107': 'iPhone',
  '108': 'Louis Vuitton',
  '111': 'Bosch',
}

const SOURCECHECK_TIMEOUT_MS = 60_000

export async function runSourceCheck(source: SearchRouteKey, baseUrl: string): Promise<SourceCheckResult> {
  const path = SEARCH_ROUTES[source]
  const categoryId = SEARCH_ROUTE_CATEGORY[path]
  const query = SOURCECHECK_QUERIES[categoryId] ?? 'test'
  const start = Date.now()
  const result: SourceCheckResult = {
    source, categoryId, query, pass: false,
    productsFound: 0, screenshotOk: 0, extractOk: 0,
    durationMs: 0, error: null, timestamp: new Date().toISOString(),
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SOURCECHECK_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}${path}?sourceCheck=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, categoryId, limit: 1 }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      result.error = `HTTP ${res.status}`
      return result
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let doneError: string | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        let evt: StreamEvent
        try { evt = JSON.parse(line) } catch { continue }
        if (evt.type === 'result') {
          result.productsFound++
          if (evt.screenshotOk) result.screenshotOk++
          if (evt.extractOk) result.extractOk++
        } else if (evt.type === 'done' && evt.error) {
          doneError = evt.error
        }
      }
    }

    result.pass = result.productsFound > 0 && result.screenshotOk > 0 && !doneError
    result.error = doneError ?? (result.productsFound === 0 ? 'ไม่พบสินค้า (selector หรือหน้าเว็บอาจเปลี่ยน)' : null)
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  } finally {
    clearTimeout(timeout)
    result.durationMs = Date.now() - start
  }
  return result
}

export async function runAllSourceChecks(baseUrl: string, concurrency = 1): Promise<SourceCheckResult[]> {
  const sources = Object.keys(SEARCH_ROUTES) as SearchRouteKey[]
  const results: SourceCheckResult[] = new Array(sources.length)
  let i = 0
  async function worker() {
    while (i < sources.length) {
      const idx = i++
      const source = sources[idx]
      if (source) results[idx] = await runSourceCheck(source, baseUrl)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
