import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CronConfigMap, CronCategoryConfig } from '#shared/types/cronConfig'
import { mergeCronConfig } from '#shared/utils/cronConfig'

const DIR = join(process.cwd(), 'output')
const FILE = join(DIR, 'cron-config.json')

export async function readCronConfig(): Promise<CronConfigMap> {
  try {
    const raw = await readFile(FILE, 'utf-8')
    return JSON.parse(raw) as CronConfigMap
  } catch {
    return {}
  }
}

export async function readCronCategoryConfig(label: string): Promise<CronCategoryConfig> {
  const all = await readCronConfig()
  return mergeCronConfig(all[label])
}

export async function writeCronCategoryConfig(label: string, cfg: CronCategoryConfig): Promise<CronConfigMap> {
  await mkdir(DIR, { recursive: true })
  const all = await readCronConfig()
  all[label] = cfg
  await writeFile(FILE, JSON.stringify(all, null, 2), 'utf-8')
  return all
}
