import { defineSearchRoute } from '../utils/searchRouteFactory'

const SEARCH_BASE = 'https://www.shopbkk.com/search'

defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search shopbkk.com',
    description: 'Scrapes a shopbkk.com listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 107/109/112. Response is a stream of NDJSON lines (application/x-ndjson).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'search keywords' },
              categoryId: { type: 'string', description: "defaults to the route's primary category (107)" },
              template: { type: 'object', additionalProperties: { type: 'string' }, description: 'custom field schema, overrides categoryId defaults' },
              limit: { type: 'number', description: 'max listing items to process (default varies per route)' },
              screenshotConfig: { type: 'object', description: 'viewport/quality/clip overrides' },
              roundId: { type: 'string', description: 'groups multiple queries/sources under one batch run' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'NDJSON stream: one JSON object per line, type is log|result|searchpage|done',
        content: { 'application/x-ndjson': { schema: { type: 'string' } } },
      },
      400: { description: 'missing/empty query' },
      500: { description: 'Gemini API key not configured' },
    },
  },
})

export default defineSearchRoute({
  sourceKey: 'shopbkk',
  siteName: 'shopbkk.com',
  sourceCode: 'SBK',
  defaultCategoryId: '107',
  linkSelector: 'a[href*="/product/"]',
  linkFilter: (url) => url.includes('/product/'),
  searchPageWaitMs: 2000,
  buildSearchUrl: (query) => `${SEARCH_BASE}?q=${encodeURIComponent(query)}&category_id=0&from=&min_price=&max_price=&sortby=name`,
  beforeScreenshot: async (page) => {
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.gadgetImage').forEach((el) => { el.style.display = 'none' })
    })
  },
})
