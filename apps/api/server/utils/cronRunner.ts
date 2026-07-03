import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { SEARCH_ROUTE_CATEGORY } from '#shared/constants/searchRoutes'
import type { CronCategoryConfig, CronRunLogEntry } from '#shared/types/cronConfig'
import type { StreamEvent } from '#shared/types/stream'
import type { SourceCfg } from '#shared/types/sourceConfig'
import { mergeSourceConfig } from '#shared/utils/sourceConfig'
import { appendCronRun } from './cronRunStore'
import { readSourceConfig } from './sourceConfigStore'
import { readAppConfig } from './appConfigStore'

const CRON_TIMEOUT_MS = 120_000

async function runOne(apiRoute: string, query: string, categoryId: string, limit: number, roundId: string, baseUrl: string, screenshotConfig: SourceCfg): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CRON_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}${apiRoute}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, categoryId, limit, roundId, config: screenshotConfig }),
      signal: controller.signal,
    })
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        try { JSON.parse(line) as StreamEvent } catch { /* ignore */ }
      }
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** รัน batch-search อัตโนมัติสำหรับหมวดเดียว ตาม cron config — แต่ละ route persist ผลลัพธ์ของตัวเองอยู่แล้ว */
export async function runCategoryCron(label: string, cfg: CronCategoryConfig, baseUrl: string): Promise<void> {
  const start = Date.now()
  const roundId = 'cron-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
  const grp = CATEGORY_GROUPS.find((g) => g.label === label)
  const entry: CronRunLogEntry = {
    runId: roundId, label, timestamp: new Date().toISOString(),
    queries: cfg.queries, sourceCount: 0, durationMs: 0,
  }

  if (!grp || cfg.queries.length === 0) {
    entry.error = !grp ? 'ไม่พบหมวดนี้' : 'ยังไม่ได้ตั้งค่า query'
    entry.durationMs = Date.now() - start
    await appendCronRun(entry)
    return
  }

  const sources = grp.sources.filter((s) => s.apiRoute).slice(0, cfg.maxSources)
  entry.sourceCount = sources.length
  const fallbackCategoryId = grp.ids[0] ?? ''
  const sourceConfigMap = await readSourceConfig()

  const tasks = sources.flatMap((src) => cfg.queries.map((query) => ({ src, query })))
  let i = 0
  const { concurrency } = await readAppConfig()
  const CONCURRENCY = Math.max(1, Math.min(concurrency, tasks.length))
  const errors: string[] = []

  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      const t = tasks[idx]
      if (!t) continue
      const categoryId = SEARCH_ROUTE_CATEGORY[t.src.apiRoute as keyof typeof SEARCH_ROUTE_CATEGORY] ?? fallbackCategoryId
      const hasOverride = t.src.name in sourceConfigMap
      const screenshotConfig = hasOverride
        ? mergeSourceConfig(sourceConfigMap[t.src.name])
        : mergeSourceConfig({ limit: cfg.itemsPerSource })
      try {
        await runOne(t.src.apiRoute!, t.query, categoryId, screenshotConfig.limit, roundId, baseUrl, screenshotConfig)
      } catch (err) {
        errors.push(`${t.src.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  entry.durationMs = Date.now() - start
  if (errors.length > 0) entry.error = errors.join(' | ')
  await appendCronRun(entry)
}
