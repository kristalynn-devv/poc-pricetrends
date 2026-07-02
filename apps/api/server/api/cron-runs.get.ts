import { readRecentCronRuns } from '../utils/cronRunStore'

defineRouteMeta({
  openAPI: {
    tags: ['Cron'],
    summary: 'Recent cron run history',
    description: 'Last 30 cron run log entries across all categories, most recent first.',
    responses: {
      200: {
        description: 'CronRunLogEntry[]',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  runId: { type: 'string' },
                  label: { type: 'string' },
                  timestamp: { type: 'string' },
                  queries: { type: 'array', items: { type: 'string' } },
                  sourceCount: { type: 'number' },
                  durationMs: { type: 'number' },
                  error: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async () => {
  return readRecentCronRuns(30)
})
