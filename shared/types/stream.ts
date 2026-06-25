import type { BatchSummary } from './item'
import type { ItemResult } from './item'

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
