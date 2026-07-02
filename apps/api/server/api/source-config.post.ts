import type { SourceCfg } from '#shared/types/sourceConfig'
import { mergeSourceConfig } from '#shared/utils/sourceConfig'
import { writeSourceCategoryConfig } from '../utils/sourceConfigStore'

defineRouteMeta({
  openAPI: {
    tags: ['Cron'],
    summary: 'Save per-source screenshot/limit config for one source',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'config'],
            properties: {
              name: { type: 'string', description: 'source name, e.g. chrono24-search' },
              config: { type: 'object' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'the saved SourceCfg', content: { 'application/json': { schema: { type: 'object' } } } },
      400: { description: 'missing name' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; config?: Partial<SourceCfg> }>(event)
  const name = body?.name
  if (!name) {
    throw createError({ statusCode: 400, message: 'missing name' })
  }
  const cfg = mergeSourceConfig(body.config)
  await writeSourceCategoryConfig(name, cfg)
  return cfg
})
