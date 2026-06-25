import type { DailySummary, LogEntry } from '#shared/types/log'
import { API_PATHS, withQuery } from '#shared/api/paths'
import { apiJson } from './client'

interface LogEntriesResponse {
  date: string
  entries: LogEntry[]
}

export function fetchLogEntries(date: string, apiBase = ''): Promise<LogEntriesResponse> {
  return apiJson(withQuery(API_PATHS.logs.entries, { date }), undefined, apiBase)
}

export function fetchDailySummary(date: string, apiBase = ''): Promise<DailySummary> {
  return apiJson(withQuery(API_PATHS.logs.summary, { date }), undefined, apiBase)
}
