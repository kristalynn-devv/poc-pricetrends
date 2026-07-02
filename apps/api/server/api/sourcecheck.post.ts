import type { SearchRouteKey } from '#shared/constants/searchRoutes'
import { runAllSourceChecks, runSourceCheck } from '../utils/sourcecheck'
import { appendSourceCheckRun } from '../utils/sourcecheckStore'
import { apiError, classifyError } from '../utils/errors'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Run a source check against every search route',
    description: 'Runs a real sample query against every search route (or one, if { source } is given). Appends the result to output/sourcecheck/YYYYMMDD.jsonl.',
    requestBody: {
      required: false,
      content: {
        'application/json': {
          schema: { type: 'object', properties: { source: { type: 'string', description: 'SearchRouteKey — omit to run all 17 sources' } } },
        },
      },
    },
    responses: {
      200: {
        description: 'SourceCheckRun',
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
      ? [await runSourceCheck(body.source, baseUrl)]
      : await runAllSourceChecks(baseUrl)
  } catch (err) {
    const { errorType, message } = classifyError(err, 'config')
    throw apiError(500, errorType, message)
  }

  const run = { runId: timestamp, timestamp, results }
  await appendSourceCheckRun(run)
  return run
})
