export interface BacktestResult {
  source: string
  categoryId: string
  query: string
  pass: boolean
  productsFound: number
  screenshotOk: number
  extractOk: number
  durationMs: number
  error: string | null
  timestamp: string
}

export interface BacktestRun {
  runId: string
  timestamp: string
  results: BacktestResult[]
}
