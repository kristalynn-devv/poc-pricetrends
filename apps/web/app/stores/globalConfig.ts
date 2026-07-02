import { defineStore } from 'pinia'
import type { SourceConfigMap, SourceCfg } from '#shared/types/sourceConfig'
import { DEFAULT_SOURCE_CFG } from '#shared/utils/sourceConfig'

export type { SourceCfg } from '#shared/types/sourceConfig'
export { DEFAULT_SOURCE_CFG as SOURCE_CFG_DEFAULTS } from '#shared/utils/sourceConfig'

/** Legacy per-browser storage — read once on load() to migrate into the server-side store, then left untouched. */
const LEGACY_STORAGE_KEY = 'sourceConfigs_v1'

export const useSourceConfigStore = defineStore('sourceConfig', () => {
  const { fetchSourceConfig, saveSourceConfig, deleteSourceConfig, migrateSourceConfig } = useApi()

  const configs = reactive<SourceConfigMap>({})
  const loaded = ref(false)

  function readLegacyStorage(): SourceConfigMap {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  }

  async function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      Object.assign(configs, await fetchSourceConfig())
    } catch { /* ignore — server may not be reachable yet */ }

    // one-time import of settings from a previous per-browser install
    const legacy = readLegacyStorage()
    if (Object.keys(legacy).length > 0) {
      try {
        const merged = await migrateSourceConfig(legacy)
        Object.assign(configs, merged)
      } catch { /* ignore — retry next load */ }
    }
  }

  function getSourceCfg(name: string): SourceCfg {
    return configs[name] ?? { ...DEFAULT_SOURCE_CFG, clip: { ...DEFAULT_SOURCE_CFG.clip } }
  }

  async function setSourceCfg(name: string, val: SourceCfg) {
    const saved = await saveSourceConfig(name, { ...val, clip: { ...val.clip } })
    configs[name] = saved
  }

  async function resetSourceCfg(name: string) {
    delete configs[name]
    await deleteSourceConfig(name)
  }

  function hasCustomCfg(name: string): boolean {
    return name in configs
  }

  return { configs, loaded, load, getSourceCfg, setSourceCfg, resetSourceCfg, hasCustomCfg }
})
