export const API_PATHS = {
  results: {
    entries: '/api/results/entries',
  },
  logs: {
    entries: '/api/logs/entries',
    summary: '/api/logs/summary',
  },
  screenshot: '/api/screenshot',
  analyze: '/api/analyze',
  extract: '/api/extract',
  sourcecheck: '/api/sourcecheck',
  sourcecheckHistory: '/api/sourcecheck/history',
  cronConfig: '/api/cron-config',
  cronRuns: '/api/cron-runs',
  sourceConfig: '/api/source-config',
  sourceConfigMigrate: '/api/source-config/migrate',
} as const

export function screenshotPath(file: string): string {
  return `${API_PATHS.screenshot}?file=${encodeURIComponent(file)}`
}

export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v)
  }
  const q = qs.toString()
  return q ? `${path}?${q}` : path
}
