import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { readCronConfig } from '../utils/cronConfigStore'
import { mergeCronConfig } from '#shared/utils/cronConfig'
import type { CronConfigMap } from '#shared/types/cronConfig'

export default defineEventHandler(async () => {
  const stored = await readCronConfig()
  const merged: CronConfigMap = {}
  for (const grp of CATEGORY_GROUPS) {
    merged[grp.label] = mergeCronConfig(stored[grp.label])
  }
  return merged
})
