import { SEARCH_ROUTES, SEARCH_ROUTE_CATEGORY, type SearchRouteKey } from '#shared/constants/searchRoutes'
import type { BacktestResult } from '#shared/types/backtest'
import type { StreamEvent } from '#shared/types/stream'

/** Query ตัวอย่างต่อหมวด ใช้เป็น input จริงตอนรัน backtest */
const BACKTEST_QUERIES: Record<string, string> = {
  '103': 'Rolex',
  '106': 'พระสมเด็จ',
  '107': 'iPhone',
  '108': 'Louis Vuitton',
  '111': 'Bosch',
}

const BACKTEST_TIMEOUT_MS = 60_000

export async function runSourceBacktest(source: SearchRouteKey, baseUrl: string): Promise<BacktestResult> {
  const path = SEARCH_ROUTES[source]
  const categoryId = SEARCH_ROUTE_CATEGORY[path]
  const query = BACKTEST_QUERIES[categoryId] ?? 'test'
  const start = Date.now()
  const result: BacktestResult = {
    source, categoryId, query, pass: false,
    productsFound: 0, screenshotOk: 0, extractOk: 0,
    durationMs: 0, error: null, timestamp: new Date().toISOString(),
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKTEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
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

export async function runAllBacktests(baseUrl: string, concurrency = 3): Promise<BacktestResult[]> {
  const sources = Object.keys(SEARCH_ROUTES) as SearchRouteKey[]
  const results: BacktestResult[] = new Array(sources.length)
  let i = 0
  async function worker() {
    while (i < sources.length) {
      const idx = i++
      const source = sources[idx]
      if (source) results[idx] = await runSourceBacktest(source, baseUrl)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
