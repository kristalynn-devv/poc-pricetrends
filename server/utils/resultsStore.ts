import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export interface ResultEntry {
  timestamp: string
  source: string
  url: string
  categoryId: string | null
  screenshotFile: string | null
  items: Record<string, any>[]
  roundId?: string
  searchQuery?: string
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function resultsPath(dateStr?: string): string {
  return join(process.cwd(), 'output', 'results', `${dateStr ?? todayStr()}.jsonl`)
}

export async function appendResult(entry: ResultEntry): Promise<void> {
  const dir = join(process.cwd(), 'output', 'results')
  await mkdir(dir, { recursive: true })
  await appendFile(resultsPath(), JSON.stringify(entry) + '\n', 'utf8')
}

export async function readDailyResults(dateStr?: string): Promise<ResultEntry[]> {
  const path = resultsPath(dateStr ?? todayStr())
  if (!existsSync(path)) return []
  const raw = await readFile(path, 'utf8')
  return raw.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) as ResultEntry } catch { return null! }
  }).filter(Boolean)
}
