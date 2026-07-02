import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { readCronConfig } from '../utils/cronConfigStore'
import { mergeCronConfig } from '#shared/utils/cronConfig'
import type { CronConfigMap } from '#shared/types/cronConfig'

defineRouteMeta({
  openAPI: {
    tags: ['Cron'],
    summary: 'Cron config for every category group',
    description: 'Merged with defaults for any group that has not been configured yet.',
    responses: {
      200: {
        description: 'CronConfigMap — Record<categoryLabel, CronCategoryConfig>',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  cronExpression: { type: 'string', description: "5-field cron, e.g. '0 8 * * *'" },
                  queries: { type: 'array', items: { type: 'string' } },
                  maxSources: { type: 'number' },
                  itemsPerSource: { type: 'number' },
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
  const stored = await readCronConfig()
  const merged: CronConfigMap = {}
  for (const grp of CATEGORY_GROUPS) {
    merged[grp.label] = mergeCronConfig(stored[grp.label])
  }
  return merged
})
