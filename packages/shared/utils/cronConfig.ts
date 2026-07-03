import type { CronCategoryConfig } from '../types/cronConfig'

export const DEFAULT_CRON_CONFIG: CronCategoryConfig = {
  enabled: false,
  cronExpression: '0 8 * * *',
  queries: [],
  maxSources: 3,
  itemsPerSource: 1,
}

export function mergeCronConfig(partial?: Partial<CronCategoryConfig>): CronCategoryConfig {
  if (!partial) return { ...DEFAULT_CRON_CONFIG }
  return {
    enabled: partial.enabled ?? DEFAULT_CRON_CONFIG.enabled,
    cronExpression: partial.cronExpression?.trim() || DEFAULT_CRON_CONFIG.cronExpression,
    queries: partial.queries?.filter((q) => q.trim().length > 0) ?? DEFAULT_CRON_CONFIG.queries,
    maxSources: partial.maxSources && partial.maxSources > 0 ? Number(partial.maxSources) : DEFAULT_CRON_CONFIG.maxSources,
    itemsPerSource: partial.itemsPerSource && partial.itemsPerSource > 0 ? Number(partial.itemsPerSource) : DEFAULT_CRON_CONFIG.itemsPerSource,
  }
}

/** Basic 5-field cron expression sanity check (minute hour day month weekday). */
export function isValidCronExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  return parts.length === 5
}
