import type { SearchRouteKey } from '#shared/constants/searchRoutes'
import { runAllBacktests, runSourceBacktest } from '../utils/backtest'
import { appendBacktestRun } from '../utils/backtestStore'
import { apiError, classifyError } from '../utils/errors'

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
