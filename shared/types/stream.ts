import type { BatchSummary, ItemResult } from './item'
import type { LogErrorType } from './log'

export interface StreamLogEvent {
  type: 'log'
  ts: string
  level: string
  msg: string
  data?: unknown
}

export interface StreamResultEvent extends ItemResult {
  type: 'result'
}

export interface StreamSearchPageEvent {
  type: 'searchpage'
  base64: string
}

export interface StreamDoneEvent {
  type: 'done'
  query?: string
  summary?: BatchSummary
  error?: string
  errorType?: LogErrorType
}

export type StreamEvent =
  | StreamLogEvent
  | StreamResultEvent
  | StreamSearchPageEvent
  | StreamDoneEvent

export interface BatchSearchRequest {
  query: string
  categoryId: string
  limit: number
  config?: Record<string, unknown>
  roundId?: string
}
