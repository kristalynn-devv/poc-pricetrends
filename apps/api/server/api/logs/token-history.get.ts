import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { LogEntry } from '#shared/types/log'

const INPUT_PRICE_PER_M = 0.25
const OUTPUT_PRICE_PER_M = 1.50
const THB_PER_USD = 36

function calcCost(inputTokens: number, outputTokens: number): number {
  return ((inputTokens * INPUT_PRICE_PER_M + outputTokens * OUTPUT_PRICE_PER_M) / 1_000_000) * THB_PER_USD
}

defineRouteMeta({
  openAPI: {
    tags: ['Logs'],
    summary: 'Token usage history per day, broken down by category',
    responses: { 200: { description: 'token history' } },
  },
})

export default defineEventHandler(async () => {
  const logsDir = join(process.cwd(), 'output', 'logs')
  if (!existsSync(logsDir)) return { days: [] }

  const files = (await readdir(logsDir))
    .filter((f) => /^\d{8}\.jsonl$/.test(f))
    .sort()

  const days = await Promise.all(files.map(async (file) => {
    const date = file.replace('.jsonl', '')
    const raw = await readFile(join(logsDir, file), 'utf8')
    const entries: LogEntry[] = raw.split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l) as LogEntry } catch { return null! }
    }).filter(Boolean)

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalRequests = 0
    const byCategory: Record<string, { inputTokens: number; outputTokens: number; requests: number }> = {}

    for (const e of entries) {
      const inTok = e.geminiInputTokens ?? 0
      const outTok = e.geminiOutputTokens ?? 0
      totalInputTokens += inTok
      totalOutputTokens += outTok
      totalRequests++

      const cat = e.categoryId ?? 'unknown'
      byCategory[cat] ??= { inputTokens: 0, outputTokens: 0, requests: 0 }
      byCategory[cat].inputTokens += inTok
      byCategory[cat].outputTokens += outTok
      byCategory[cat].requests++
    }

    return {
      date,
      totalRequests,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostThb: calcCost(totalInputTokens, totalOutputTokens),
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, s]) => [cat, {
          ...s,
          estimatedCostThb: calcCost(s.inputTokens, s.outputTokens),
        }])
      ),
    }
  }))

  return { days }
})
