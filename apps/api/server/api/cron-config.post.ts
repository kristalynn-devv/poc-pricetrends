import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { mergeCronConfig, isValidCronExpression } from '#shared/utils/cronConfig'
import type { CronCategoryConfig } from '#shared/types/cronConfig'
import { writeCronCategoryConfig } from '../utils/cronConfigStore'
import { scheduleCategory } from '../utils/cronScheduler'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Save cron config for one category',
    description: 'Saves and reschedules immediately — no server restart needed.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['label', 'config'],
            properties: {
              label: { type: 'string', description: 'must match a label in CATEGORY_GROUPS' },
              config: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  cronExpression: { type: 'string' },
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
    responses: {
      200: { description: 'the saved CronCategoryConfig', content: { 'application/json': { schema: { type: 'object' } } } },
      400: { description: 'invalid label, or cronExpression fails validation while enabled: true' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ label?: string; config?: Partial<CronCategoryConfig> }>(event)
  const label = body?.label
  if (!label || !CATEGORY_GROUPS.some((g) => g.label === label)) {
    throw createError({ statusCode: 400, message: 'invalid label' })
  }
  const cfg = mergeCronConfig(body.config)
  if (cfg.enabled && !isValidCronExpression(cfg.cronExpression)) {
    throw createError({ statusCode: 400, message: 'invalid cron expression' })
  }

  await writeCronCategoryConfig(label, cfg)
  await scheduleCategory(label)
  return cfg
})
