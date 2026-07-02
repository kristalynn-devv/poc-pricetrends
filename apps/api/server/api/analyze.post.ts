import { chromium } from 'playwright'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLog } from '../utils/logger'
import { apiError, classifyError } from '../utils/errors'
import { extractDomain } from '#shared/utils/domain'
import { persistExtraction } from '../utils/persistExtraction'
import type { LogEntry } from '#shared/types/log'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import type { ScreenshotConfig } from '#shared/types/screenshot'
import { takeScreenshot } from '../utils/browserUtils'
import { callGemini } from '../utils/geminiClient'
import { buildUrlScreenshotFilename } from '../utils/filename'

const CATEGORY_FIELDS: Record<string, string[]> = {
  '103': ['brand', 'model', 'price', 'currency', 'condition', 'dialColor', 'caseMaterial', 'strapMaterial', 'movementType'],
  '106': ['title', 'model', 'price', 'currency', 'material', 'moldType', 'year', 'weight'],
  '107': ['itemType', 'brand', 'model', 'price', 'currency', 'capacity', 'condition'],
  '108': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '109': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
  '110': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '111': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
  '112': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  title: 'ชื่อสินค้า',
  price: 'ตัวเลขจำนวนเต็ม - ตัดจุลภาค (,) ออก, จุด (.) คือ decimal point ให้ปัดทิ้ง ไม่ใช่ thousands separator เช่น 1,560,000.00 → 1560000 | 1560000.00 → 1560000 | null',
  currency: 'สกุลเงิน เช่น THB, USD, JPY, EUR | null',
  condition: '"new" | "used" | "unknown" | null',
  brand: 'แบรนด์ เช่น Rolex, Apple',
  model: 'รุ่น เช่น Datejust 41, iPhone 15 Pro',
  itemType: 'ประเภทสินค้า เช่น โน้ตบุ๊ก, กระเป๋า',
  year: 'ปีผลิต',
  material: 'วัสดุ เช่น เนื้อทองคำ',
  moldType: 'ลักษณะพิมพ์/แบบพิมพ์',
  weight: 'น้ำหนัก เช่น 15.2g',
  capacity: 'ความจุ เช่น 512GB',
  dialColor: 'สีหน้าปัดนาฬิกา',
  caseMaterial: 'วัสดุตัวเรือนนาฬิกา',
  strapMaterial: 'วัสดุสายนาฬิกา',
  movementType: 'ประเภทเครื่อง เช่น Automatic, Quartz',
}

