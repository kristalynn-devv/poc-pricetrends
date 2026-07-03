import type { AppConfig } from '../types/appConfig'

export const DEFAULT_APP_CONFIG: AppConfig = {
  concurrency: 3,
}

export function mergeAppConfig(partial?: Partial<AppConfig>): AppConfig {
  if (!partial) return { ...DEFAULT_APP_CONFIG }
  const concurrency = partial.concurrency ? Number(partial.concurrency) : DEFAULT_APP_CONFIG.concurrency
  return {
    concurrency: concurrency > 0 ? concurrency : DEFAULT_APP_CONFIG.concurrency,
  }
}
