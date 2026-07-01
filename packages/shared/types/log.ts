export type LogErrorType = 'timeout' | 'screenshot' | 'extraction' | 'parse' | 'config' | 'notfound' | null

export interface LogEntry {
  timestamp: string
  source: string
  url: string
  categoryId: string | null
  searchQuery?: string
  roundId?: string
  durationMs: number
  httpStatus: number
  screenshotFile: string | null
  error: string | null
  errorType: LogErrorType
  geminiInputTokens?: number
  geminiOutputTokens?: number
  imageWidth?: number
  imageHeight?: number
}

export interface DailySummaryError {
  timestamp: string
  url: string
  source: string
  searchQuery?: string
  errorType: string | null
  error: string
}

export interface DailySummary {
  date: string
  total: number
  success: number
  failed: number
  avgDurationMs: number
  totalInputTokens: number
  totalOutputTokens: number
  errors: DailySummaryError[]
  bySource: Record<string, { total: number; success: number; failed: number }>
  byCategory: Record<string, { total: number; success: number }>
}
