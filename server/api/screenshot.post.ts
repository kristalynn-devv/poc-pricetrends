import { chromium } from 'playwright'

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
    // fallback: first 3 consonants/chars of domain
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

export default defineEventHandler(async (event) => {
  const { url, categoryId } = await readBody<{ url: string; categoryId?: string }>(event)
  if (!url) throw createError({ statusCode: 400, message: 'url required' })

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  })
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
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(3000)
    // dismiss common cookie/consent popups (best-effort, never throws)
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
      } catch { /* popup not present or not clickable — continue */ }
    }
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 })
    return {
      base64: buffer.toString('base64'),
      mimeType: 'image/jpeg',
      filename: buildFilename(url, categoryId),
    }
  } finally {
    await browser.close()
  }
})
