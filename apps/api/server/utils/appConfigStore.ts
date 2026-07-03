import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppConfig } from '#shared/types/appConfig'
import { mergeAppConfig } from '#shared/utils/appConfig'

const DIR = join(process.cwd(), 'output')
const FILE = join(DIR, 'app-config.json')

export async function readAppConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(FILE, 'utf-8')
    return mergeAppConfig(JSON.parse(raw))
  } catch {
    return mergeAppConfig()
  }
}

export async function writeAppConfig(cfg: Partial<AppConfig>): Promise<AppConfig> {
  await mkdir(DIR, { recursive: true })
  const merged = mergeAppConfig(cfg)
  await writeFile(FILE, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
