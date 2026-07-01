import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { DailySummary, LogEntry } from '#shared/types/log'
import { extractDomain } from '#shared/utils/domain'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function logPath(dateStr?: string): string {
  return join(process.cwd(), 'output', 'logs', `${dateStr ?? todayStr()}.jsonl`)
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const dir = join(process.cwd(), 'output', 'logs')
  await mkdir(dir, { recursive: true })
  await appendFile(logPath(), JSON.stringify(entry) + '\n', 'utf8')
}

export async function readDailySummary(dateStr?: string): Promise<DailySummary> {
  const date = dateStr ?? todayStr()
  const path = logPath(date)

  let lines: string[] = []
  if (existsSync(path)) {
    const raw = await readFile(path, 'utf8')
    lines = raw.split('\n').filter(Boolean)
  }

  const entries: LogEntry[] = lines.map((l) => {
    try { return JSON.parse(l) as LogEntry } catch { return null! }
  }).filter(Boolean)

  const summary: DailySummary = {
    date,
    total: entries.length,
    success: 0,
    failed: 0,
    avgDurationMs: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    errors: [],
    bySource: {},
    byCategory: {},
  }

  let totalDuration = 0
  for (const e of entries) {
    const ok = e.httpStatus >= 200 && e.httpStatus < 300 && !e.error
    if (ok) {
      summary.success++
    } else {
      summary.failed++
      summary.errors.push({
        timestamp: e.timestamp,
        url: e.url,
        source: e.source,
        ...(e.searchQuery ? { searchQuery: e.searchQuery } : {}),
        errorType: e.errorType,
        error: e.error ?? 'unknown',
      })
    }
    totalDuration += e.durationMs
    summary.totalInputTokens += e.geminiInputTokens ?? 0
    summary.totalOutputTokens += e.geminiOutputTokens ?? 0

    const src = e.source ?? extractDomain(e.url)
    summary.bySource[src] ??= { total: 0, success: 0, failed: 0 }
    summary.bySource[src].total++
    ok ? summary.bySource[src].success++ : summary.bySource[src].failed++

    const cat = e.categoryId ?? 'unknown'
    summary.byCategory[cat] ??= { total: 0, success: 0 }
    summary.byCategory[cat].total++
    if (ok) {
      summary.byCategory[cat].success++
    }
  }

  summary.avgDurationMs = entries.length ? Math.round(totalDuration / entries.length) : 0
  return summary
}