defineRouteMeta({
  openAPI: {
    tags: ['Analyze'],
    summary: 'Screenshot + Gemini extract + save',
    description: 'Main endpoint used by the UI\'s "ถ่ายรูป" button. Takes a Playwright screenshot of the URL, sends it to Gemini for structured extraction, and persists the result.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['url'],
            properties: {
              url: { type: 'string' },
              categoryId: { type: 'string', description: "'103' | '106' | '107' | ... — selects the field schema" },
              template: { type: 'object', additionalProperties: { type: 'string' }, description: 'custom field schema, overrides categoryId defaults' },
              config: { type: 'object', description: 'viewport/quality/clip overrides (Partial<ScreenshotConfig>)' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Screenshot + extracted items',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                base64: { type: 'string', description: 'JPEG, base64-encoded' },
                mimeType: { type: 'string', enum: ['image/jpeg'] },
                items: { type: 'array', items: { type: 'object' } },
                raw: { type: 'string', description: 'present only when JSON parsing failed' },
              },
            },
          },
        },
      },
      400: { description: 'config error — missing url' },
      500: { description: 'config error — Gemini key not configured, or screenshot failure' },
      502: { description: 'extraction error — Gemini call failed' },
      504: { description: 'timeout/screenshot error — page load failed' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const { url, categoryId, template, config: configRaw } = await readBody<{
    url: string
    categoryId?: string
    template?: Record<string, string>
    config?: Partial<ScreenshotConfig>
  }>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))

  if (!url) throw apiError(400, 'config', 'url required')

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(), source: extractDomain(url), url, categoryId: categoryId ?? null,
      durationMs: 0, httpStatus: 500, screenshotFile: null,
      error: 'GEMINI_API_KEY not configured', errorType: 'config',
    }
    await appendLog(logEntry).catch(() => {})
    throw apiError(500, 'config', 'GEMINI_API_KEY not configured')
  }

  const startedAt = Date.now()
  const filename = buildUrlScreenshotFilename(url, categoryId)
  const mimeType = 'image/jpeg'

  // --- Screenshot ---
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
  })
  let base64: string

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      viewport: screenshotCfg.viewport,
    })
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    } catch (err) {
      const { errorType, message } = classifyError(err, 'screenshot')
      await appendLog({
        timestamp: new Date().toISOString(), source: extractDomain(url), url, categoryId: categoryId ?? null,
        durationMs: Date.now() - startedAt, httpStatus: 504, screenshotFile: null,
        error: message, errorType,
      }).catch(() => {})
      throw apiError(504, errorType, errorType === 'timeout' ? 'Page load timed out' : 'Page load failed')
    }
    await page.waitForTimeout(3000)
    for (const selector of [
      'dialog button:has-text("OK")', '[role="dialog"] button:has-text("OK")',
      'button:has-text("Accept all")', 'button:has-text("Accept All")',
      'button:has-text("Agree")', 'button:has-text("Accept")',
    ]) {
      try {
        const btn = page.locator(selector).first()
        if (await btn.isVisible({ timeout: 800 })) {
          await btn.click({ timeout: 3000 })
          await page.waitForTimeout(800)
          break
        }
      } catch { }
    }
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const buffer = await takeScreenshot(page, screenshotCfg)
    base64 = buffer.toString('base64')
    const screenshotDir = join(process.cwd(), 'output', 'screenshots')
    await mkdir(screenshotDir, { recursive: true })
    await writeFile(join(screenshotDir, filename), buffer)
  } catch (err: any) {
    if (!err?.statusCode) {
      const { message } = classifyError(err, 'screenshot')
      await appendLog({
        timestamp: new Date().toISOString(), source: extractDomain(url), url, categoryId: categoryId ?? null,
        durationMs: Date.now() - startedAt, httpStatus: 500, screenshotFile: null,
        error: message, errorType: 'screenshot',
      }).catch(() => {})
      throw apiError(500, 'screenshot', 'Screenshot failed')
    }
    throw err
  } finally {
    await browser.close()
  }

  // --- Extract ---
  let fields: Record<string, string>
  if (template && Object.keys(template).length > 0) {
    fields = template
  } else {
    const fieldKeys = categoryId ? (CATEGORY_FIELDS[categoryId] ?? ['title', 'price', 'currency', 'condition']) : ['title', 'price', 'currency', 'condition']
    fields = Object.fromEntries(fieldKeys.map((k) => [k, FIELD_DESCRIPTIONS[k] ?? 'string | null']))
  }

  const schemaText = Object.entries(fields).map(([k, v]) => `  "${k}": ${v}`).join(',\n')
  const prompt = `คุณคือผู้ช่วยสกัดข้อมูลสินค้าจากภาพหน้าเว็บตลาดมือสองไทย
ตอบกลับเป็น JSON array ของสินค้าทุกชิ้นที่เห็นในภาพ ไม่มีข้อความอื่น ไม่มี markdown code block
ถ้าหาข้อมูลใดไม่ได้ให้ใส่ null

Schema แต่ละ item:
{
${schemaText}
}`

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })

  let text: string
  let geminiInputTokens: number | undefined
  let geminiOutputTokens: number | undefined
  try {
    ;({ text, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight } = await callGemini(model, prompt, base64, mimeType))
  } catch (err) {
    const { errorType, message } = classifyError(err, 'extraction')
    await appendLog({
      timestamp: new Date().toISOString(), source: extractDomain(url), url, categoryId: categoryId ?? null,
      durationMs: Date.now() - startedAt, httpStatus: 502, screenshotFile: filename,
      error: message, errorType,
    }).catch(() => {})
    throw apiError(502, errorType, 'Gemini extraction failed')
  }

  try {
    const items = JSON.parse(text)
    const cat = categoryId ?? '000'
    const ts = new Date().toISOString()
    await persistExtraction({
      timestamp: ts, source: extractDomain(url), url,
      categoryId: cat, screenshotFile: filename,
      items: Array.isArray(items) ? items : [],
      durationMs: Date.now() - startedAt,
      geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
    }).catch(() => {})
    return { filename, base64, mimeType, items }
  } catch {
    await appendLog({
      timestamp: new Date().toISOString(), source: extractDomain(url), url,
      categoryId: categoryId ?? null, durationMs: Date.now() - startedAt, httpStatus: 200,
      screenshotFile: filename, error: `JSON parse failed: ${text.slice(0, 120)}`, errorType: 'parse',
    }).catch(() => {})
    return { filename, base64, mimeType, items: [], raw: text }
  }
})
