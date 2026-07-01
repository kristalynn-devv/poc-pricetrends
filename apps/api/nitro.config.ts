import { fileURLToPath } from 'node:url'
import { defineNitroConfig } from 'nitropack/config'

const sharedDir = fileURLToPath(new URL('../../packages/shared', import.meta.url))

export default defineNitroConfig({
  compatibilityDate: '2026-07-01',
  srcDir: 'server',
  alias: {
    '#shared': sharedDir,
  },
  runtimeConfig: {
    geminiApiKey: process.env.NUXT_GEMINI_API_KEY ?? process.env.NITRO_GEMINI_API_KEY ?? '',
  },
  routeRules: {
    '/api/**': { cors: true },
  },
  experimental: {
    openAPI: true,
  },
  openAPI: {
    meta: {
      title: 'poc-pricetrends API',
      description: 'Screenshot + Gemini extraction backend. See CLAUDE.md / API.md for architecture notes.',
      version: '1.0.0',
    },
    production: 'runtime',
    ui: {
      swagger: { route: '/api-docs' },
    },
  },
})
