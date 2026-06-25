import { execSync } from 'node:child_process'

// Cloudflare Pages / frontend-only CI — no Playwright on build agents
if (process.env.CF_PAGES === '1' || process.env.SKIP_PLAYWRIGHT === '1') {
  console.log('[postinstall] Skipping Playwright (frontend-only build)')
  process.exit(0)
}

execSync('playwright install chromium', { stdio: 'inherit' })
