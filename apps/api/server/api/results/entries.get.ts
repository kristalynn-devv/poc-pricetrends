import { readDailyResults } from '../../utils/resultsStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const screenshotFile = typeof query.screenshotFile === 'string' ? query.screenshotFile : null
  const entries = await readDailyResults(date)
  if (screenshotFile) {
    const entry = entries.find(e => e.screenshotFile === screenshotFile) ?? null
    return { date, entry }
  }
  return { date, entries }
})
