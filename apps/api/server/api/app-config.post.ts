import type { AppConfig } from '#shared/types/appConfig'
import { writeAppConfig } from '../utils/appConfigStore'

defineRouteMeta({
  openAPI: {
    tags: ['App Config'],
    summary: 'Save app-wide config',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              concurrency: { type: 'number' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'the saved AppConfig', content: { 'application/json': { schema: { type: 'object' } } } },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<AppConfig>>(event)
  return writeAppConfig(body ?? {})
})
