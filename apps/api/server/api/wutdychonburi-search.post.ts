import type { ItemResult } from '#shared/types/item'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { apiError, classifyError } from '../utils/errors'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'
import { persistExtraction } from '../utils/persistExtraction'
import { createStealthContext, dismissCookieBanner, takeScreenshot, filterListingsByQuery, runConcurrently, preparePageForScreenshot } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'
import { buildScreenshotFilename } from '../utils/filename'

const WDC_BASE = 'https://wutdychonburi.com'

function buildFilename(index: number): string {
  return buildScreenshotFilename('106', 'WDC', String(index + 1).padStart(2, '0'))
}



async function getDetailLinks(page: import('playwright').Page): Promise<{ url: string; title: string }[]> {
  const pairs = await page.locator('a[href*="detail.php?id="]').evaluateAll(
    (els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' }))
  )
  return [...new Map(pairs.map((p) => [p.url, p])).values()]
}

/** Search by keyword; returns up to `limit` detail URLs filtered by query */
async function searchDetailUrls(page: import('playwright').Page, query: string, limit: number, emit: (l: 'info' | 'warn' | 'error', m: string, d?: unknown) => void): Promise<string[]> {
  const searchUrl = `${WDC_BASE}/search.php?search=${encodeURIComponent(query)}`
  emit('info', `Searching`, { url: searchUrl })
  await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(2000)
  await dismissCookieBanner(page)
  const pairs = await getDetailLinks(page)
  const filtered = filterListingsByQuery(pairs, query)
  emit('info', `Keyword filter: kept ${filtered.length}/${pairs.length}`)
  emit('info', `Search returned ${filtered.length} links`)
  return filtered.map((p) => p.url).slice(0, limit)
}

/** Fallback: loop listing pages, keeping only items matching `query`, until we have `limit` URLs */
async function listingDetailUrls(page: import('playwright').Page, query: string, limit: number, emit: (l: 'info' | 'warn' | 'error', m: string, d?: unknown) => void): Promise<string[]> {
  const collected: { url: string; title: string }[] = []
  let pageNum = 1
  const MAX_PAGES = 20

  while (collected.length < limit && pageNum <= MAX_PAGES) {
    const listingUrl = `${WDC_BASE}/product.php?menu=product-all&page=${pageNum}`
    emit('info', `Scanning listing page ${pageNum}`, { url: listingUrl })
    await page.goto(listingUrl, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(1500)
    await dismissCookieBanner(page)

    const links = await getDetailLinks(page)
    if (links.length === 0) { emit('info', `No more products at page ${pageNum}`); break }

    const matched = filterListingsByQuery(links, query)
    for (const link of matched) {
      if (collected.length >= limit) break
      collected.push(link)
    }
    emit('info', `Page ${pageNum}: ${links.length} links, ${matched.length} match query, collected ${collected.length}`)
    pageNum++
  }

  return collected.slice(0, limit).map((p) => p.url)
}


defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search wutdychonburi.com',
    description: 'Scrapes a wutdychonburi.com listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 106. Response is a stream of NDJSON lines (application/x-ndjson).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'search keywords' },
              categoryId: { type: 'string', description: "defaults to the route's primary category (106)" },
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
  const { query, categoryId = '106', template, limit, config: configRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('#shared/types/screenshot').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!query?.trim()) throw apiError(400, 'config', 'query required')

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw apiError(500, 'config', 'GEMINI_API_KEY not configured')

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'wutdychonburi.com', categoryId, schemaText, mode: 'listing' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { stream, send, emit, close } = createStreamEmitter('wutdychonburi')
  const geminiModel = createGeminiModel(apiKey)
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  ;(async () => {
    const browser = await launchBrowser()

    try {
      emit('info', `Starting`, { query, limit })
      await mkdir(screenshotDir, { recursive: true })

      const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        locale: 'th-TH',
        extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7' },
        viewport: screenshotCfg.viewport,
      })
      await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
      const page = await ctx.newPage()

      try {
        // Search first; fall back to listing pages if no results
        let detailUrls = await searchDetailUrls(page, query, limit, emit)
        if (detailUrls.length === 0) {
          emit('info', 'Search returned nothing, falling back to listing pages')
          detailUrls = await listingDetailUrls(page, query, limit, emit)
        }

        if (detailUrls.length === 0) {
          emit('warn', 'No product links found')
          await appendLog({ timestamp: new Date().toISOString(), source: 'wutdychonburi', url: `${WDC_BASE}/product.php?menu=product-all&page=1`, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No product links found', errorType: 'notfound' }).catch(() => {})
          send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No product links found', errorType: 'notfound' })
          await ctx.close()
          return
        }

        emit('info', `Processing ${detailUrls.length} items`)
        await page.close()

        await runConcurrently(detailUrls.map((url, i) => async () => {
          const filename = buildFilename(i)
          const result: ItemResult = { index: i, url, filename: null, base64: null, screenshotOk: false, extractOk: false, items: [] }
          results.push(result)

          const itemStart = Date.now()
          emit('info', `[${i + 1}/${detailUrls.length}] Loading`, { url })

          const itemCtx = await createStealthContext(browser, screenshotCfg, 'th-TH')
          const itemPage = await itemCtx.newPage()
          try {
            await itemPage.goto(url, { waitUntil: 'load', timeout: 30000 })
            await itemPage.waitForTimeout(1500)
            await preparePageForScreenshot(itemPage)
            const buffer = await takeScreenshot(itemPage, screenshotCfg)
            const base64 = buffer.toString('base64')
            await writeFile(join(screenshotDir, filename), buffer)
            result.filename = filename
            result.base64 = base64
            result.screenshotOk = true
            emit('info', `[${i + 1}] Screenshot saved`, { filename })

            emit('info', `[${i + 1}] Extracting with Gemini`)
            try {
                            const { text, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight } = await callGemini(geminiModel, extractPrompt, base64)
              try {
                result.items = sanitizeItems(JSON.parse(text))
                result.extractOk = true
                emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
                const ts = new Date().toISOString()
await persistExtraction({
  timestamp: ts, source: 'wutdychonburi', url, categoryId, screenshotFile: filename,
  items: result.items as Record<string, any>[], durationMs: Date.now() - itemStart,
  searchQuery: query, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
}).catch((e) => emit('warn', 'persistExtraction failed', String(e)))
              } catch {
                result.raw = text
                result.extractOk = false
                emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
                await appendLog({ timestamp: new Date().toISOString(), source: 'wutdychonburi', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
              }
            } catch (err) {
              const { errorType, message: msg } = classifyError(err, 'extraction')
              result.error = `extract: ${msg}`
              emit('error', `[${i + 1}] Gemini failed`, { msg })
              await appendLog({ timestamp: new Date().toISOString(), source: 'wutdychonburi', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType }).catch(() => {})
            }
          } catch (err) {
            const { errorType, message: msg } = classifyError(err, 'screenshot')
            result.error = `screenshot: ${msg}`
            emit('error', `[${i + 1}] Failed`, { msg })
            await appendLog({ timestamp: new Date().toISOString(), source: 'wutdychonburi', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: errorType === 'timeout' ? 504 : 500, screenshotFile: null, error: msg, errorType }).catch(() => {})
          } finally {
            await itemCtx.close()
          }

          send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
        }), 3)

        await ctx.close()
      } catch (err) {
        await ctx.close().catch(() => {})
        throw err
      }

      await browser.close()
      const summary = { total: results.length, screenshotOk: results.filter((r) => r.screenshotOk).length, extractOk: results.filter((r) => r.extractOk).length }
      emit('info', `Done`, summary)
      send({ type: 'done', query, summary })
    } catch (err) {
      const { errorType, message: msg } = classifyError(err, 'screenshot')
      emit('error', 'Unexpected error', { msg })
      send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg, errorType })
      await browser.close().catch(() => {})
    } finally {
      close()
    }
  })()

  return sendStream(event, stream)
})




