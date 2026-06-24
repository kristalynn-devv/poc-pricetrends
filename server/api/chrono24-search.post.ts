import { chromium, type Browser, type BrowserContext } from 'playwright'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog, saveItems, extractDomain } from '../utils/logger'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { appendResult } from '../utils/resultsStore'
import { dismissCookieBanner, createStealthContext, scrollForLazyContent , takeScreenshot, filterListingsByQuery} from '../utils/browserUtils'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'

interface ItemResult {
  index: number
  url: string
  filename: string | null
  base64: string | null
  screenshotOk: boolean
  extractOk: boolean
  items: unknown[]
  raw?: string
  error?: string
}

const CHRONO24_BASE = 'https://www.chrono24.com'

const LISTING_LINK_SELECTORS = [
  'article a[href*="--id"]',
  '[data-article-id] a',
  '.article-item a',
  'a[href*=".htm"][href*="chrono24.com"]',
]

function buildFilename(index: number, url: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const idMatch = url.match(/--id(\d+)/)
  const articleId = idMatch ? idMatch[1] : `pos${String(index + 1).padStart(2, '0')}`
  return `${date}_103_CHR_${articleId}.jpg`
}



export default defineEventHandler(async (event) => {
  const { query, categoryId = '103', template, limit, screenshotConfig: screenshotConfigRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('../utils/screenshotConfig').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(screenshotConfigRaw))

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'chrono24.com', categoryId, schemaText, mode: 'listing' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController
  const stream = new ReadableStream({ start(c) { ctrl = c } })

  const send = (data: object) => {
    try { ctrl.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch { }
  }

  const emit = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => {
    send({ type: 'log', ts: new Date().toISOString(), level, msg, ...(data !== undefined ? { data } : {}) })
    const prefix = `[chrono24][${level.toUpperCase()}]`
    if (level === 'error') console.error(prefix, msg, data ?? '')
    else if (level === 'warn') console.warn(prefix, msg, data ?? '')
    else console.log(prefix, msg, data ?? '')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  ;(async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      const searchUrl = `${CHRONO24_BASE}/search/index.htm?query=${encodeURIComponent(query)}&dosearch=1`
      emit('info', `Starting search`, { query, limit })

      let listingUrls: string[] = []
      try {
        const ctx = await createStealthContext(browser, screenshotCfg, 'en-US')
        const page = await ctx.newPage()
        try {
          emit('info', `Loading search page`)
          await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
          await page.waitForTimeout(3000)
          await dismissCookieBanner(page)
          await page.waitForTimeout(500)

          for (const sel of LISTING_LINK_SELECTORS) {
            const pairs = await page.locator(sel).evaluateAll((els) =>
              (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })).filter((p) => Boolean(p.url))
            )
            const productPairs = pairs.filter((p) => p.url.includes('chrono24.com') && (p.url.includes('--id') || p.url.includes('/watches/')))
            if (productPairs.length > 0) {
              const unique = [...new Map(productPairs.map((p) => [p.url, p])).values()]
              const filtered = filterListingsByQuery(unique, query)
              emit('info', `Keyword filter: kept ${filtered.length}/${unique.length}`)
              listingUrls = filtered.map((p) => p.url).slice(0, limit)
              emit('info', `Found ${listingUrls.length} listings`)
              break
            }
          }

          if (listingUrls.length === 0) {
            const allPairs = await page.locator('a[href]').evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })))
            const unique = [...new Map(allPairs.filter((p) => p.url.includes('chrono24.com') && p.url.includes('--id')).map((p) => [p.url, p])).values()]
            const filtered = filterListingsByQuery(unique, query)
            emit('info', `Keyword filter: kept ${filtered.length}/${unique.length}`)
            listingUrls = filtered.map((p) => p.url).slice(0, limit)
            emit(listingUrls.length > 0 ? 'info' : 'warn', `Fallback scan: ${listingUrls.length} URLs`)
          }
        } finally {
          await ctx.close()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        emit('error', `Search page failed`, { msg })
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg })
        ctrl.close()
        await browser.close()
        return
      }

      if (listingUrls.length === 0) {
        emit('warn', 'No listing URLs found - may be blocked')
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No listing URLs found' })
        ctrl.close()
        await browser.close()
        return
      }

      emit('info', `Processing ${listingUrls.length} listings`)
      await mkdir(screenshotDir, { recursive: true })

      for (let i = 0; i < listingUrls.length; i++) {
        const url = listingUrls[i]
        const filename = buildFilename(i, url)
        const result: ItemResult = { index: i, url, filename: null, base64: null, screenshotOk: false, extractOk: false, items: [] }
        results.push(result)

        emit('info', `[${i + 1}/${listingUrls.length}] Screenshot`, { url })
        const itemStart = Date.now()
        let base64 = ''

        try {
          const ctx = await createStealthContext(browser, screenshotCfg, 'en-US')
          const page = await ctx.newPage()
          try {
            await page.goto(url, { waitUntil: 'load', timeout: 30000 })
            await page.waitForTimeout(2500)
            await dismissCookieBanner(page)
            await page.mouse.move(0, 0)
            await page.waitForTimeout(300)
            await scrollForLazyContent(page)
            const buffer = await takeScreenshot(page, screenshotCfg)
            base64 = buffer.toString('base64')
            await writeFile(join(screenshotDir, filename), buffer)
            result.filename = filename
            result.base64 = base64
            result.screenshotOk = true
            emit('info', `[${i + 1}] Screenshot saved`, { filename })
          } finally {
            await ctx.close()
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = `screenshot: ${msg}`
          emit('error', `[${i + 1}] Screenshot failed`, { msg })
          const isTimeout = msg.includes('timeout') || msg.includes('Timeout')
          await appendLog({ timestamp: new Date().toISOString(), source: 'chrono24', url, categoryId, searchQuery: query, roundId, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, dataFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
          send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
          continue
        }

        emit('info', `[${i + 1}] Extracting with Gemini`)
        try {
          const geminiResult = await geminiModel.generateContent([extractPrompt, { inlineData: { data: base64, mimeType: 'image/jpeg' } }])
          const text = geminiResult.response.text().trim()
          try {
            result.items = sanitizeItems(JSON.parse(text))
            result.extractOk = true
            emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
            const ts = new Date().toISOString()
            const dataFile = result.items.length > 0
              ? await saveItems(result.items, categoryId, filename).catch(() => null)
              : null
            await Promise.all([
              appendLog({ timestamp: ts, source: extractDomain(url), url, categoryId, searchQuery: query, roundId, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, dataFile, error: null, errorType: null }).catch(() => {}),
              appendResult({ timestamp: ts, source: 'chrono24', url, categoryId, screenshotFile: filename, items: result.items as Record<string, any>[], roundId, searchQuery: query }).catch(() => {}),
            ])
          } catch {
            result.raw = text
            result.extractOk = false
            emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            await appendLog({ timestamp: new Date().toISOString(), source: 'chrono24', url, categoryId, searchQuery: query, roundId, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, dataFile: null, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = (result.error ?? '') + `extract: ${msg}`
          emit('error', `[${i + 1}] Gemini failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'chrono24', url, categoryId, searchQuery: query, roundId, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, dataFile: null, error: msg, errorType: 'extraction' }).catch(() => {})
        }

        send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
      }

      await browser.close()

      const summary = { total: results.length, screenshotOk: results.filter((r) => r.screenshotOk).length, extractOk: results.filter((r) => r.extractOk).length }
      emit('info', `Done`, summary)
      send({ type: 'done', query, summary })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit('error', 'Unexpected error', { msg })
      send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg })
      await browser.close().catch(() => {})
    } finally {
      ctrl.close()
    }
  })()

  return sendStream(event, stream)
})




