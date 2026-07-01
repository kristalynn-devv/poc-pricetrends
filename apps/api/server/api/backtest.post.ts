import type { SearchRouteKey } from '#shared/constants/searchRoutes'
import { runAllBacktests, runSourceBacktest } from '../utils/backtest'
import { appendBacktestRun } from '../utils/backtestStore'
import { apiError, classifyError } from '../utils/errors'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Run a backtest against every search route',
    description: 'Runs a real sample query against every search route (or one, if { source } is given). Appends the result to output/backtest/YYYYMMDD.jsonl.',
    requestBody: {
      required: false,
      content: {
        'application/json': {
          schema: { type: 'object', properties: { source: { type: 'string', description: 'SearchRouteKey — omit to run all 17 sources concurrently' } } },
        },
      },
    },
    responses: {
      200: {
        description: 'BacktestRun',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                runId: { type: 'string' },
                timestamp: { type: 'string' },
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      source: { type: 'string' },
                      categoryId: { type: 'string' },
                      query: { type: 'string' },
                      pass: { type: 'boolean' },
                      productsFound: { type: 'number' },
                      screenshotOk: { type: 'number' },
                      extractOk: { type: 'number' },
                      durationMs: { type: 'number' },
                      error: { type: 'string', nullable: true },
                      timestamp: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ source?: SearchRouteKey }>(event).catch(() => ({}) as { source?: SearchRouteKey })
  const baseUrl = getRequestURL(event).origin
  const timestamp = new Date().toISOString()

  let results
  try {
    results = body?.source
      ? [await runSourceBacktest(body.source, baseUrl)]
      : await runAllBacktests(baseUrl)
  } catch (err) {
    const { errorType, message } = classifyError(err, 'config')
    throw apiError(500, errorType, message)
  }

  const run = { runId: timestamp, timestamp, results }
  await appendBacktestRun(run)
  return run
})
