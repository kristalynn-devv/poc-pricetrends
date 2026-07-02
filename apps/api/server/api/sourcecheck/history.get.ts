import { readSourceCheckRunsByDate, listSourceCheckDates } from '../../utils/sourcecheckStore'

defineRouteMeta({
  openAPI: {
    tags: ['Source Check'],
    summary: 'Source-check run history for a day, plus which dates have data',
    parameters: [{ name: 'date', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYYMMDD, defaults to today' }],
    responses: {
      200: {
        description: 'runs empty array if none recorded for that date',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { date: { type: 'string' }, runs: { type: 'array', items: { type: 'object' } }, availableDates: { type: 'array', items: { type: 'string' } } } },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const [runs, availableDates] = await Promise.all([
    readSourceCheckRunsByDate(date),
    listSourceCheckDates(),
  ])
  return { date, runs, availableDates }
})
