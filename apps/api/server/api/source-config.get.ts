import { readSourceConfig } from '../utils/sourceConfigStore'

defineRouteMeta({
  openAPI: {
    tags: ['Cron'],
    summary: 'Per-source screenshot/limit config for every configured source',
    description: 'Only sources with a saved override are present — missing sources fall back to client-side defaults.',
    responses: {
      200: {
        description: 'SourceConfigMap — Record<sourceName, SourceCfg>',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    },
  },
})

export default defineEventHandler(async () => {
  return readSourceConfig()
})
