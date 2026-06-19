import { readDailyResults } from '../../utils/resultsStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const entries = await readDailyResults(date)
  return { date, entries }
})
