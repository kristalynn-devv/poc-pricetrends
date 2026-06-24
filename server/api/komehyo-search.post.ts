import { chromium } from 'playwright'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog, saveItems } from '../utils/logger'
import { appendResult } from '../utils/resultsStore'
import { dismissCookieBanner, scrollForLazyContent , takeScreenshot, filterListingsByQuery} from '../utils/browserUtils'
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

const KMH_BASE = 'https://www.komehyo.co.th'
const KMH_LIST = `${KMH_BASE}/th/product-list/`

// product_type filter per category (omit = search all types)
const CATEGORY_PRODUCT_TYPE: Record<string, string> = {
  '103': '2725', // นาฬิกา
}

// Search box selectors in order of preference
const SEARCH_INPUT_SELECTORS = [
  'input[placeholder*="ค้นหา"]',
  'input[name="keyword"]',
  'input[name="q"]',
  'input[name="search"]',
  'input[type="search"]',
  '.search-box input',
  'header input',
]

function buildFilename(index: number, url: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const slugMatch = url.replace(/\/$/, '').match(/\/([^/]+)$/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return `${date}_103_KMH_${slug}.jpg`
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
  const extractPrompt = buildExtractPrompt({ siteName: 'komehyo.co.th', categoryId, schemaText, mode: 'detail' })

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
    const prefix = `[komehyo][${level.toUpperCase()}]`
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
      emit('info', `Starting search`, { query, categoryId, limit })
      const productType = CATEGORY_PRODUCT_TYPE[categoryId]
      const startUrl = productType ? `${KMH_LIST}?product_type=${productType}` : KMH_LIST
      let searchUrl = startUrl

      let listingUrls: string[] = []
      try {
        const ctx = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          locale: 'th-TH',
          extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7' },
          viewport: screenshotCfg.viewport,
        })
        await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
        const page = await ctx.newPage()
        try {
          emit('info', `Loading product-list page`, { startUrl })
          await page.goto(startUrl, { waitUntil: 'load', timeout: 30000 })
          await page.waitForTimeout(2000)
          await dismissCookieBanner(page)

          // Find and use the search box
          let searched = false
          for (const sel of SEARCH_INPUT_SELECTORS) {
            try {
              const input = page.locator(sel).first()
              if (await input.isVisible({ timeout: 1000 })) {
                await input.click()
                await input.fill(query)
                await page.waitForTimeout(300)
                await page.keyboard.press('Enter')
                await page.waitForLoadState('load', { timeout: 20000 })
                await page.waitForTimeout(2000)
                searchUrl = page.url()
                emit('info', `Searched via input`, { sel, resultUrl: searchUrl })
                searched = true
                break
              }
            } catch { }
          }

          if (!searched) {
            // Fallback: try URL with keyword param directly
            searchUrl = `${KMH_LIST}?keyword=${encodeURIComponent(query)}`
            emit('warn', `Search box not found, trying URL param`, { url: searchUrl })
            await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
            await page.waitForTimeout(2000)
          }

          await dismissCookieBanner(page)
          await page.waitForTimeout(500)

          // Collect product links — require numeric product ID in path
          const productUrlRe = /\/th\/product\/\d+/
          const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
          const allPairs = await page.locator('a[href]').evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })))
          const allProductPairs = [...new Map(allPairs.filter((p) =>
            p.url.includes('komehyo.co.th') && productUrlRe.test(p.url)
          ).map((p) => [p.url, p])).values()]
          emit('info', `Raw product URLs on page`, { count: allProductPairs.length })

          // Filter by query terms appearing in the URL slug (existing behaviour) + title via filterListingsByQuery
          const slugMatched = allProductPairs.filter((p) => {
            const slug = p.url.toLowerCase()
            return queryTerms.every((t) => slug.includes(t))
          })
          const filtered = filterListingsByQuery(allProductPairs, query)
          // Use slug filter if it yields results, otherwise fall back to title+url filter
          const finalMatched = slugMatched.length > 0 ? slugMatched : filtered
          emit('info', `Keyword filter: kept ${finalMatched.length}/${allProductPairs.length}`)
          listingUrls = finalMatched.slice(0, limit).map((p) => p.url)
          emit(listingUrls.length > 0 ? 'info' : 'warn', `Filtered to ${listingUrls.length} URLs (total=${allProductPairs.length})`)
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
        emit('warn', 'No listing URLs found')
        await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No listing URLs found', errorType: null }).catch(() => {})
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
          const ctx = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            locale: 'th-TH',
            extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7' },
            viewport: screenshotCfg.viewport,
          })
          await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
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
          await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
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
            const dataFile = result.items.length > 0 ? await saveItems(result.items, categoryId, filename).catch(() => null) : null
            const ts = new Date().toISOString()
            await Promise.all([
              appendLog({ timestamp: ts, source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, dataFile, error: null, errorType: null }).catch(() => {}),
              appendResult({ timestamp: ts, source: 'komehyo', url, categoryId, screenshotFile: filename, items: result.items as Record<string, any>[], roundId, searchQuery: query }).catch((e) => emit('warn', 'appendResult failed', String(e))),
            ])
          } catch {
            result.raw = text
            result.extractOk = false
            emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = (result.error ?? '') + `extract: ${msg}`
          emit('error', `[${i + 1}] Gemini failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType: 'extraction' }).catch(() => {})
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




