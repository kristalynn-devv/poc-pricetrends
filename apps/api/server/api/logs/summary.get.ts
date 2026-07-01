import { readDailySummary } from '../../utils/logger'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Aggregated daily log stats',
    parameters: [{ name: 'date', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYYMMDD, defaults to today' }],
    responses: {
      200: {
        description: 'daily summary',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                total: { type: 'number' },
                success: { type: 'number' },
                failed: { type: 'number' },
                bySource: { type: 'object', additionalProperties: { type: 'number' } },
                byCategory: { type: 'object', additionalProperties: { type: 'number' } },
                avgDuration: { type: 'number' },
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
  const date = typeof query.date === 'string' ? query.date : undefined
  return readDailySummary(date)
})
