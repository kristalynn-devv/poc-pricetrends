import type { BatchSearchRequest, StreamEvent } from '#shared/types/stream'
import { apiFetch } from './client'

export async function* streamBatchSearch(
  route: string,
  body: BatchSearchRequest,
  apiBase = '',
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await apiFetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(300_000),
  }, apiBase)

  if (!res.body) throw new Error('No response stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        yield JSON.parse(line) as StreamEvent
      } catch { /* skip malformed line */ }
    }
  }
}
