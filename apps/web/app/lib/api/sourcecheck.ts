import type { SourceCheckRun } from '#shared/types/sourcecheck'
import { API_PATHS, withQuery } from '#shared/api/paths'
import { apiJson } from './client'

export interface SourceCheckHistory {
  date: string
  runs: SourceCheckRun[]
  availableDates: string[]
}

export function fetchLatestSourceCheck(apiBase = ''): Promise<SourceCheckRun | null> {
  return apiJson(API_PATHS.sourcecheck, undefined, apiBase)
}

export function runSourceCheck(apiBase = ''): Promise<SourceCheckRun> {
  return apiJson(API_PATHS.sourcecheck, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, apiBase)
}

export function fetchSourceCheckHistory(date: string, apiBase = ''): Promise<SourceCheckHistory> {
  return apiJson(withQuery(API_PATHS.sourcecheckHistory, { date }), undefined, apiBase)
}
