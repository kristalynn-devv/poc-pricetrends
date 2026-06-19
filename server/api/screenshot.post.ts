import { chromium } from 'playwright'

export default defineEventHandler(async (event) => {
  const { url } = await readBody<{ url: string }>(event)
  if (!url) throw createError({ statusCode: 400, message: 'url required' })

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 })
    return { base64: buffer.toString('base64'), mimeType: 'image/jpeg' }
  } finally {
    await browser.close()
  }
})
