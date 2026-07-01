import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { mergeCronConfig, isValidCronExpression } from '#shared/utils/cronConfig'
import type { CronCategoryConfig } from '#shared/types/cronConfig'
import { writeCronCategoryConfig } from '../utils/cronConfigStore'
import { scheduleCategory } from '../utils/cronScheduler'

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
