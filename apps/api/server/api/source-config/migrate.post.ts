import type { SourceConfigMap } from '#shared/types/sourceConfig'
import { mergeSourceConfig } from '#shared/utils/sourceConfig'
import { readSourceConfig, writeSourceCategoryConfig } from '../../utils/sourceConfigStore'

defineRouteMeta({
  openAPI: {
    tags: ['Cron'],
    summary: 'One-time import of per-source config previously kept in browser localStorage',
    description: 'Only fills in sources not already present server-side — never overwrites an existing server-side override.',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: {
      200: { description: 'the merged SourceConfigMap', content: { 'application/json': { schema: { type: 'object' } } } },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<SourceConfigMap>(event)
  const existing = await readSourceConfig()
  let merged = existing
  for (const [name, cfg] of Object.entries(body ?? {})) {
    if (name in existing) continue
    merged = await writeSourceCategoryConfig(name, mergeSourceConfig(cfg))
  }
  return merged
})
