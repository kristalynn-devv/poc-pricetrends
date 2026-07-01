import type { ItemResult } from '#shared/types/item'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'
import { persistExtraction } from '../utils/persistExtraction'
import { createStealthContext, takeScreenshot, filterListingsByQuery, runConcurrently, preparePageForScreenshot } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildSchema, buildExtractPrompt } from '../utils/extractPrompt'
import { buildScreenshotFilename } from '../utils/filename'

const SEARCH_BASE = 'https://www.kaidee.com'

function buildFilename(index: number): string {
  return buildScreenshotFilename('107', 'KAI', String(index + 1).padStart(2, '0'))
}


export default defineEventHandler(async (event) => {
  const { query, categoryId = '107', template, limit, config: configRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('#shared/types/screenshot').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'kaidee.com', categoryId, schemaText, mode: 'listing' })

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { stream, send, emit, close } = createStreamEmitter('kaidee')
  const geminiModel = createGeminiModel(apiKey)
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []

  // Category-specific browse URL for cat 111 (เครื่องมือช่าง); generic browse for others
  const searchUrl = categoryId === '111'
    ? `${SEARCH_BASE}/c296-appliances_decoration-accessories_and_tool_suppliers?q=${encodeURIComponent(query)}`
    : `${SEARCH_BASE}/browse?q=${encodeURIComponent(query)}&suggest=1`

  ;(async () => {
    const browser = await launchBrowser()

    try {
      emit('info', `Starting search`, { query, limit, url: searchUrl })
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
        emit('info', `Loading search page`, { url: searchUrl })
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
        await page.waitForTimeout(3000)

        // Collect product links: kaidee product URLs are /product-XXXXXXX
        const allPairs = await page.locator('a[href*="/product-"]').evaluateAll(
          (els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' })).filter((p) => /\/product-\d+/.test(p.url))
        )
        const uniquePairs = [...new Map(allPairs.map((p) => [p.url, p])).values()]
        const filtered = filterListingsByQuery(uniquePairs, query)
        emit('info', `Keyword filter: kept ${filtered.length}/${uniquePairs.length}`)
        const detailUrls = filtered.map((p) => p.url).slice(0, limit)
        emit('info', `Found ${uniquePairs.length} product links, processing ${detailUrls.length}`)

        if (detailUrls.length === 0) {
          emit('warn', 'No product links found')
          await appendLog({ timestamp: new Date().toISOString(), source: 'kaidee', url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No product links found', errorType: null }).catch(() => {})
          send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No product links found' })
                    await ctx.close()
          await browser.close()
          return
        }

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
            await itemPage.waitForTimeout(2000)
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
  timestamp: ts, source: 'kaidee', url, categoryId, screenshotFile: filename,
  items: result.items as Record<string, any>[], durationMs: Date.now() - itemStart,
  searchQuery: query, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
}).catch((e) => emit('warn', 'persistExtraction failed', String(e)))
              } catch {
                result.raw = text
                result.extractOk = false
                emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
                await appendLog({ timestamp: new Date().toISOString(), source: 'kaidee', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              result.error = `extract: ${msg}`
              emit('error', `[${i + 1}] Gemini failed`, { msg })
              await appendLog({ timestamp: new Date().toISOString(), source: 'kaidee', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType: 'extraction' }).catch(() => {})
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            result.error = `screenshot: ${msg}`
            emit('error', `[${i + 1}] Failed`, { msg })
            const isTimeout = msg.includes('timeout') || msg.includes('Timeout')
            await appendLog({ timestamp: new Date().toISOString(), source: 'kaidee', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
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




