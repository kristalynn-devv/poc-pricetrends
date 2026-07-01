import { readDailyResults } from '../../utils/resultsStore'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Daily extracted results',
    parameters: [
      { name: 'date', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYYMMDD, defaults to today (UTC)' },
      { name: 'screenshotFile', in: 'query', required: false, schema: { type: 'string' }, description: 'single entry lookup by screenshot filename' },
    ],
    responses: {
      200: {
        description: 'entries[] without screenshotFile, single entry with it',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                entries: { type: 'array', items: { type: 'object' } },
                entry: { type: 'object', nullable: true },
              },
            },
          },
        },
      },
    },
  },
})

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
