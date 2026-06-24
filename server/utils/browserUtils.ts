import type { Page, Browser, BrowserContext } from 'playwright'
import sharp from 'sharp'
import { buildScreenshotOptions } from './screenshotConfig'

export const DISMISS_SELECTORS = [
  'dialog button:has-text("OK")',
  '[role="dialog"] button:has-text("OK")',
  'button:has-text("Accept all")',
  'button:has-text("Accept All")',
  'button:has-text("Accept cookies")',
  'button:has-text("Agree")',
  'button:has-text("Accept")',
  'button:has-text("Got it")',
  'button:has-text("ยอมรับ")',
  'button:has-text("ตกลง")',
  '[class*="cookie-banner"] button',
  '[id*="cookie-consent"] button',
]

export async function dismissCookieBanner(page: Page): Promise<void> {
  for (const sel of DISMISS_SELECTORS) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click({ timeout: 3000 })
        await page.waitForTimeout(800)
        return
      }
    } catch { }
  }
}

export async function createStealthContext(
  browser: Browser,
  cfg: ReturnType<typeof buildScreenshotOptions>,
  locale: 'th-TH' | 'en-US' = 'th-TH',
): Promise<BrowserContext> {
  const acceptLanguage = locale === 'th-TH' ? 'th-TH,th;q=0.9,en;q=0.8' : 'en-US,en;q=0.9'
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale,
    extraHTTPHeaders: { 'Accept-Language': acceptLanguage },
    viewport: cfg.viewport,
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return ctx
}

async function cropBuffer(buffer: Buffer, height: number | undefined): Promise<Buffer> {
  if (!height) return buffer
  const meta = await sharp(buffer).metadata()
  if (!meta.height || height >= meta.height) return buffer
  return sharp(buffer).extract({ left: 0, top: 0, width: meta.width!, height }).jpeg().toBuffer()
}

/** Take a screenshot and crop to cropHeight if set. Single entry point for all routes. */
export async function takeScreenshot(
  page: import('playwright').Page,
  cfg: ReturnType<typeof buildScreenshotOptions>,
): Promise<Buffer> {
  const raw = await page.screenshot(cfg.screenshotOpts)
  return cropBuffer(raw, cfg.cropHeight)
}

/** Scroll to bottom then back to top to trigger lazy-loaded content */
export async function scrollForLazyContent(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
}

/**
 * Filter listing items by requiring ALL query keywords to appear in url or title (case-insensitive).
 * Use before scraping detail pages to avoid wasting resources on off-topic results.
 */
export function filterListingsByQuery(
  items: { url: string; title: string }[],
  query: string,
): { url: string; title: string }[] {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return items
  return items.filter(({ url, title }) => {
    const haystack = (title + ' ' + decodeURIComponent(url)).toLowerCase()
    return keywords.every((kw) => haystack.includes(kw))
  })
}
