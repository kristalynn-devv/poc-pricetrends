import type { AppConfig } from '#shared/types/appConfig'
import { API_PATHS } from '#shared/api/paths'
import { apiJson } from './client'

export function fetchAppConfig(apiBase = ''): Promise<AppConfig> {
  return apiJson(API_PATHS.appConfig, undefined, apiBase)
}

export function saveAppConfig(config: AppConfig, apiBase = ''): Promise<AppConfig> {
  return apiJson(API_PATHS.appConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }, apiBase)
}
