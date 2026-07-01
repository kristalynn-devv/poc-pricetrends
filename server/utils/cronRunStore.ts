import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CronRunLogEntry } from '#shared/types/cronConfig'

const DIR = join(process.cwd(), 'output', 'cron-runs')

export async function appendCronRun(entry: CronRunLogEntry): Promise<void> {
  await mkdir(DIR, { recursive: true })
  const date = entry.timestamp.slice(0, 10).replace(/-/g, '')
  await appendFile(join(DIR, `${date}.jsonl`), JSON.stringify(entry) + '\n', 'utf-8')
}

export async function readRecentCronRuns(limit = 20): Promise<CronRunLogEntry[]> {
  await mkdir(DIR, { recursive: true })
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jsonl')).sort().reverse()
  const entries: CronRunLogEntry[] = []
  for (const file of files) {
    const content = await readFile(join(DIR, file), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean).reverse()
    for (const line of lines) {
      try { entries.push(JSON.parse(line)) } catch { /* skip */ }
      if (entries.length >= limit) return entries
    }
  }
  return entries
}
