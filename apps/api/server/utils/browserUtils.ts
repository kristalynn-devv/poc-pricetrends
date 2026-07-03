import { chromium } from 'playwright'
import type { Page, Browser, BrowserContext } from 'playwright'
import sharp from 'sharp'
import { buildScreenshotOptions } from './screenshotConfig'

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
  })
}

export const DISMISS_SELECTORS = [
  // Generic dialog buttons
  'dialog button:has-text("OK")',
  '[role="dialog"] button:has-text("OK")',
  // English accept/agree variants
  'button:has-text("Accept all")',
  'button:has-text("Accept All")',
  'button:has-text("Accept cookies")',
  'button:has-text("Accept Cookies")',
  'button:has-text("Accept & Close")',
  'button:has-text("Agree")',
  'button:has-text("I Agree")',
  'button:has-text("Accept")',
  'button:has-text("Got it")',
  'button:has-text("OK")',
  'button:has-text("Allow all")',
  'button:has-text("Allow All")',
  'button:has-text("Allow cookies")',
  'button:has-text("Continue")',
  'button:has-text("Close")',
  // Thai variants
  'button:has-text("อนุญาต")',
  'button:has-text("ยอมรับ")',
  'button:has-text("ยอมรับทั้งหมด")',
  'button:has-text("ตกลง")',
  'button:has-text("ปิด")',
  'button:has-text("ยืนยัน")',
  // Common cookie/consent container patterns
  '[class*="cookie-banner"] button',
  '[class*="cookie_banner"] button',
  '[class*="cookie-consent"] button',
  '[class*="cookieconsent"] button',
  '[class*="cookie-notice"] button',
  '[class*="cookie-popup"] button',
  '[class*="consent-banner"] button',
  '[class*="gdpr"] button',
  '[id*="cookie-consent"] button',
  '[id*="cookieconsent"] button',
  '[id*="cookie-banner"] button',
  '[id*="cookie-notice"] button',
  '[id*="gdpr"] button',
  // Overlay/modal close buttons
  '[class*="modal"] button[class*="close"]',
  '[class*="popup"] button[class*="close"]',
  '[class*="overlay"] button[class*="close"]',
  'button[aria-label="Close"]',
  'button[aria-label="close"]',
  'button[aria-label="ปิด"]',
]

export async function dismissCookieBanner(page: Page): Promise<void> {
  for (const sel of DISMISS_SELECTORS) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 600 })) {
        await btn.click({ timeout: 3000 })
        await page.waitForTimeout(600)
        return
      }
    } catch { }
  }
}

export async function applyStealthScripts(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] })
    Object.defineProperty(navigator, 'languages', { get: () => ['th-TH', 'th', 'en-US', 'en'] })
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    // @ts-ignore
    window.chrome = { runtime: {} }
    const origQuery = window.navigator.permissions?.query.bind(window.navigator.permissions)
    if (origQuery) {
      // @ts-ignore
      window.navigator.permissions.query = (p: any) =>
        p.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(p)
    }

    // Headless Chromium renders WebGL via SwiftShader, which is one of the strongest
    // automation signals bot-detection services (reCAPTCHA risk score, etc.) check for.
    // Spoof vendor/renderer to look like a real discrete GPU.
    const spoofGetParameter = (proto: any) => {
      const orig = proto.getParameter
      proto.getParameter = function (param: number) {
        if (param === 37445) return 'Google Inc. (NVIDIA)' // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' // UNMASKED_RENDERER_WEBGL
        return orig.call(this, param)
      }
    }
    try { spoofGetParameter(WebGLRenderingContext.prototype) } catch { /* not available */ }
    try { spoofGetParameter(WebGL2RenderingContext.prototype) } catch { /* not available */ }
  })
}

/** Move the mouse along a short randomized path to mimic human presence before interacting with a page. */
export async function humanizeMouse(page: Page): Promise<void> {
  const steps = 3 + Math.floor(Math.random() * 3)
  let x = 100 + Math.random() * 300
  let y = 100 + Math.random() * 300
  for (let i = 0; i < steps; i++) {
    x += (Math.random() - 0.5) * 400
    y += (Math.random() - 0.5) * 300
    await page.mouse.move(Math.max(0, x), Math.max(0, y), { steps: 5 + Math.floor(Math.random() * 10) })
    await page.waitForTimeout(80 + Math.random() * 200)
  }
}

/** Random delay in [minMs, maxMs) — use between navigations to avoid a fixed, bot-like cadence. */
export function jitterDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)))
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
  await applyStealthScripts(ctx)
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
 * Standard pre-screenshot sequence: dismiss cookie banner, scroll for lazy content,
 * dismiss again (banners that appear after scroll), then scroll back to top.
 */
