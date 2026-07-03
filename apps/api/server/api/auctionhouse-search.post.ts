import type { Browser, BrowserContext } from 'playwright'
import { chromium } from 'playwright'
import type { ItemResult } from '#shared/types/item'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'
import { apiError, classifyError } from '../utils/errors'
import { persistExtraction } from '../utils/persistExtraction'
import type { ScreenshotConfig } from '#shared/types/screenshot'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { dismissCookieBanner, createStealthContext, applyStealthScripts, takeScreenshot, runConcurrently, preparePageForScreenshot, humanizeMouse, jitterDelay, VARIANT_MODIFIER_WORDS } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'
import { buildScreenshotFilename } from '../utils/filename'
import { sanitizeItems } from '../utils/sanitize'

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
  const slugMatch = url.match(/\/([^/]+)\.html/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return buildScreenshotFilename(categoryId, 'AUC', slug)
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
    await jitterDelay(1500, 3000)
    await humanizeMouse(page)

    if (!await isBotPage(page)) return true

    emit('info', `Bot page detected (attempt ${attempt}/${maxRetries}) — waiting for reCAPTCHA redirect`)
    try {
      await page.waitForURL((u) => !u.includes('/.lsrecap/'), { timeout: 20000 })
      await jitterDelay(1000, 2000)
      if (!await isBotPage(page)) return true
    } catch { /* redirect timeout */ }

    if (attempt < maxRetries) {
      emit('warn', `reCAPTCHA redirect timed out — retrying in 5s`)
      await jitterDelay(4000, 7000)
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
  await applyStealthScripts(ctx)
  return ctx
}



defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search auctionhouse.co.th',
    description: 'Scrapes a auctionhouse.co.th listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 103/106/107/108/109/110/111/112. Response is a stream of NDJSON lines (application/x-ndjson).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'search keywords' },
              categoryId: { type: 'string', description: "defaults to the route's primary category (103)" },
              template: { type: 'object', additionalProperties: { type: 'string' }, description: 'custom field schema, overrides categoryId defaults' },
              limit: { type: 'number', description: 'max listing items to process (default varies per route)' },
              screenshotConfig: { type: 'object', description: 'viewport/quality/clip overrides' },
              roundId: { type: 'string', description: 'groups multiple queries/sources under one batch run' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'NDJSON stream: one JSON object per line, type is log|result|searchpage|done',
        content: { 'application/x-ndjson': { schema: { type: 'string' } } },
      },
      400: { description: 'missing/empty query' },
      500: { description: 'Gemini API key not configured' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const { query, categoryId = '103', template, limit, config: configRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('#shared/types/screenshot').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!query?.trim()) throw apiError(400, 'config', 'query required')

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw apiError(500, 'config', 'GEMINI_API_KEY not configured')

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'auctionhouse.co.th', categoryId, schemaText, mode: 'detail' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { stream, send, emit, close } = createStreamEmitter('auctionhouse')
  const geminiModel = createGeminiModel(apiKey)
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
      fallbackBrowser = await launchBrowser()
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
          await jitterDelay(1200, 2500)

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
          const queryKeywordSet = new Set(queryKeywords)

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
              if (!queryKeywords.every((kw) => haystack.includes(kw))) return false
              const haystackWords = haystack.split(/[^a-z0-9]+/).filter(Boolean)
              return !haystackWords.some((w) => VARIANT_MODIFIER_WORDS.has(w) && !queryKeywordSet.has(w))
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
            const fname = buildScreenshotFilename(categoryId, 'AUC', 'searchpage')
            await writeFile(join(screenshotDir, fname), buf)
            send({ type: 'searchpage', base64: b64 })
            await appendLog({ timestamp: new Date().toISOString(), source: 'auctionhouse', url: searchUrl, categoryId, searchQuery: query, roundId, durationMs: 0, httpStatus: 404, screenshotFile: fname, error: 'No listing URLs found — bot protection may be active', errorType: 'notfound' }).catch(() => {})
            send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No listing URLs found — bot protection may be active', errorType: 'notfound' })
            close()
            await ctx.close().catch(() => {})
            return
          }
        } finally {
          await page.close().catch(() => {})
        }
      } catch (err) {
        const { errorType, message: msg } = classifyError(err, 'screenshot')
        emit('error', `Search page failed`, { msg })
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg, errorType })
        close()
        await ctx.close().catch(() => {})
        return
      }

      emit('info', `Processing ${listingUrls.length} listings`)
      await mkdir(screenshotDir, { recursive: true })

      await runConcurrently(listingUrls.map((url, i) => async () => {
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

            await page.evaluate(() => {
              const content = document.querySelector<HTMLElement>('.js_detailed-content')
              if (content) { content.style.maxHeight = 'none'; content.style.overflow = 'visible' }
              const btnWrapper = document.querySelector<HTMLElement>('.detailed-button-wrapper')
              if (btnWrapper) btnWrapper.style.display = 'none'
            })

            await preparePageForScreenshot(page)
            const buffer = await takeScreenshot(page, screenshotCfg)
            base64 = buffer.toString('base64')
            await writeFile(join(screenshotDir, filename), buffer)
            result.filename = filename
            result.base64 = base64
            result.screenshotOk = true
            emit('info', `[${i + 1}] Screenshot saved`, { filename })

            emit('info', `[${i + 1}] Extracting with Gemini`)
            const { text, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight } = await callGemini(geminiModel, extractPrompt, base64)
            try {
              result.items = sanitizeItems(JSON.parse(text))
              result.extractOk = true
              emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
            } catch {
              result.raw = text
              emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            }

            const ts = new Date().toISOString()
await persistExtraction({
  timestamp: ts, source: 'auctionhouse', url, categoryId, screenshotFile: filename,
  items: result.items as Record<string, any>[], durationMs: Date.now() - itemStart,
  searchQuery: query, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
}).catch(() => {})
          } finally {
            await page.close()
          }
        } catch (err) {
          const { errorType, message: msg } = classifyError(err, 'screenshot')
          result.error = `extract: ${msg}`
          emit('error', `[${i + 1}] Failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'auctionhouse', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: errorType === 'timeout' ? 504 : 500, screenshotFile: null, error: msg, errorType }).catch(() => {})
        }

        send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
      }), 2)

      await ctx.close().catch(() => {})
      await fallbackBrowser?.close().catch(() => {})

      const summary = { total: results.length, screenshotOk: results.filter((r) => r.screenshotOk).length, extractOk: results.filter((r) => r.extractOk).length }
      emit('info', `Done`, summary)
      send({ type: 'done', query, summary })
    } catch (err) {
      const { errorType, message: msg } = classifyError(err, 'screenshot')
      emit('error', 'Unexpected error', { msg })
      send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg, errorType })
      await ctx.close().catch(() => {})
      await fallbackBrowser?.close().catch(() => {})
    } finally {
      close()
    }
  })()

  return sendStream(event, stream)
})




