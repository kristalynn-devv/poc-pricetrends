import type { Page } from 'playwright'
import type { ItemResult } from '#shared/types/item'
import { mergeScreenshotConfig, buildScreenshotOptions } from './screenshotConfig'
import { apiError, classifyError } from './errors'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from './logger'
import { persistExtraction } from './persistExtraction'
import { createStealthContext, dismissCookieBanner, takeScreenshot, filterListingsByQuery, runConcurrently, preparePageForScreenshot } from './browserUtils'
import { callGemini } from './geminiClient'
import { buildSchema, buildExtractPrompt } from './extractPrompt'
import { buildScreenshotFilename } from './filename'
import { sanitizeItems } from './sanitize'

/**
 * Config for the "simple" batch-search route shape: no bot protection, no persistent
 * browser/cookie reuse, no pagination, single CSS-selector listing scrape.
 * Only what genuinely varies per site should live here — everything else (stream wiring,
 * screenshot->extract->sanitize->persist loop, concurrency, error handling) lives in
 * defineSearchRoute() below. See kaidee-search.post.ts / moppet-search.post.ts for the
 * reference shape this was extracted from.
 */
export interface SearchRouteConfig {
  /** Used in emit/log/persist `source` field and stream emitter name, e.g. 'kaidee' */
  sourceKey: string
  /** Domain name used in the Gemini prompt, e.g. 'kaidee.com' */
  siteName: string
  /** 3-letter code used in screenshot filenames, e.g. 'KAI' */
  sourceCode: string
  /** Default categoryId when request body omits one, e.g. '107' */
  defaultCategoryId: string
  /** Build the URL to navigate to for the listing/search page */
  buildSearchUrl(query: string, categoryId: string): string
  /** CSS selector for listing/product links on the search page */
  linkSelector: string
  /** Optional extra filter applied to the raw href before keyword filtering */
  linkFilter?: (url: string) => boolean
  /** Label used in log/emit messages, e.g. 'product' | 'listing' | 'auction'. Default 'product'. */
  linkLabel?: string
  /** Extract prompt mode. Default 'listing'. */
  mode?: 'listing' | 'detail'
  /** Extra instruction text appended to the Gemini prompt */
  extraPromptText?: string
  /** Locale for stealth contexts. Default 'th-TH'. */
  locale?: 'th-TH' | 'en-US'
  /** Wait after loading the search page, before collecting links. Default 3000ms. */
  searchPageWaitMs?: number
  /** Wait after loading an item detail page, before preparing for screenshot. Default 2000ms. */
  itemWaitMs?: number
  /** Whether to call dismissCookieBanner() explicitly on the search page. Default false. */
  dismissBannerOnSearchPage?: boolean
  /** Runs after the search page has loaded + waited, before collecting links (e.g. fill+submit a search box). */
  beforeCollectLinks?: (page: Page, query: string) => Promise<void>
  /** Runs on the item detail page after goto+wait, before preparePageForScreenshot (e.g. hide an element). */
  beforeScreenshot?: (page: Page) => Promise<void>
}

