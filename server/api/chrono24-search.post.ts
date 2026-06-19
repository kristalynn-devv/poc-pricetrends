import { chromium, type Browser, type BrowserContext } from 'playwright'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  ts: string
  level: 'info' | 'warn' | 'error'
  msg: string
  data?: unknown
}

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CHRONO24_BASE = 'https://www.chrono24.com'

// Selectors for chrono24 listing cards (search results page)
const LISTING_LINK_SELECTORS = [
  'article a[href*="--id"]',
  '[data-article-id] a',
  '.article-item a',
  'a[href*=".htm"][href*="chrono24.com"]',
]

const CATEGORY_FIELDS: Record<string, string[]> = {
  '103': ['brand', 'model', 'price', 'currency', 'condition', 'dialColor', 'caseMaterial', 'strapMaterial', 'movementType'],
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  price: 'ตัวเลขราคา (ไม่มีจุลภาค ไม่มีสัญลักษณ์สกุลเงิน) | null',
  currency: 'สกุลเงิน เช่น THB, USD, JPY, EUR | null',
  condition: '"new" | "used" | "unknown" | null',
  brand: 'แบรนด์ เช่น Rolex, Apple',
  model: 'รุ่น เช่น Datejust 41, Submariner',
  dialColor: 'สีหน้าปัดนาฬิกา',
  caseMaterial: 'วัสดุตัวเรือนนาฬิกา',
  strapMaterial: 'วัสดุสายนาฬิกา',
  movementType: 'ประเภทเครื่อง เช่น Automatic, Quartz',
}

const DISMISS_SELECTORS = [
  'dialog button:has-text("OK")',
  '[role="dialog"] button:has-text("OK")',
  'button:has-text("Accept all")',
  'button:has-text("Accept All")',
  'button:has-text("Agree")',
  'button:has-text("Accept")',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function log(logs: LogEntry[], level: LogEntry['level'], msg: string, data?: unknown): void {
  logs.push({ ts: now(), level, msg, ...(data !== undefined ? { data } : {}) })
  const prefix = `[chrono24-search][${level.toUpperCase()}]`
  if (level === 'error') console.error(prefix, msg, data ?? '')
  else if (level === 'warn') console.warn(prefix, msg, data ?? '')
  else console.log(prefix, msg, data ?? '')
}

function buildFilename(index: number, url: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  // extract chrono24 article id from url, e.g. --id12345678.htm → 12345678
  const idMatch = url.match(/--id(\d+)/)
  const articleId = idMatch ? idMatch[1] : `pos${String(index + 1).padStart(2, '0')}`
  return `${date}_103_CHR_${articleId}.jpg`
}

async function dismissCookieBanner(page: import('playwright').Page): Promise<void> {
  for (const sel of DISMISS_SELECTORS) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click({ timeout: 3000 })
        await page.waitForTimeout(800)
        return
      }
    } catch { /* not present */ }
  }
}

async function newStealth(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    viewport: { width: 1920, height: 1080 },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return ctx
}

