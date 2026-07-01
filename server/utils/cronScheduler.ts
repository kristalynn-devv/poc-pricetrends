import { schedule, validate, type ScheduledTask } from 'node-cron'
import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { readCronCategoryConfig } from './cronConfigStore'
import { runCategoryCron } from './cronRunner'

const tasks = new Map<string, ScheduledTask>()

function getBaseUrl(): string {
  const port = process.env.NITRO_PORT || process.env.PORT || 3000
  return `http://localhost:${port}`
}

export async function scheduleCategory(label: string): Promise<void> {
  const existing = tasks.get(label)
  if (existing) {
    existing.stop()
    tasks.delete(label)
  }

  const cfg = await readCronCategoryConfig(label)
  if (!cfg.enabled || !validate(cfg.cronExpression)) return

  const task = schedule(cfg.cronExpression, () => {
    runCategoryCron(label, cfg, getBaseUrl()).catch(() => {})
  })
  tasks.set(label, task)
}

export async function initCronScheduler(): Promise<void> {
  for (const grp of CATEGORY_GROUPS) {
    await scheduleCategory(grp.label)
  }
}
