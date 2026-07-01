import { defineStore } from 'pinia'
import type { CronConfigMap, CronCategoryConfig, CronRunLogEntry } from '#shared/types/cronConfig'
import { DEFAULT_CRON_CONFIG } from '#shared/utils/cronConfig'

export const useCronConfigStore = defineStore('cronConfig', () => {
  const { fetchCronConfig, saveCronConfig, fetchCronRuns } = useApi()

  const configs = reactive<CronConfigMap>({})
  const runs = ref<CronRunLogEntry[]>([])
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      Object.assign(configs, await fetchCronConfig())
    } catch { /* ignore — server may not be reachable yet */ }
  }

  async function loadRuns() {
    try {
      runs.value = await fetchCronRuns()
    } catch { /* ignore */ }
  }

  function getCronCfg(label: string): CronCategoryConfig {
    return configs[label] ?? { ...DEFAULT_CRON_CONFIG }
  }

  async function setCronCfg(label: string, cfg: CronCategoryConfig) {
    const saved = await saveCronConfig(label, cfg)
    configs[label] = saved
  }

  return { configs, runs, load, loadRuns, getCronCfg, setCronCfg }
})
