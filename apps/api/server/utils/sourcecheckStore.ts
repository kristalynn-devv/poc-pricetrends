import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { SourceCheckRun } from '#shared/types/sourcecheck'

const DIR = join(process.cwd(), 'output', 'sourcecheck')

export async function appendSourceCheckRun(run: SourceCheckRun): Promise<void> {
  await mkdir(DIR, { recursive: true })
  const date = run.timestamp.slice(0, 10).replace(/-/g, '')
  await appendFile(join(DIR, `${date}.jsonl`), JSON.stringify(run) + '\n', 'utf-8')
}

export async function readLatestSourceCheckRun(): Promise<SourceCheckRun | null> {
  await mkdir(DIR, { recursive: true })
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jsonl')).sort()
  const lastFile = files[files.length - 1]
  if (!lastFile) return null
  const content = await readFile(join(DIR, lastFile), 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)
  const lastLine = lines[lines.length - 1]
  if (!lastLine) return null
  return JSON.parse(lastLine) as SourceCheckRun
}

/** All runs recorded on a given date (YYYYMMDD), oldest first — empty array if the file doesn't exist. */
export async function readSourceCheckRunsByDate(date: string): Promise<SourceCheckRun[]> {
  const path = join(DIR, `${date}.jsonl`)
  if (!existsSync(path)) return []
  const content = await readFile(path, 'utf-8')
  return content.trim().split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) as SourceCheckRun } catch { return null }
  }).filter((r): r is SourceCheckRun => r !== null)
}

/** Dates (YYYYMMDD) that have at least one recorded run, newest first. */
export async function listSourceCheckDates(): Promise<string[]> {
  await mkdir(DIR, { recursive: true })
  return (await readdir(DIR))
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse()
}
