import { readLatestBacktestRun } from '../utils/backtestStore'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Latest backtest run',
    responses: {
      200: { description: 'BacktestRun | null', content: { 'application/json': { schema: { type: 'object', nullable: true } } } },
    },
  },
})

export default defineEventHandler(async () => {
  return await readLatestBacktestRun()
})
