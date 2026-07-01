import type { BacktestRun } from '#shared/types/backtest'
import { API_PATHS } from '#shared/api/paths'
import { apiJson } from './client'

export function fetchLatestBacktest(apiBase = ''): Promise<BacktestRun | null> {
  return apiJson(API_PATHS.backtest, undefined, apiBase)
}

export function runBacktest(apiBase = ''): Promise<BacktestRun> {
  return apiJson(API_PATHS.backtest, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, apiBase)
}
