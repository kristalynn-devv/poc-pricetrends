import type { ItemResult } from '../utils/routeHelpers'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog, saveItems } from '../utils/logger'
import { appendResult } from '../utils/resultsStore'
import { dismissCookieBanner, createStealthContext, takeScreenshot, filterListingsByQuery, runConcurrently, preparePageForScreenshot } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'

const RDW_BASE = 'https://radiumwatch.com'

const LISTING_LINK_SELECTORS = [
  'a.woocommerce-LoopProduct-link',
  '.product-item a.product-title',
  '.products a.woocommerce-loop-product__link',
  'ul.products li.product a[href*="radiumwatch.com"]',
  'a.product-loop-title',
]

function buildFilename(index: number, url: string): string {
  const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
  const slugMatch = url.replace(/\/$/, '').match(/\/([^/]+)$/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return `${date}_103_RDW_${slug}.jpg`
}



export default defineEventHandler(async (event) => {
  const { query, categoryId = '103', template, limit, config: configRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('../utils/screenshotConfig').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'radiumwatch.com', categoryId, schemaText, mode: 'detail' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { stream, send, emit, close } = createStreamEmitter('radiumwatch')
  const geminiModel = createGeminiModel(apiKey)
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  ;(async () => {
    const browser = await launchBrowser()

    try {
      const searchUrl = `${RDW_BASE}/?s=${encodeURIComponent(query)}&post_type=product`
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
            const productPairs = pairs.filter((p) => p.url.includes('radiumwatch.com') && !p.url.includes('/?') && !p.url.includes('/product-category/'))
            if (productPairs.length > 0) {
              const unique = [...new Map(productPairs.map((p) => [p.url, p])).values()]
              const filtered = filterListingsByQuery(unique, query)
              emit('info', `Keyword filter: kept ${filtered.length}/${unique.length}`)
              listingUrls = filtered.map((p) => p.url).slice(0, limit)
              emit('info', `Found ${listingUrls.length} listings via selector`)
              break
            }
          }

          if (listingUrls.length === 0) {
            // Fallback: gather all product-looking links
            const allPairs = await page.locator('a[href]').evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })))
            const candidatePairs = allPairs.filter((p) =>
              p.url.includes('radiumwatch.com') &&
              !p.url.includes('/?') &&
              !p.url.includes('/product-category/') &&
              !p.url.includes('/cart') &&
              !p.url.includes('/checkout') &&
              !p.url.includes('/my-account') &&
              p.url.replace('https://radiumwatch.com', '').split('/').filter(Boolean).length >= 2
            )
            const unique = [...new Map(candidatePairs.map((p) => [p.url, p])).values()]
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
        close()
        await browser.close()
        return
      }

      if (listingUrls.length === 0) {
        emit('warn', 'No listing URLs found')
        await appendLog({ timestamp: new Date().toISOString(), source: 'radiumwatch', url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No listing URLs found', errorType: null }).catch(() => {})
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
          await appendLog({ timestamp: new Date().toISOString(), source: 'radiumwatch', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
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
            const dataFile = result.items.length > 0 ? await saveItems(result.items, categoryId, filename).catch(() => null) : null
            const ts = new Date().toISOString()
            await Promise.all([
              appendLog({ timestamp: ts, source: 'radiumwatch', url, categoryId, searchQuery: query, roundId, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, dataFile, error: null, errorType: null, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight }).catch(() => {}),
              appendResult({ timestamp: ts, source: 'radiumwatch', url, categoryId, screenshotFile: filename, items: result.items as Record<string, any>[], roundId, searchQuery: query }).catch((e) => emit('warn', 'appendResult failed', String(e))),
            ])
          } catch {
            result.raw = text
            result.extractOk = false
            emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            await appendLog({ timestamp: new Date().toISOString(), source: 'radiumwatch', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = (result.error ?? '') + `extract: ${msg}`
          emit('error', `[${i + 1}] Gemini failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'radiumwatch', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType: 'extraction' }).catch(() => {})
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




