export interface CronCategoryConfig {
  enabled: boolean
  /** 5-field cron expression (นาที ชม. วัน เดือน วันในสัปดาห์) */
  cronExpression: string
  queries: string[]
  maxSources: number
  itemsPerSource: number
}

export type CronConfigMap = Record<string, CronCategoryConfig>

export interface CronRunLogEntry {
  runId: string
  label: string
  timestamp: string
  queries: string[]
  sourceCount: number
  durationMs: number
  error?: string
}