// ─── Route ────────────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const { query, categoryId = '103', template, limit = 5 } = await readBody<{
    query: string
    categoryId?: string
    template?: Record<string, string>
    limit?: number
  }>(event)

  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  // Build Gemini schema
  let fields: Record<string, string>
  if (template && Object.keys(template).length > 0) {
    fields = template
  } else {
    const keys = CATEGORY_FIELDS[categoryId] ?? ['brand', 'model', 'price', 'currency', 'condition']
    fields = Object.fromEntries(keys.map((k) => [k, FIELD_DESCRIPTIONS[k] ?? 'string | null']))
  }
  const schemaText = Object.entries(fields).map(([k, v]) => `  "${k}": ${v}`).join(',\n')
  const extractPrompt = `คุณคือผู้ช่วยสกัดข้อมูลนาฬิกามือสองจากภาพหน้าเว็บ chrono24
ตอบกลับเป็น JSON array ของสินค้าทุกชิ้นที่เห็นในภาพ ไม่มีข้อความอื่น ไม่มี markdown code block
ถ้าหาข้อมูลใดไม่ได้ให้ใส่ null

Schema แต่ละ item:
{
${schemaText}
}`

  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })

  const logs: LogEntry[] = []
  const results: ItemResult[] = []
  const screenshotDir = join(process.cwd(), 'output', 'screenshots')

  log(logs, 'info', `Starting chrono24 search`, { query, limit })

  // ── Step 1: Search and collect listing URLs ──────────────────────────────
  const searchUrl = `${CHRONO24_BASE}/search/index.htm?query=${encodeURIComponent(query)}&dosearch=1`
  log(logs, 'info', `Opening search page`, { searchUrl })

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
  })

  let listingUrls: string[] = []

  try {
    const ctx = await newStealth(browser)
    const page = await ctx.newPage()

    try {
      await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 })
      log(logs, 'info', `Search page loaded`)
      await page.waitForTimeout(3000)
      await dismissCookieBanner(page)
      await page.waitForTimeout(500)

      // Try each selector to find listing links
      for (const sel of LISTING_LINK_SELECTORS) {
        const hrefs = await page.locator(sel).evaluateAll((els) =>
          (els as HTMLAnchorElement[]).map((a) => a.href).filter(Boolean)
        )
        // Filter to chrono24 product pages (contain --id or /watches/)
        const productUrls = hrefs.filter((h) =>
          h.includes('chrono24.com') && (h.includes('--id') || h.includes('/watches/'))
        )
        if (productUrls.length > 0) {
          // Deduplicate while preserving order
          listingUrls = [...new Set(productUrls)].slice(0, limit)
          log(logs, 'info', `Found ${listingUrls.length} listing URLs via selector: ${sel}`)
          break
        }
      }

      if (listingUrls.length === 0) {
        // Fallback: grab all <a> hrefs matching chrono24 product pattern
        const allHrefs = await page.locator('a[href]').evaluateAll((els) =>
          (els as HTMLAnchorElement[]).map((a) => a.href)
        )
        listingUrls = [...new Set(
          allHrefs.filter((h) => h.includes('chrono24.com') && h.includes('--id'))
        )].slice(0, limit)
        log(logs, listingUrls.length > 0 ? 'info' : 'warn', `Fallback href scan: ${listingUrls.length} URLs`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(logs, 'error', `Failed to load search page`, { msg })
      await browser.close()
      return { query, results, logs, error: `Search page failed: ${msg}` }
    } finally {
      await ctx.close()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(logs, 'error', `Browser/context failed`, { msg })
    await browser.close()
    return { query, results, logs, error: msg }
  }

  if (listingUrls.length === 0) {
    log(logs, 'warn', `No product URLs found — chrono24 may have blocked or changed layout`)
    await browser.close()
    return { query, results, logs, error: 'No listing URLs found' }
  }

  log(logs, 'info', `Will process ${listingUrls.length} listings`, { urls: listingUrls })
  await mkdir(screenshotDir, { recursive: true })

  // ── Step 2: Loop — screenshot + extract each listing ────────────────────
  for (let i = 0; i < listingUrls.length; i++) {
    const url = listingUrls[i]
    const filename = buildFilename(i, url)
    const result: ItemResult = { index: i, url, filename: null, base64: null, screenshotOk: false, extractOk: false, items: [] }
    results.push(result)

    log(logs, 'info', `[${i + 1}/${listingUrls.length}] Screenshotting`, { url })

    // Screenshot
    let base64 = ''
    try {
      const ctx = await newStealth(browser)
      const page = await ctx.newPage()
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 })
        await page.waitForTimeout(2500)
        await dismissCookieBanner(page)
        await page.mouse.move(0, 0)
        await page.waitForTimeout(300)
        const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 85 })
        base64 = buffer.toString('base64')
        await writeFile(join(screenshotDir, filename), buffer)
        result.filename = filename
        result.base64 = base64
        result.screenshotOk = true
        log(logs, 'info', `[${i + 1}] Screenshot saved`, { filename })
      } finally {
        await ctx.close()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.error = `screenshot: ${msg}`
      log(logs, 'error', `[${i + 1}] Screenshot failed`, { url, msg })
      continue // skip extract if no screenshot
    }

    // Extract via Gemini
    log(logs, 'info', `[${i + 1}] Extracting with Gemini`, { filename })
    try {
      const geminiResult = await geminiModel.generateContent([
        extractPrompt,
        { inlineData: { data: base64, mimeType: 'image/jpeg' } },
      ])
      const text = geminiResult.response.text().trim()
      try {
        result.items = JSON.parse(text)
        result.extractOk = true
        log(logs, 'info', `[${i + 1}] Extracted ${result.items.length} item(s)`)
      } catch {
        result.raw = text
        result.extractOk = false
        log(logs, 'warn', `[${i + 1}] Gemini response not valid JSON`, { preview: text.slice(0, 120) })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.error = (result.error ? result.error + ' | ' : '') + `extract: ${msg}`
      log(logs, 'error', `[${i + 1}] Gemini extract failed`, { msg })
    }
  }

  await browser.close()

  const summary = {
    total: results.length,
    screenshotOk: results.filter((r) => r.screenshotOk).length,
    extractOk: results.filter((r) => r.extractOk).length,
  }
  log(logs, 'info', `Done`, summary)

  return { query, summary, results, logs }
})
