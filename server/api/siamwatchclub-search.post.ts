import type { ItemResult } from '#shared/types/item'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'
import { persistExtraction } from '../utils/persistExtraction'
import { sanitizeItems } from '../utils/sanitize'
import { dismissCookieBanner, createStealthContext, takeScreenshot, filterListingsByQuery, runConcurrently, preparePageForScreenshot } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'
import { buildScreenshotFilename } from '../utils/filename'

const SWC_BASE = 'https://www.siamwatchclub.com'

const LISTING_LINK_SELECTORS = [
  'a.woocommerce-LoopProduct-link',
  '.products a.woocommerce-loop-product__link',
  'ul.products li.product a[href*="siamwatchclub.com/product"]',
  '.product-item a[href*="/product/"]',
  'a[href*="/product/"]',
]

function buildFilename(index: number, url: string): string {
  const slugMatch = url.replace(/\/$/, '').match(/\/([^/]+)$/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return buildScreenshotFilename('103', 'SWC', slug)
}



export default defineEventHandler(async (event) => {
  const { query, categoryId = '103', template, limit, config: configRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('#shared/types/screenshot').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'siamwatchclub.com', categoryId, schemaText, mode: 'listing' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { stream, send, emit, close } = createStreamEmitter('siamwatchclub')
  const geminiModel = createGeminiModel(apiKey)
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  ;(async () => {
    const browser = await launchBrowser()

    try {
      const brandSlug = query.trim().toLowerCase().replace(/\s+/g, '-')
      const brandUrl = `${SWC_BASE}/en/brand/${encodeURIComponent(brandSlug)}/`
      const fallbackUrl = `${SWC_BASE}/en/?s=${encodeURIComponent(query)}&post_type=product`
      emit('info', `Starting search`, { query, limit })

      let listingUrls: string[] = []
      try {
        const ctx = await createStealthContext(browser, screenshotCfg, 'en-US')
        const page = await ctx.newPage()
        try {
            const scrapeListingPage = async (url: string): Promise<{ url: string; title: string }[]> => {
            await page.goto(url, { waitUntil: 'load', timeout: 30000 })
            await page.waitForTimeout(3000)
            await dismissCookieBanner(page)
            await page.waitForTimeout(500)

            for (const sel of LISTING_LINK_SELECTORS) {
              const pairs = await page.locator(sel).evaluateAll((els) =>
                (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })).filter((p) => Boolean(p.url))
              )
              const productPairs = pairs.filter((p) => p.url.includes('siamwatchclub.com') && p.url.includes('/product/'))
              if (productPairs.length > 0) return [...new Map(productPairs.map((p) => [p.url, p])).values()]
            }

            const allPairs = await page.locator('a[href]').evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })))
            const filtered = allPairs.filter((p) =>
              p.url.includes('siamwatchclub.com') &&
              p.url.includes('/product/') &&
              !p.url.includes('/product-category/') &&
              !p.url.includes('/cart') &&
              !p.url.includes('/checkout') &&
              !p.url.includes('/my-account')
            )
            return [...new Map(filtered.map((p) => [p.url, p])).values()]
          }

          emit('info', `Loading brand page`, { url: brandUrl })
          let found = await scrapeListingPage(brandUrl)
          if (found.length === 0) {
            emit('warn', `Brand page empty, trying search fallback`, { url: fallbackUrl })
            found = await scrapeListingPage(fallbackUrl)
          }
          const filtered = filterListingsByQuery(found, query)
          emit('info', `Keyword filter: kept ${filtered.length}/${found.length}`)
          listingUrls = filtered.map((p) => p.url).slice(0, limit)
          emit(listingUrls.length > 0 ? 'info' : 'warn', `Found ${listingUrls.length} listings`)
        } finally {
          await ctx.close()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        emit('error', `Search page failed`, { msg })
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg })
        close()
        await browser.close()
        return
      }

      if (listingUrls.length === 0) {
        emit('warn', 'No listing URLs found')
        await appendLog({ timestamp: new Date().toISOString(), source: 'siamwatchclub', url: brandUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No listing URLs found', errorType: null }).catch(() => {})
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No listing URLs found' })
        close()
        await browser.close()
        return
      }

      emit('info', `Processing ${listingUrls.length} listings`)
      await mkdir(screenshotDir, { recursive: true })

      await runConcurrently(listingUrls.map((url, i) => async () => {
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
            await preparePageForScreenshot(page)
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
          await appendLog({ timestamp: new Date().toISOString(), source: 'siamwatchclub', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
          send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
          return
        }

        emit('info', `[${i + 1}] Extracting with Gemini`)
        try {
          const { text, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight } = await callGemini(geminiModel, extractPrompt, base64)
          try {
            result.items = sanitizeItems(JSON.parse(text))
            result.extractOk = true
            emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
            const ts = new Date().toISOString()
await persistExtraction({
  timestamp: ts, source: 'siamwatchclub', url, categoryId, screenshotFile: filename,
  items: result.items as Record<string, any>[], durationMs: Date.now() - itemStart,
  searchQuery: query, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
}).catch((e) => emit('warn', 'persistExtraction failed', String(e)))
          } catch {
            result.raw = text
            result.extractOk = false
            emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            await appendLog({ timestamp: new Date().toISOString(), source: 'siamwatchclub', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = (result.error ?? '') + `extract: ${msg}`
          emit('error', `[${i + 1}] Gemini failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'siamwatchclub', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType: 'extraction' }).catch(() => {})
        }

        send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
      }), 3)

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
      close()
    }
  })()

  return sendStream(event, stream)
})