export async function preparePageForScreenshot(page: Page): Promise<void> {
  await dismissCookieBanner(page)
  await page.mouse.move(0, 0)
  await scrollForLazyContent(page)
  await dismissCookieBanner(page)
  await page.evaluate(() => window.scrollTo(0, 0))
}

/**
 * Run async tasks with a concurrency cap. Each worker grabs the next task when free.
 * Results are returned in original index order; onResult fires as each task completes.
 */
export async function runConcurrently<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onResult?: (result: T, index: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
      onResult?.(results[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

/** Model-variant qualifier words — a listing carrying one of these that the query didn't ask for
 * is a different product (e.g. "iphone 16 pro" must not match "iphone 16 pro max"). */
export const VARIANT_MODIFIER_WORDS = new Set(['max', 'plus', 'mini', 'ultra', 'se'])

/**
 * After clicking a variant control, the page's price/image often re-renders via AJAX rather than
 * instantly — a fixed short delay risks screenshotting before that re-render finishes (stale price).
 * Wait for the on-page "selected value" badge to actually show the new option before proceeding;
 * fall back to a fixed delay if the site has no such badge or it never updates.
 */
async function waitForVariantReflected(page: Page, optionValue: string): Promise<void> {
  const reflected = await page.waitForFunction(
    (val: string) => {
      const el = document.querySelector('.product-form__selected-value, [class*="selected-value"]')
      return (el?.textContent ?? '').trim().toUpperCase().includes(val.toUpperCase())
    },
    optionValue,
    { timeout: 5000 },
  ).then(() => true).catch(() => false)
  await page.waitForTimeout(reflected ? 400 : 1200)
}

export type VariantSelectResult = 'selected' | 'unavailable' | 'not_found'

/**
 * Select a variant/option (e.g. storage capacity "256GB") on a product detail page that shows one URL
 * for all variants and requires a UI click to switch. Handles the common Shopify swatch pattern where
 * the real input is `<input type="radio" value="...">` paired with `<label for="...">` — clicking the
 * input's own hidden text is unreliable since sold-out labels carry extra hidden text (e.g. "หมด").
 * Sold-out swatches are still selected (we need the price shown for that variant, not just in-stock
 * ones): a native click is tried first, and if the swatch blocks pointer events (disabled), the radio's
 * checked state is forced directly via JS so the page's price/image still re-renders for that variant.
 * Falls back to a plain button/data-value text match for sites that don't use the radio+label pattern.
 */
export async function selectVariantOption(page: Page, optionValue: string): Promise<VariantSelectResult> {
  const escaped = optionValue.replace(/"/g, '\\"')
  const input = page.locator(`input[value="${escaped}" i]`).first()

  if (await input.count() > 0) {
    const id = await input.getAttribute('id')
    const label = id ? page.locator(`label[for="${id}"]`) : null

    try {
      if (label && await label.count() > 0) await label.click({ timeout: 3000, force: true })
      else await input.click({ timeout: 3000, force: true })
    } catch { /* native click can be blocked on sold-out swatches; fall through to forced selection below */ }

    if (!(await input.isChecked().catch(() => false))) {
      await input.evaluate((el) => {
        (el as HTMLInputElement).checked = true
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }).catch(() => {})
    }

    await waitForVariantReflected(page, optionValue)
    return (await input.isChecked().catch(() => false)) ? 'selected' : 'unavailable'
  }

  const fallback = page.locator(`button:text-is("${escaped}"), [data-value="${escaped}" i]`).first()
  if (await fallback.count() === 0) return 'not_found'
  try {
    await fallback.click({ timeout: 3000, force: true })
    await waitForVariantReflected(page, optionValue)
    return 'selected'
  } catch {
    return 'not_found'
  }
}

/**
 * Filter listing items by requiring ALL query keywords to appear in url or title (case-insensitive),
 * and rejecting listings that carry an unrequested variant modifier (Max/Plus/Mini/Ultra/SE).
 * Use before scraping detail pages to avoid wasting resources on off-topic results.
 */
export function filterListingsByQuery(
  items: { url: string; title: string }[],
  query: string,
): { url: string; title: string }[] {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return items
  const keywordSet = new Set(keywords)
  return items.filter(({ url, title }) => {
    const haystack = (title + ' ' + decodeURIComponent(url)).toLowerCase()
    if (!keywords.every((kw) => haystack.includes(kw))) return false
    const haystackWords = haystack.split(/[^a-z0-9]+/).filter(Boolean)
    return !haystackWords.some((w) => VARIANT_MODIFIER_WORDS.has(w) && !keywordSet.has(w))
  })
}
