import { defineSearchRoute } from '../utils/searchRouteFactory'

const SEARCH_BASE = 'https://www.kaidee.com'

defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search kaidee.com',
    description: 'Scrapes a kaidee.com listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 107/109/111/112. Response is a stream of NDJSON lines (application/x-ndjson).',
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
  sourceKey: 'kaidee',
  siteName: 'kaidee.com',
  sourceCode: 'KAI',
  defaultCategoryId: '107',
  linkSelector: 'a[href*="/product-"]',
  linkFilter: (url) => /\/product-\d+/.test(url),
  buildSearchUrl: (query, categoryId) => categoryId === '111'
    ? `${SEARCH_BASE}/c296-appliances_decoration-accessories_and_tool_suppliers?q=${encodeURIComponent(query)}`
    : `${SEARCH_BASE}/browse?q=${encodeURIComponent(query)}&suggest=1`,
})
