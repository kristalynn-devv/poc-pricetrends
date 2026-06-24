import { chromium } from 'playwright'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog, saveItems } from '../utils/logger'
import { appendResult } from '../utils/resultsStore'
import { scrollForLazyContent , takeScreenshot, filterListingsByQuery} from '../utils/browserUtils'
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

const SEARCH_URL = 'https://uauction.uamulet.com/AuctionUClubTopList.aspx'

function buildFilename(index: number): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${date}_106_UAU_${String(index + 1).padStart(2, '0')}.jpg`
}


export default defineEventHandler(async (event) => {
  const { query, categoryId = '106', template, limit, screenshotConfig: screenshotConfigRaw, roundId } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number; screenshotConfig?: import('../utils/screenshotConfig').ScreenshotConfig; roundId?: string}>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(screenshotConfigRaw))

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  const schemaText = buildSchema(categoryId, template)
  const extractPrompt = buildExtractPrompt({ siteName: 'uauction.uamulet.com', categoryId, schemaText, mode: 'listing', extra: 'ราคาในหน้านี้คือราคาประมูล ให้ดึงราคาปัจจุบันหรือราคาสูงสุดของการประมูล' })

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
    const prefix = `[uauction][${level.toUpperCase()}]`
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
      emit('info', `Starting search`, { query, limit, url: SEARCH_URL })
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
        emit('info', `Loading search page`, { url: SEARCH_URL })
        await page.goto(SEARCH_URL, { waitUntil: 'load', timeout: 30000 })
        await page.waitForTimeout(1500)

        // Fill search box and submit
        await page.fill('#txtSearch', query)
        await page.click('#btnSearch')
        await page.waitForTimeout(2000)

        // Collect AuctionDetail links — may be on uauction.uamulet.com or uauction2.uamulet.com
        const allPairs = await page.locator('a[href*="AuctionDetail.aspx"]').evaluateAll(
          (els) => (els as HTMLAnchorElement[]).map((a) => ({ url: a.href, title: a.textContent?.trim() ?? '' }))
        )
        const uniquePairs = [...new Map(allPairs.map((p) => [p.url, p])).values()]
        const filtered = filterListingsByQuery(uniquePairs, query)
        emit('info', `Keyword filter: kept ${filtered.length}/${uniquePairs.length}`)
        const detailUrls = filtered.map((p) => p.url).slice(0, limit)
        emit('info', `Found ${uniquePairs.length} auction links, processing ${detailUrls.length}`)

        if (detailUrls.length === 0) {
          emit('warn', 'No auction links found')
          await appendLog({ timestamp: new Date().toISOString(), source: 'uauction', url: SEARCH_URL, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, error: 'No auction links found', errorType: null }).catch(() => {})
          send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No auction links found' })
                    await ctx.close()
          await browser.close()
          return
        }

        for (let i = 0; i < detailUrls.length; i++) {
          const url = detailUrls[i]
          const filename = buildFilename(i)
          const result: ItemResult = { index: i, url, filename: null, base64: null, screenshotOk: false, extractOk: false, items: [] }
          results.push(result)

          const itemStart = Date.now()
          emit('info', `[${i + 1}/${detailUrls.length}] Loading`, { url })

          try {
            await page.goto(url, { waitUntil: 'load', timeout: 30000 })
            await page.waitForTimeout(2000)

            await page.mouse.move(0, 0)
            await scrollForLazyContent(page)
            const buffer = await takeScreenshot(page, screenshotCfg)
            const base64 = buffer.toString('base64')
            await writeFile(join(screenshotDir, filename), buffer)
            result.filename = filename
            result.base64 = base64
            result.screenshotOk = true
            emit('info', `[${i + 1}] Screenshot saved`, { filename })

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
                  appendLog({ timestamp: ts, source: 'uauction', url, categoryId, searchQuery: query, roundId, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, dataFile, error: null, errorType: null }).catch(() => {}),
                  appendResult({ timestamp: ts, source: 'uauction', url, categoryId, screenshotFile: filename, items: result.items as Record<string, any>[], roundId, searchQuery: query }).catch((e) => emit('warn', 'appendResult failed', String(e))),
                ])
              } catch {
                result.raw = text
                result.extractOk = false
                emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
                await appendLog({ timestamp: new Date().toISOString(), source: 'uauction', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              result.error = `extract: ${msg}`
              emit('error', `[${i + 1}] Gemini failed`, { msg })
              await appendLog({ timestamp: new Date().toISOString(), source: 'uauction', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, error: msg, errorType: 'extraction' }).catch(() => {})
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            result.error = `screenshot: ${msg}`
            emit('error', `[${i + 1}] Failed`, { msg })
            const isTimeout = msg.includes('timeout') || msg.includes('Timeout')
            await appendLog({ timestamp: new Date().toISOString(), source: 'uauction', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
          }

          send((({ base64: _b, ...r }) => ({ type: 'result', ...r }))(result))
        }

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
      ctrl.close()
    }
  })()

  return sendStream(event, stream)
})