export function defineSearchRoute(config: SearchRouteConfig) {
  const {
    sourceKey, siteName, sourceCode, defaultCategoryId,
    buildSearchUrl, linkSelector, linkFilter, linkLabel = 'product',
    mode = 'listing', extraPromptText, locale = 'th-TH',
    searchPageWaitMs = 3000, itemWaitMs = 2000,
    dismissBannerOnSearchPage = false, beforeCollectLinks, beforeScreenshot,
  } = config

  function buildFilename(index: number, categoryId: string): string {
    return buildScreenshotFilename(categoryId, sourceCode, String(index + 1).padStart(2, '0'))
  }

  return defineEventHandler(async (event) => {
    const { query, categoryId = defaultCategoryId, template, limit, config: configRaw, roundId } = await readBody<{
      query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('#shared/types/screenshot').ScreenshotConfig; roundId?: string
    }>(event)
    const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

    if (!query?.trim()) throw apiError(400, 'config', 'query required')

    const runtimeConfig = useRuntimeConfig()
    const apiKey = runtimeConfig.geminiApiKey
    if (!apiKey) throw apiError(500, 'config', 'GEMINI_API_KEY not configured')

    const schemaText = buildSchema(categoryId, template)
    const extractPrompt = buildExtractPrompt({ siteName, categoryId, schemaText, mode, ...(extraPromptText ? { extra: extraPromptText } : {}) })

    setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
    setResponseHeader(event, 'Cache-Control', 'no-cache')
    setResponseHeader(event, 'X-Accel-Buffering', 'no')

    const { stream, send, emit, close } = createStreamEmitter(sourceKey)
    const geminiModel = createGeminiModel(apiKey)
    const screenshotDir = join(process.cwd(), 'output', 'screenshots')
    const results: ItemResult[] = []

    const searchUrl = buildSearchUrl(query, categoryId)

    ;(async () => {
      const browser = await launchBrowser()

      try {
        emit('info', `Starting search`, { query, limit, url: searchUrl })
        await mkdir(screenshotDir, { recursive: true })

        const ctx = await createStealthContext(browser, screenshotCfg, locale)
        const page = await ctx.newPage()

        try {
          emit('info', `Loading search page`, { url: searchUrl })
          await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
          await page.waitForTimeout(searchPageWaitMs)
          if (dismissBannerOnSearchPage) await dismissCookieBanner(page)

          if (beforeCollectLinks) await beforeCollectLinks(page, query)

          const allPairs = await page.locator(linkSelector).evaluateAll(
            (els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' }))
          )
          const rawFiltered = linkFilter ? allPairs.filter((p) => linkFilter(p.url)) : allPairs
          const uniquePairs = [...new Map(rawFiltered.map((p) => [p.url, p])).values()]
          const filtered = filterListingsByQuery(uniquePairs, query)
          emit('info', `Keyword filter: kept ${filtered.length}/${uniquePairs.length}`)
          const detailUrls = filtered.map((p) => p.url).slice(0, limit)
          emit('info', `Found ${uniquePairs.length} ${linkLabel} links, processing ${detailUrls.length}`)

          if (detailUrls.length === 0) {
            emit('warn', `No ${linkLabel} links found`)
            await appendLog({ timestamp: new Date().toISOString(), source: sourceKey, url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: `No ${linkLabel} links found`, errorType: 'notfound' }).catch(() => {})
            send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: `No ${linkLabel} links found`, errorType: 'notfound' })
            await ctx.close()
            await browser.close()
            return
          }

          await page.close()

          await runConcurrently(detailUrls.map((url, i) => async () => {
            const filename = buildFilename(i, categoryId)
            const result: ItemResult = { index: i, url, filename: null, base64: null, screenshotOk: false, extractOk: false, items: [] }
            results.push(result)

            const itemStart = Date.now()
            emit('info', `[${i + 1}/${detailUrls.length}] Loading`, { url })

            const itemCtx = await createStealthContext(browser, screenshotCfg, locale)
            const itemPage = await itemCtx.newPage()
            try {
              await itemPage.goto(url, { waitUntil: 'load', timeout: 30000 })
              await itemPage.waitForTimeout(itemWaitMs)
              if (beforeScreenshot) await beforeScreenshot(itemPage)
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
                  result.items = sanitizeItems(JSON.parse(text)) as Record<string, unknown>[]
                  result.extractOk = true
                  emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
                  const ts = new Date().toISOString()
                  await persistExtraction({
                    timestamp: ts, source: sourceKey, url, categoryId, screenshotFile: filename,
                    items: result.items as Record<string, any>[], durationMs: Date.now() - itemStart,
                    searchQuery: query, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
                  }).catch((e) => emit('warn', 'persistExtraction failed', String(e)))
                } catch {
                  result.raw = text
                  result.extractOk = false
                  emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
                  await appendLog({ timestamp: new Date().toISOString(), source: sourceKey, url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
                }
              } catch (err) {
                const { errorType, message: msg } = classifyError(err, 'extraction')
                result.error = `extract: ${msg}`
                emit('error', `[${i + 1}] Gemini failed`, { msg })
                await appendLog({ timestamp: new Date().toISOString(), source: sourceKey, url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType }).catch(() => {})
              }
            } catch (err) {
              const { errorType, message: msg } = classifyError(err, 'screenshot')
              result.error = `screenshot: ${msg}`
              emit('error', `[${i + 1}] Failed`, { msg })
              await appendLog({ timestamp: new Date().toISOString(), source: sourceKey, url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: errorType === 'timeout' ? 504 : 500, screenshotFile: null, error: msg, errorType }).catch(() => {})
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
}
