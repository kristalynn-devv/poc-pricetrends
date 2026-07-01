import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BacktestRun } from '#shared/types/backtest'

const DIR = join(process.cwd(), 'output', 'backtest')

export async function appendBacktestRun(run: BacktestRun): Promise<void> {
  await mkdir(DIR, { recursive: true })
  const date = run.timestamp.slice(0, 10).replace(/-/g, '')
  await appendFile(join(DIR, `${date}.jsonl`), JSON.stringify(run) + '\n', 'utf-8')
}

export async function readLatestBacktestRun(): Promise<BacktestRun | null> {
  await mkdir(DIR, { recursive: true })
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jsonl')).sort()
  const lastFile = files[files.length - 1]
  if (!lastFile) return null
  const content = await readFile(join(DIR, lastFile), 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)
  const lastLine = lines[lines.length - 1]
  if (!lastLine) return null
  return JSON.parse(lastLine) as BacktestRun
}
