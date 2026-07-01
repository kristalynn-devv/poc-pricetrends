import { readLatestBacktestRun } from '../utils/backtestStore'

export default defineEventHandler(async () => {
  return await readLatestBacktestRun()
})
