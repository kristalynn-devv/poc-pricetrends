import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mergeScreenshotConfig, buildScreenshotOptions } from '../utils/screenshotConfig'
import { takeScreenshot } from '../utils/browserUtils'
import { buildUrlScreenshotFilename } from '../utils/filename'
import { apiError, classifyError } from '../utils/errors'

export default defineEventHandler(async (event) => {
  const { url, categoryId, config: configRaw } = await readBody<{
    url: string; categoryId?: string; config?: import('#shared/types/screenshot').ScreenshotConfig
  }>(event)
  const screenshotCfg = buildScreenshotOptions(mergeScreenshotConfig(configRaw))
  if (!url) throw apiError(400, 'config', 'url required')

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
    await page.setViewportSize(screenshotCfg.viewport)
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
      } catch { /* popup not present or not clickable - continue */ }
    }
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const buffer = await takeScreenshot(page, screenshotCfg)
    const filename = buildUrlScreenshotFilename(url, categoryId)
    const screenshotDir = join(process.cwd(), 'output', 'screenshots')
    await mkdir(screenshotDir, { recursive: true })
    await writeFile(join(screenshotDir, filename), buffer)
    return { filename, mimeType: 'image/jpeg' }
  } catch (err) {
    const { errorType, message } = classifyError(err, 'screenshot')
    throw apiError(errorType === 'timeout' ? 504 : 500, errorType, message)
  } finally {
    await browser.close()
  }
})
