import type { DailyResultsResponse, ResultByScreenshotResponse } from '#shared/types/result'
import { API_PATHS, withQuery } from '#shared/api/paths'
import { apiJson } from './client'

export function fetchDailyResults(date: string, apiBase = ''): Promise<DailyResultsResponse> {
  return apiJson(withQuery(API_PATHS.results.entries, { date }), undefined, apiBase)
}

export function fetchResultByScreenshot(
  date: string,
  screenshotFile: string,
  apiBase = '',
): Promise<ResultByScreenshotResponse> {
  return apiJson(
    withQuery(API_PATHS.results.entries, { date, screenshotFile }),
    undefined,
    apiBase,
  )
}
