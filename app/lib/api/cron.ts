import type { CronConfigMap, CronCategoryConfig, CronRunLogEntry } from '#shared/types/cronConfig'
import { API_PATHS } from '#shared/api/paths'
import { apiJson } from './client'

export function fetchCronConfig(apiBase = ''): Promise<CronConfigMap> {
  return apiJson(API_PATHS.cronConfig, undefined, apiBase)
}

export function saveCronConfig(label: string, config: CronCategoryConfig, apiBase = ''): Promise<CronCategoryConfig> {
  return apiJson(API_PATHS.cronConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, config }),
  }, apiBase)
}

export function fetchCronRuns(apiBase = ''): Promise<CronRunLogEntry[]> {
  return apiJson(API_PATHS.cronRuns, undefined, apiBase)
}
