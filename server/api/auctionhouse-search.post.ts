import { chromium, type Browser, type BrowserContext } from 'playwright'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog, saveItems } from '../utils/logger'
import { mergeScreenshotConfig, type ScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { appendResult } from '../utils/resultsStore'
import { dismissCookieBanner, createStealthContext, scrollForLazyContent , takeScreenshot} from '../utils/browserUtils'
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

const AH_BASE = 'https://www.auctionhouse.co.th'

const LISTING_LINK_SELECTORS = [
  'a.product-item-link',
  '.product-item-name a',
  '.product-item-info a.product-item-photo',
  '.products-grid a[href$=".html"]',
  '.search-result-container a[href$=".html"]',
  'li.product-item a[href*="auctionhouse.co.th"]',
]

function buildFilename(index: number, categoryId: string, url: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const slugMatch = url.match(/\/([^/]+)\.html/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return `${date}_${categoryId}_AUC_${slug}.jpg`
}


async function isBotPage(page: import('playwright').Page): Promise<boolean> {
  return page.locator('#lsrecaptcha-form').isVisible().catch(() => false)
}

// Navigate to URL and wait for reCAPTCHA to auto-redirect, with retry on failure
async function gotoWithBotRetry(
  page: import('playwright').Page,
  url: string,
  emit: (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => void,
  maxRetries = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(2000)

    if (!await isBotPage(page)) return true

    emit('info', `Bot page detected (attempt ${attempt}/${maxRetries}) — waiting for reCAPTCHA redirect`)
    try {
      await page.waitForURL((u) => !u.includes('/.lsrecap/'), { timeout: 20000 })
      await page.waitForTimeout(1500)
      if (!await isBotPage(page)) return true
    } catch { /* redirect timeout */ }

    if (attempt < maxRetries) {
      emit('warn', `reCAPTCHA redirect timed out — retrying in 5s`)
      await page.waitForTimeout(5000)
    }
  }
  emit('warn', `Still on bot page after ${maxRetries} attempts`)
  return false
}


// Persistent context shares cookies across requests so reCAPTCHA cookie survives between calls
const PROFILE_DIR = join(process.cwd(), 'output', 'browser-profiles', 'auctionhouse')

async function newPersistentContext(cfg: ReturnType<typeof buildScreenshotOptions>): Promise<BrowserContext> {
  await mkdir(PROFILE_DIR, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    viewport: cfg.viewport,
  })
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
  return ctx
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
  const extractPrompt = buildExtractPrompt({ siteName: 'auctionhouse.co.th', categoryId, schemaText, mode: 'detail' })

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
    const prefix = `[auctionhouse][${level.toUpperCase()}]`
    if (level === 'error') console.error(prefix, msg, data ?? '')
    else if (level === 'warn') console.warn(prefix, msg, data ?? '')
    else console.log(prefix, msg, data ?? '')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  ;(async () => {
    // Persistent context preserves reCAPTCHA cookie across pages in same request and across calls
    let ctx: BrowserContext
    let fallbackBrowser: import('playwright').Browser | null = null
    try {
      ctx = await newPersistentContext(screenshotCfg)
    } catch {
      // Profile locked by concurrent request — fall back to ephemeral browser
      fallbackBrowser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'] })
      ctx = await createStealthContext(fallbackBrowser, screenshotCfg, 'en-US')
    }

    try {
      const searchUrl = `${AH_BASE}/catalogsearch/result/?q=${encodeURIComponent(query)}`
      emit('info', `Starting search`, { query, limit })

      let listingUrls: string[] = []
      try {
        const page = await ctx.newPage()
        try {
          // Warmup: hit homepage first so reCAPTCHA cookie is obtained before search URL
          emit('info', 'Warming up via homepage')
          await gotoWithBotRetry(page, AH_BASE, emit, 3)
          await dismissCookieBanner(page)

          emit('info', `Loading search page`)
          const searchOk = await gotoWithBotRetry(page, searchUrl, emit, 3)
          if (!searchOk) emit('warn', 'Proceeding despite bot page — results may be empty')

          await dismissCookieBanner(page)
          await page.waitForTimeout(500)

          // Auto-click "show more" / next page until we have enough URLs
          const SHOW_MORE_SELECTORS = [
            'a.action.next',
            'button.action.next',
            '.pages-item-next a',
            'a[title="Next"]',
            '.toolbar-amount + .pages a.next',
            'li.item.pages-item-next a',
          ]

          // Split query into keywords for strict post-filter matching
          const queryKeywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

          const collectUrlsWithTitles = async (): Promise<{ url: string; title: string }[]> => {
            const collected = new Map<string, string>() // url -> title

            for (const sel of LISTING_LINK_SELECTORS) {
              const items = await page.locator(sel).evaluateAll((els) =>
                (els as HTMLAnchorElement[]).map((a) => ({ href: a.href, title: (a.textContent ?? a.title ?? '').trim() })).filter((x) => x.href)
              )
              const productItems = items.filter(({ href: h }) =>
                h.includes('auctionhouse.co.th') &&
                h.endsWith('.html') &&
                !h.includes('/catalogsearch/') &&
                !h.includes('/customer/') &&
                !h.includes('/category/') &&
                !/\.(co\.th)\/(th|en)\/?$/.test(h)
              )
              productItems.forEach(({ href, title }) => { if (!collected.has(href)) collected.set(href, title) })
              if (collected.size > 0) break
            }

            // Fallback: restrict to main content area only
            if (collected.size === 0) {
              const mainItems = await page.locator(
                '.column.main a[href$=".html"], #maincontent a[href$=".html"], .search-result-container a[href$=".html"]'
              ).evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => ({ href: a.href, title: (a.textContent ?? '').trim() })))
              mainItems
                .filter(({ href: h }) =>
                  h.includes('auctionhouse.co.th') &&
                  !h.includes('/catalogsearch/') &&
                  !h.includes('/customer/') &&
                  !h.includes('/category/')
                )
                .forEach(({ href, title }) => { if (!collected.has(href)) collected.set(href, title) })
              emit(collected.size > 0 ? 'info' : 'warn', `Fallback (main content): ${collected.size} URLs`)
            }

            return [...collected.entries()].map(([url, title]) => ({ url, title }))
          }

          const filterByKeywords = (items: { url: string; title: string }[]): { url: string; title: string }[] => {
            const filtered = items.filter(({ url, title }) => {
              const haystack = (title + ' ' + url).toLowerCase()
              return queryKeywords.every((kw) => haystack.includes(kw))
            })
            const dropped = items.length - filtered.length
            if (dropped > 0) emit('info', `Keyword filter: kept ${filtered.length}/${items.length} (dropped ${dropped} non-matching)`)
            return filtered
          }

          // First pass
          let foundWithTitles = await collectUrlsWithTitles()
          foundWithTitles = filterByKeywords(foundWithTitles)
          emit('info', `Page 1: ${foundWithTitles.length} URLs (after keyword filter)`)
          let found = foundWithTitles.map((x) => x.url)
          found.forEach((u) => listingUrls.includes(u) || listingUrls.push(u))

          // Paginate until we have enough
          let page_n = 1
          while (listingUrls.length < limit && page_n < 5) {
            let clicked = false
            for (const sel of SHOW_MORE_SELECTORS) {
              try {
                const btn = page.locator(sel).first()
                if (await btn.isVisible({ timeout: 1000 })) {
                  await btn.click()
                  await page.waitForTimeout(2000)
                  await dismissCookieBanner(page)
                  clicked = true
                  break
                }
              } catch { /* selector not found */ }
            }
            if (!clicked) break

            page_n++
            let more = await collectUrlsWithTitles()
            more = filterByKeywords(more)
            const before = listingUrls.length
            more.map((x) => x.url).forEach((u) => listingUrls.includes(u) || listingUrls.push(u))
            emit('info', `Page ${page_n}: +${listingUrls.length - before} URLs (total ${listingUrls.length})`)
            if (listingUrls.length === before) break // no new URLs — stop
          }

          listingUrls = listingUrls.slice(0, limit)

          if (listingUrls.length === 0) {
            emit('warn', 'No URLs found — may be blocked by bot protection')
            const buf = await takeScreenshot(page, screenshotCfg)
            const b64 = buf.toString('base64')
            await mkdir(screenshotDir, { recursive: true })
            const fname = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${categoryId}_AUC_searchpage.jpg`
            await writeFile(join(screenshotDir, fname), buf)
            send({ type: 'searchpage', base64: b64 })
            send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No listing URLs found — bot protection may be active' })
            ctrl.close()
            await ctx.close().catch(() => {})
            return
          }
        } finally {
          await page.close().catch(() => {})
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        emit('error', `Search page failed`, { msg })
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg })
        ctrl.close()
        await ctx.close().catch(() => {})
        return
      }

      emit('info', `Processing ${listingUrls.length} listings`)
      await mkdir(screenshotDir, { recursive: true })

      for (let i = 0; i < listingUrls.length; i++) {
        const url = listingUrls[i]
        const filename = buildFilename(i, categoryId, url)
        const result: ItemResult = { index: i, url, filename: null, base64: null, screenshotOk: false, extractOk: false, items: [] }
        results.push(result)

        emit('info', `[${i + 1}/${listingUrls.length}] Screenshot`, { url })
        const itemStart = Date.now()
        let base64 = ''

        try {
          const page = await ctx.newPage()
          try {
            await gotoWithBotRetry(page, url, emit, 3)
            await dismissCookieBanner(page)

            // Expand hidden description by removing CSS max-height constraint
            await page.evaluate(() => {
              const content = document.querySelector<HTMLElement>('.js_detailed-content')
              if (content) { content.style.maxHeight = 'none'; content.style.overflow = 'visible' }
              const btnWrapper = document.querySelector<HTMLElement>('.detailed-button-wrapper')
              if (btnWrapper) btnWrapper.style.display = 'none'
            })
            await page.waitForTimeout(300)

            // Extract structured data directly from HTML (no Gemini vision needed)
            const extracted = await page.evaluate(() => {
              const data: Record<string, string> = {}

              // Price — keep digits and dot so decimal is preserved before rounding
              const priceEl = document.querySelector('.price-wrapper .price, [data-price-type="finalPrice"] .price')
              if (priceEl) {
                const raw = priceEl.textContent?.replace(/[^\d.]/g, '') ?? ''
                if (raw) data.price = String(Math.round(parseFloat(raw)))
                data.currency = 'THB'
              }

              // Attributes table
              document.querySelectorAll('#product-attribute-specs-table tr').forEach((tr) => {
                const label = tr.querySelector('.label')?.textContent?.trim() ?? ''
                const value = tr.querySelector('.data')?.textContent?.trim() ?? ''
                if (label && value) data[label] = value
              })

              // Description intentionally omitted — verbose, data already in table above

              return data
            })

            emit('info', `[${i + 1}] Extracted ${Object.keys(extracted).length} fields from HTML`)

            // Map Thai attribute labels to English field names
            const LABEL_MAP: Record<string, string> = {
              'แบรนด์': 'brand', 'รุ่น': 'model', 'รหัสสินค้า': 'ref',
              'อุปกรณ์เสริม': 'accessories', 'วิธีการจัดส่ง': 'delivery',
              'สภาพสินค้า': 'condition', 'ปี': 'year',
              'เส้นผ่าศูนย์กลางหน้าปัด': 'caseSize', 'ฟังก์ชั่นนาฬิกา': 'functions',
              'วัสดุกรอบหน้าปัด': 'bezelMaterial', 'วัสดุสาย': 'strapMaterial',
              'สีหน้าปัด': 'dialColor', 'สไตล์': 'style',
              'วัสดุตัวเรือน': 'caseMaterial', 'ระบบ': 'movement',
            }
            const item: Record<string, string> = {}
            for (const [k, v] of Object.entries(extracted)) {
              const mapped = LABEL_MAP[k] ?? k
              item[mapped] = v
            }
            result.items = [item]
            result.extractOk = true

            // Screenshot for reference
            await page.evaluate(() => window.scrollTo(0, 0))
            await scrollForLazyContent(page)
            const buffer = await takeScreenshot(page, screenshotCfg)
            base64 = buffer.toString('base64')
            await writeFile(join(screenshotDir, filename), buffer)
            result.filename = filename
            result.base64 = base64
            result.screenshotOk = true
            emit('info', `[${i + 1}] Screenshot saved`, { filename })

            const dataFile = result.items.length > 0 ? await saveItems(result.items, categoryId, filename).catch(() => null) : null
            const ts = new Date().toISOString()
            await Promise.all([
              appendLog({ timestamp: ts, source: 'auctionhouse', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, dataFile, error: null, errorType: null }).catch(() => {}),
              appendResult({ timestamp: ts, source: 'auctionhouse', url, categoryId, screenshotFile: filename, items: result.items as Record<string, any>[], roundId, searchQuery: query }).catch(() => {}),
            ])
          } finally {
            await page.close()
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = `extract: ${msg}`
          emit('error', `[${i + 1}] Failed`, { msg })
          const isTimeout = msg.includes('timeout') || msg.includes('Timeout')
          await appendLog({ timestamp: new Date().toISOString(), source: 'auctionhouse', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
        }

        send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
      }

      await ctx.close().catch(() => {})
      await fallbackBrowser?.close().catch(() => {})

      const summary = { total: results.length, screenshotOk: results.filter((r) => r.screenshotOk).length, extractOk: results.filter((r) => r.extractOk).length }
      emit('info', `Done`, summary)
      send({ type: 'done', query, summary })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit('error', 'Unexpected error', { msg })
      send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg })
      await ctx.close().catch(() => {})
      await fallbackBrowser?.close().catch(() => {})
    } finally {
      ctrl.close()
    }
  })()

  return sendStream(event, stream)
})




