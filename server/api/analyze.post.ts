import { chromium } from 'playwright'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE_CODES: Record<string, string> = {
  'chrono24.com': 'CHR',
  'watchuseek.com': 'WUS',
  'rolex.com': 'ROL',
  'tarad.com': 'TAR',
  'kaidee.com': 'KAI',
  'shopee.co.th': 'SHP',
  'lazada.co.th': 'LAZ',
  'facebook.com': 'FBK',
  'instagram.com': 'INS',
  'ebay.com': 'EBY',
  'yahoo.co.jp': 'YAH',
  'mercari.com': 'MRC',
}

function sourceCode(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (SOURCE_CODES[host]) return SOURCE_CODES[host]
    return host.split('.')[0].replace(/[aeiou]/gi, '').slice(0, 3).toUpperCase() || host.slice(0, 3).toUpperCase()
  } catch {
    return 'UNK'
  }
}

function buildFilename(url: string, categoryId?: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const asset = categoryId ?? '000'
  const src = sourceCode(url)
  return `${date}_${asset}_${src}.jpg`
}

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
  price: 'ตัวเลขราคา (ไม่มีจุลภาค ไม่มีสัญลักษณ์สกุลเงิน) | null',
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

export default defineEventHandler(async (event) => {
  const { url, categoryId, template } = await readBody<{
    url: string
    categoryId?: string
    template?: Record<string, string>
  }>(event)

  if (!url) throw createError({ statusCode: 400, message: 'url required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  // --- Screenshot ---
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
  })
  let base64: string
  const mimeType = 'image/jpeg'
  const filename = buildFilename(url, categoryId)

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    })
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
    const page = await context.newPage()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
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
    const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 90 })
    base64 = buffer.toString('base64')
    const screenshotDir = join(process.cwd(), 'output', 'screenshots')
    await mkdir(screenshotDir, { recursive: true })
    await writeFile(join(screenshotDir, filename), buffer)
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
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType } },
  ])

  const text = result.response.text().trim()
  try {
    const items = JSON.parse(text)
    return { filename, base64, mimeType, items }
  } catch {
    return { filename, base64, mimeType, items: [], raw: text }
  }
})
