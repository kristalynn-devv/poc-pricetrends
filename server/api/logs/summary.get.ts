import { readDailySummary } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : undefined
  return readDailySummary(date)
})
