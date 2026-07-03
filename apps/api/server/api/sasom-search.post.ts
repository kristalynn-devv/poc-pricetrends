import type { ItemResult } from '#shared/types/item'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { apiError, classifyError } from '../utils/errors'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'
import { persistExtraction } from '../utils/persistExtraction'
import { createStealthContext, dismissCookieBanner, takeScreenshot, filterListingsByQuery, runConcurrently, preparePageForScreenshot, VARIANT_MODIFIER_WORDS } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'
import { buildScreenshotFilename } from '../utils/filename'

const SASOM_BASE = 'https://sasom.co.th'

function buildFilename(index: number, url: string): string {
  const slugMatch = url.replace(/[?#].*$/, '').replace(/\/$/, '').match(/\/([^/]+)$/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return buildScreenshotFilename('108', 'SAS', slug)
}




defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search sasom.co.th',
    description: 'Scrapes a sasom.co.th listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 108/110. Response is a stream of NDJSON lines (application/x-ndjson).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'search keywords' },
              categoryId: { type: 'string', description: "defaults to the route's primary category (108)" },
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
  const { query, categoryId = '108', template, limit, config: configRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('#shared/types/screenshot').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!query?.trim()) throw apiError(400, 'config', 'query required')

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw apiError(500, 'config', 'GEMINI_API_KEY not configured')

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'sasom.co.th', categoryId, schemaText, mode: 'listing' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { stream, send, emit, close } = createStreamEmitter('sasom')
  const geminiModel = createGeminiModel(apiKey)
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  ;(async () => {
    const browser = await launchBrowser()

    try {
      emit('info', `Starting search`, { query, categoryId, limit })
      const searchUrl = `${SASOM_BASE}/th/shop?query=${encodeURIComponent(query)}&sortby=products_aggregate_trending&type=ask`

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
          emit('info', `Loading search page`, { searchUrl })
          await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
          await page.waitForTimeout(2000)
          await dismissCookieBanner(page)

          // Collect product links — sasom /th/<category>/<slug> pattern
          const allHrefPairs = await page.locator('a[href]').evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })))
          const productUrlRe = /sasom\.co\.th\/(?:th\/)?[^/?#]+\/\d[^/?#]*\/[^/?#]+-[^/?#]+/i
          const allProductPairs = [...new Map(allHrefPairs.filter((p) => productUrlRe.test(p.url)).map((p) => [p.url, p])).values()]
          emit('info', `Raw product URLs on page`, { count: allProductPairs.length })

          const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
          const queryTermSet = new Set(queryTerms)
          const slugMatched = allProductPairs.filter((p) => {
            const slug = decodeURIComponent(p.url).toLowerCase()
            if (!queryTerms.every((t) => slug.includes(t))) return false
            const slugWords = slug.split(/[^a-z0-9]+/).filter(Boolean)
            return !slugWords.some((w) => VARIANT_MODIFIER_WORDS.has(w) && !queryTermSet.has(w))
          })
          const titleFiltered = filterListingsByQuery(allProductPairs, query)
          const matched = slugMatched.length > 0 ? slugMatched : titleFiltered
          emit('info', `Keyword filter: kept ${matched.length}/${allProductPairs.length}`)
          emit('info', `Filtered URLs`, { matched: matched.length, total: allProductPairs.length })
          listingUrls = matched.map((p) => p.url).slice(0, limit)
        } finally {
          await ctx.close()
        }
      } catch (err) {
        const { errorType, message: msg } = classifyError(err, 'screenshot')
        emit('error', `Search page failed`, { msg })
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: msg, errorType })
        close()
        await browser.close()
        return
      }

      if (listingUrls.length === 0) {
        emit('warn', 'No listing URLs found')
        await appendLog({ timestamp: new Date().toISOString(), source: 'sasom', url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No listing URLs found', errorType: 'notfound' }).catch(() => {})
        send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No listing URLs found', errorType: 'notfound' })
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
          const ctx = await createStealthContext(browser, screenshotCfg, 'th-TH')
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
          const { errorType, message: msg } = classifyError(err, 'screenshot')
          result.error = `screenshot: ${msg}`
          emit('error', `[${i + 1}] Screenshot failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'sasom', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: errorType === 'timeout' ? 504 : 500, screenshotFile: null, error: msg, errorType }).catch(() => {})
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
  timestamp: ts, source: 'sasom', url, categoryId, screenshotFile: filename,
  items: result.items as Record<string, any>[], durationMs: Date.now() - itemStart,
  searchQuery: query, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
}).catch((e) => emit('warn', 'persistExtraction failed', String(e)))
          } catch {
            result.raw = text
            result.extractOk = false
            emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            await appendLog({ timestamp: new Date().toISOString(), source: 'sasom', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
          }
        } catch (err) {
          const { errorType, message: msg } = classifyError(err, 'extraction')
          result.error = (result.error ?? '') + `extract: ${msg}`
          emit('error', `[${i + 1}] Gemini failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'sasom', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType }).catch(() => {})
        }

        send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
      }), 3)

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




