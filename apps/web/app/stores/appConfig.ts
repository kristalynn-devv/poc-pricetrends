import { defineStore } from 'pinia'
import type { AppConfig } from '#shared/types/appConfig'
import { DEFAULT_APP_CONFIG } from '#shared/utils/appConfig'

export const useAppConfigStore = defineStore('appConfig', () => {
  const { fetchAppConfig, saveAppConfig } = useApi()

  const cfg = reactive<AppConfig>({ ...DEFAULT_APP_CONFIG })
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      Object.assign(cfg, await fetchAppConfig())
    } catch { /* ignore — server may not be reachable yet */ }
  }

  async function save(next: AppConfig) {
    const saved = await saveAppConfig(next)
    Object.assign(cfg, saved)
  }

  return { cfg, loaded, load, save }
})
