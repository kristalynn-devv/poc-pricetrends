import { appendLog } from './logger'
import { appendResult } from './resultsStore'

export interface PersistExtractionInput {
  timestamp: string
  source: string
  url: string
  categoryId: string | null
  screenshotFile: string
  items: Record<string, any>[]
  durationMs: number
  searchQuery?: string
  roundId?: string
  geminiInputTokens?: number
  geminiOutputTokens?: number
  imageWidth?: number
  imageHeight?: number
}

/** Save extracted items (results) + operational log in one call. */
export async function persistExtraction(input: PersistExtractionInput): Promise<void> {
  const {
    timestamp, source, url, categoryId, screenshotFile, items, durationMs,
    searchQuery, roundId, geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
  } = input

  await Promise.all([
    appendResult({ timestamp, source, url, categoryId, screenshotFile, items, roundId, searchQuery }),
    appendLog({
      timestamp, source, url, categoryId, searchQuery, roundId, durationMs,
      httpStatus: 200, screenshotFile, error: null, errorType: null,
      geminiInputTokens, geminiOutputTokens, imageWidth, imageHeight,
    }),
  ])
}
