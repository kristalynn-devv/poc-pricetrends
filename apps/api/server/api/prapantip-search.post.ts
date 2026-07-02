import { defineSearchRoute } from '../utils/searchRouteFactory'

const PRP_BASE = 'https://www.prapantip.com'

defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search prapantip.com',
    description: 'Scrapes a prapantip.com listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 106. Response is a stream of NDJSON lines (application/x-ndjson).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'search keywords' },
              categoryId: { type: 'string', description: "defaults to the route's primary category (106)" },
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
  sourceKey: 'prapantip',
  siteName: 'prapantip.com',
  sourceCode: 'PRP',
  defaultCategoryId: '106',
  linkSelector: 'a[href*="/amulet/detail/"]',
  searchPageWaitMs: 2000,
  itemWaitMs: 1500,
  dismissBannerOnSearchPage: true,
  buildSearchUrl: (query) => `${PRP_BASE}/websearch/?searchText=${encodeURIComponent(query)}&searchAmuletGroupID=&searchAmuletProvinceID=`,
})
