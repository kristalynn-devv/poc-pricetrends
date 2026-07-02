export interface SourceCheckResult {
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

export interface SourceCheckRun {
  runId: string
  timestamp: string
  results: SourceCheckResult[]
}
