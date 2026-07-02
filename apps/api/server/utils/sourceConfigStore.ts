import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SourceConfigMap, SourceCfg } from '#shared/types/sourceConfig'
import { mergeSourceConfig } from '#shared/utils/sourceConfig'

const DIR = join(process.cwd(), 'output')
const FILE = join(DIR, 'source-config.json')

export async function readSourceConfig(): Promise<SourceConfigMap> {
  try {
    const raw = await readFile(FILE, 'utf-8')
    return JSON.parse(raw) as SourceConfigMap
  } catch {
    return {}
  }
}

export async function writeSourceCategoryConfig(name: string, cfg: SourceCfg): Promise<SourceConfigMap> {
  await mkdir(DIR, { recursive: true })
  const all = await readSourceConfig()
  all[name] = mergeSourceConfig(cfg)
  await writeFile(FILE, JSON.stringify(all, null, 2), 'utf-8')
  return all
}

export async function deleteSourceCategoryConfig(name: string): Promise<SourceConfigMap> {
  await mkdir(DIR, { recursive: true })
  const all = await readSourceConfig()
  delete all[name]
  await writeFile(FILE, JSON.stringify(all, null, 2), 'utf-8')
  return all
}
