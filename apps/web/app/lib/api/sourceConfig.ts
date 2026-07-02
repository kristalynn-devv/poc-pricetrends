import type { SourceConfigMap, SourceCfg } from '#shared/types/sourceConfig'
import { API_PATHS } from '#shared/api/paths'
import { apiJson } from './client'

export function fetchSourceConfig(apiBase = ''): Promise<SourceConfigMap> {
  return apiJson(API_PATHS.sourceConfig, undefined, apiBase)
}

export function saveSourceConfig(name: string, config: SourceCfg, apiBase = ''): Promise<SourceCfg> {
  return apiJson(API_PATHS.sourceConfig, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config }),
  }, apiBase)
}

export function deleteSourceConfig(name: string, apiBase = ''): Promise<{ ok: boolean }> {
  return apiJson(API_PATHS.sourceConfig, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }, apiBase)
}

export function migrateSourceConfig(configs: SourceConfigMap, apiBase = ''): Promise<SourceConfigMap> {
  return apiJson(API_PATHS.sourceConfigMigrate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configs),
  }, apiBase)
}
