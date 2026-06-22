import { chromium } from 'playwright'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'

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

const CATEGORY_FIELDS: Record<string, string[]> = {
  '103': ['brand', 'model', 'price', 'currency', 'condition', 'dialColor', 'caseMaterial', 'strapMaterial', 'movementType'],
  '108': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '110': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  price: 'ตัวเลขราคา (ไม่มีจุลภาค ไม่มีสัญลักษณ์สกุลเงิน) | null',
  currency: 'สกุลเงิน เช่น THB, USD, JPY, EUR | null',
  condition: '"new" | "used" | "unknown" | null',
  brand: 'แบรนด์ เช่น Rolex, Omega, AP, Louis Vuitton, Gucci',
  model: 'รุ่น เช่น Seamaster, Neverfull, GG Marmont',
  itemType: 'ประเภทสินค้า เช่น กระเป๋า, กระเป๋าสตางค์, แว่นตา, เข็มขัด',
  year: 'ปีที่ผลิต (ตัวเลข) | null',
  dialColor: 'สีหน้าปัดนาฬิกา',
  caseMaterial: 'วัสดุตัวเรือนนาฬิกา',
  strapMaterial: 'วัสดุสายนาฬิกา',
  movementType: 'ประเภทเครื่อง เช่น Automatic, Quartz',
}

const DISMISS_SELECTORS = [
  'dialog button:has-text("OK")', '[role="dialog"] button:has-text("OK")',
  'button:has-text("Accept all")', 'button:has-text("Accept All")',
  'button:has-text("Agree")', 'button:has-text("Accept")',
  'button:has-text("ยอมรับ")',
]

function buildFilename(index: number, url: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const slugMatch = url.replace(/\/$/, '').match(/\/([^/]+)$/)
  const slug = slugMatch ? slugMatch[1].slice(0, 30) : String(index + 1).padStart(2, '0')
  return `${date}_103_KMH_${slug}.jpg`
}

async function dismissPopups(page: import('playwright').Page): Promise<void> {
  for (const sel of DISMISS_SELECTORS) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 600 })) { await btn.click({ timeout: 2000 }); await page.waitForTimeout(500); return }
    } catch { }
  }
}

async function saveResult(entry: { timestamp: string; source: string; url: string; categoryId: string; screenshotFile: string; items: unknown[] }) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const dir = join(process.cwd(), 'output', 'results')
  await mkdir(dir, { recursive: true })
  await appendFile(join(dir, `${dateStr}.jsonl`), JSON.stringify(entry) + '\n', 'utf8')
}

export default defineEventHandler(async (event) => {
  const { query, categoryId = '103', template, limit = 5 } = await readBody<{
    query: string; categoryId?: string; template?: Record<string, string>; limit?: number
  }>(event)

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  let fields: Record<string, string>
  if (template && Object.keys(template).length > 0) {
    fields = template
  } else {
    const keys = CATEGORY_FIELDS[categoryId] ?? ['brand', 'model', 'price', 'currency', 'condition']
    fields = Object.fromEntries(keys.map((k) => [k, FIELD_DESCRIPTIONS[k] ?? 'string | null']))
  }
  const schemaText = Object.entries(fields).map(([k, v]) => `  "${k}": ${v}`).join(',\n')
  const categoryLabel = categoryId === '103' ? 'นาฬิกา' : categoryId === '110' ? 'แว่นตา' : 'แบรนเนม'
  const extractPrompt = `คุณคือผู้ช่วยสกัดข้อมูลสินค้ามือสอง (${categoryLabel}) จากภาพหน้าเว็บ komehyo.co.th
ตอบกลับเป็น JSON array ของสินค้าทุกชิ้นที่เห็นในภาพ ไม่มีข้อความอื่น ไม่มี markdown code block
ถ้าหาข้อมูลใดไม่ได้ให้ใส่ null

Schema แต่ละ item:
{
${schemaText}
}`

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
          viewport: { width: 1920, height: 1080 },
        })
        await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
        const page = await ctx.newPage()
        try {
          emit('info', `Loading product-list page`, { startUrl })
          await page.goto(startUrl, { waitUntil: 'load', timeout: 30000 })
          await page.waitForTimeout(2000)
          await dismissPopups(page)

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

          await dismissPopups(page)
          await page.waitForTimeout(500)

          // Collect product links — require numeric product ID in path
          const productUrlRe = /\/th\/product\/\d+/
          const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
          const allHrefs = await page.locator('a[href]').evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => a.href))
          const allProductUrls = [...new Set(allHrefs.filter((h) =>
            h.includes('komehyo.co.th') && productUrlRe.test(h)
          ))]
          emit('info', `Raw product URLs on page`, { count: allProductUrls.length })

          // Filter by query terms appearing in the URL slug
          const matched = allProductUrls.filter((h) => {
            const slug = h.toLowerCase()
            return queryTerms.every((t) => slug.includes(t))
          })
          listingUrls = (matched.length > 0 ? matched : allProductUrls).slice(0, limit)
          emit(listingUrls.length > 0 ? 'info' : 'warn', `Filtered to ${listingUrls.length} URLs (matched=${matched.length})`)
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
        await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, itemsExtracted: 0, error: 'No listing URLs found', errorType: null }).catch(() => {})
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
            viewport: { width: 1920, height: 1080 },
          })
          await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
          const page = await ctx.newPage()
          try {
            await page.goto(url, { waitUntil: 'load', timeout: 30000 })
            await page.waitForTimeout(2500)
            await dismissPopups(page)
            await page.mouse.move(0, 0)
            await page.waitForTimeout(300)
            const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 85 })
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
          await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, itemsExtracted: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
          send({ type: 'result', ...result })
          continue
        }

        emit('info', `[${i + 1}] Extracting with Gemini`)
        try {
          const geminiResult = await geminiModel.generateContent([extractPrompt, { inlineData: { data: base64, mimeType: 'image/jpeg' } }])
          const text = geminiResult.response.text().trim()
          try {
            result.items = JSON.parse(text)
            result.extractOk = true
            emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
            const ts = new Date().toISOString()
            await Promise.all([
              appendLog({ timestamp: ts, source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, itemsExtracted: result.items.length, error: null, errorType: null }).catch(() => {}),
              result.items.length > 0 ? saveResult({ timestamp: ts, source: 'komehyo', url, categoryId, screenshotFile: filename, items: result.items }).catch((e) => emit('warn', 'saveResult failed', String(e))) : Promise.resolve(),
            ])
          } catch {
            result.raw = text
            result.extractOk = false
            emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
            await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, itemsExtracted: 0, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.error = (result.error ?? '') + `extract: ${msg}`
          emit('error', `[${i + 1}] Gemini failed`, { msg })
          await appendLog({ timestamp: new Date().toISOString(), source: 'komehyo', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, itemsExtracted: null, error: msg, errorType: 'extraction' }).catch(() => {})
        }

        send({ type: 'result', ...result })
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
