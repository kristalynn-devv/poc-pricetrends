export interface ResultEntry {
  timestamp: string
  source: string
  url: string
  categoryId: string | null
  screenshotFile: string | null
  items: Record<string, unknown>[]
  roundId?: string
  searchQuery?: string
}

export interface DailyResultsResponse {
  date: string
  entries: ResultEntry[]
}

export interface ResultByScreenshotResponse {
  date: string
  entry: ResultEntry | null
}
