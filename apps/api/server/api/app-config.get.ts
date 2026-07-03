import { readAppConfig } from '../utils/appConfigStore'

defineRouteMeta({
  openAPI: {
    tags: ['App Config'],
    summary: 'App-wide config',
    description: 'Merged with defaults if never configured.',
    responses: {
      200: {
        description: 'AppConfig',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                concurrency: { type: 'number', description: 'จำนวน source ที่รันพร้อมกันได้สูงสุดต่อหมวด (manual run / cron / source check)' },
              },
            },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async () => {
  return readAppConfig()
})
