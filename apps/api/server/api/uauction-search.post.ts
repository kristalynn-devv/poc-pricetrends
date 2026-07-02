import { defineSearchRoute } from '../utils/searchRouteFactory'

const SEARCH_URL = 'https://uauction.uamulet.com/AuctionUClubTopList.aspx'

defineRouteMeta({
  openAPI: {
    tags: ['Batch Search'],
    summary: 'Search uauction.uamulet.com',
    description: 'Scrapes a uauction.uamulet.com listing page for query, screenshots + Gemini-extracts each matching item, and persists successes immediately to output/results/ + output/logs/. หมวด (categoryId): 106. Response is a stream of NDJSON lines (application/x-ndjson).',
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
  sourceKey: 'uauction',
  siteName: 'uauction.uamulet.com',
  sourceCode: 'UAU',
  defaultCategoryId: '106',
  linkSelector: 'a[href*="AuctionDetail.aspx"]',
  linkLabel: 'auction',
  searchPageWaitMs: 1500,
  extraPromptText: 'ราคาในหน้านี้คือราคาประมูล ให้ดึงราคาปัจจุบันหรือราคาสูงสุดของการประมูล',
  buildSearchUrl: () => SEARCH_URL,
  beforeCollectLinks: async (page, query) => {
    await page.fill('#txtSearch', query)
    await page.click('#btnSearch')
    await page.waitForTimeout(2000)
  },
})
