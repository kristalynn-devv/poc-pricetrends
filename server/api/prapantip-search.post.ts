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

const PRP_BASE = 'https://www.prapantip.com'

const CATEGORY_FIELDS: Record<string, string[]> = {
  '106': ['title', 'model', 'price', 'currency', 'material', 'moldType', 'year', 'weight'],
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  title: 'ชื่อพระ/วัตถุมงคล',
  model: 'รุ่น เช่น รุ่นแรก, รุ่น 2',
  price: 'ตัวเลขราคา (ไม่มีจุลภาค ไม่มีสัญลักษณ์สกุลเงิน) | null',
  currency: 'สกุลเงิน เช่น THB | null',
  material: 'วัสดุ เช่น เนื้อทองคำ, เนื้อเงิน, เนื้อนวะ | null',
  moldType: 'แม่พิมพ์/พิมพ์ เช่น พิมพ์ใหญ่, พิมพ์เล็ก | null',
  year: 'ปีที่สร้าง/ปี พ.ศ. | null',
  weight: 'น้ำหนัก | null',
}

const DISMISS_SELECTORS = [
  // โฆษณา popup prapantip — มักเป็น overlay div กด X หรือ ปิด
  '.modal-close', '.close-btn', '.btn-close', 'button.close',
  '[aria-label="Close"]', '[aria-label="ปิด"]',
  '.modal button:has-text("ปิด")', '.popup button:has-text("ปิด")',
  '.overlay button:has-text("ปิด")', 'button:has-text("ปิด")',
  // generic cookie/consent
  'dialog button:has-text("OK")', '[role="dialog"] button:has-text("OK")',
  'button:has-text("Accept all")', 'button:has-text("ยอมรับ")',
]

async function dismissAds(page: import('playwright').Page): Promise<void> {
  // ลองปิด overlay/popup โฆษณาทุกตัวที่มองเห็น
  for (const sel of DISMISS_SELECTORS) {
    try {
      const btns = page.locator(sel)
      const count = await btns.count()
      for (let i = 0; i < count; i++) {
        const btn = btns.nth(i)
        if (await btn.isVisible({ timeout: 400 })) {
          await btn.click({ timeout: 1500 })
          await page.waitForTimeout(400)
        }
      }
    } catch { }
  }
  // กด Escape เผื่อ modal ที่ไม่มีปุ่ม
  try { await page.keyboard.press('Escape') } catch { }
}

function buildFilename(index: number): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${date}_106_PRP_${String(index + 1).padStart(2, '0')}.jpg`
}


async function saveResult(entry: { timestamp: string; source: string; url: string; categoryId: string; screenshotFile: string; items: unknown[] }) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const dir = join(process.cwd(), 'output', 'results')
  await mkdir(dir, { recursive: true })
  await appendFile(join(dir, `${dateStr}.jsonl`), JSON.stringify(entry) + '\n', 'utf8')
}

export default defineEventHandler(async (event) => {
  const { query, categoryId = '106', template, limit = 5 } = await readBody<{
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
    const keys = CATEGORY_FIELDS[categoryId] ?? ['title', 'price', 'currency']
    fields = Object.fromEntries(keys.map((k) => [k, FIELD_DESCRIPTIONS[k] ?? 'string | null']))
  }
  const schemaText = Object.entries(fields).map(([k, v]) => `  "${k}": ${v}`).join(',\n')
  const extractPrompt = `คุณคือผู้ช่วยสกัดข้อมูลพระ/วัตถุมงคลจากภาพหน้าเว็บ prapantip.com
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
    const prefix = `[prapantip][${level.toUpperCase()}]`
    if (level === 'error') console.error(prefix, msg, data ?? '')
    else if (level === 'warn') console.warn(prefix, msg, data ?? '')
    else console.log(prefix, msg, data ?? '')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')
  const results: ItemResult[] = []
  const searchUrl = `${PRP_BASE}/websearch/?searchText=${encodeURIComponent(query)}&searchAmuletGroupID=&searchAmuletProvinceID=`

  ;(async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      emit('info', `Starting search`, { query, limit, url: searchUrl })
      await mkdir(screenshotDir, { recursive: true })

      const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        locale: 'th-TH',
        extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7' },
        viewport: { width: 1920, height: 1080 },
      })
      await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
      const page = await ctx.newPage()

      try {
        emit('info', `Loading search results`, { url: searchUrl })
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
        await page.waitForTimeout(2000)
        await dismissAds(page)

        // Collect /amulet/detail/ links from search results
        const allHrefs = await page.locator('a[href*="/amulet/detail/"]').evaluateAll(
          (els) => [...new Set((els as HTMLAnchorElement[]).map((a) => a.href))]
        )
        const detailUrls = allHrefs.slice(0, limit)
        emit('info', `Found ${allHrefs.length} product links, processing ${detailUrls.length}`)

        if (detailUrls.length === 0) {
          emit('warn', 'No product links found')
          await appendLog({ timestamp: new Date().toISOString(), source: 'prapantip', url: searchUrl, categoryId, searchQuery: query, durationMs: 0, httpStatus: 404, screenshotFile: null, itemsExtracted: 0, error: 'No product links found', errorType: null }).catch(() => {})
          send({ type: 'done', query, summary: { total: 0, screenshotOk: 0, extractOk: 0 }, error: 'No product links found' })
          ctrl.close()
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
            await page.waitForTimeout(1500)
            await dismissAds(page)
            await page.mouse.move(0, 0)
            await page.waitForTimeout(300)

            const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 85 })
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
                result.items = JSON.parse(text)
                result.extractOk = true
                emit('info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
                const ts = new Date().toISOString()
                await Promise.all([
                  appendLog({ timestamp: ts, source: 'prapantip', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, itemsExtracted: result.items.length, error: null, errorType: null }).catch(() => {}),
                  result.items.length > 0 ? saveResult({ timestamp: ts, source: 'prapantip', url, categoryId, screenshotFile: filename, items: result.items }).catch((e) => emit('warn', 'saveResult failed', String(e))) : Promise.resolve(),
                ])
              } catch {
                result.raw = text
                result.extractOk = false
                emit('warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
                await appendLog({ timestamp: new Date().toISOString(), source: 'prapantip', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 200, screenshotFile: filename, itemsExtracted: 0, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse' }).catch(() => {})
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              result.error = `extract: ${msg}`
              emit('error', `[${i + 1}] Gemini failed`, { msg })
              await appendLog({ timestamp: new Date().toISOString(), source: 'prapantip', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: 502, screenshotFile: filename, itemsExtracted: null, error: msg, errorType: 'extraction' }).catch(() => {})
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            result.error = `screenshot: ${msg}`
            emit('error', `[${i + 1}] Failed`, { msg })
            const isTimeout = msg.includes('timeout') || msg.includes('Timeout')
            await appendLog({ timestamp: new Date().toISOString(), source: 'prapantip', url, categoryId, searchQuery: query, durationMs: Date.now() - itemStart, httpStatus: isTimeout ? 504 : 500, screenshotFile: null, itemsExtracted: null, error: msg, errorType: isTimeout ? 'timeout' : 'screenshot' }).catch(() => {})
          }

          send({ type: 'result', ...result })
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
