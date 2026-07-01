import { defineStore } from 'pinia'

const STORAGE_KEY = 'sourceConfigs_v1'

export interface SourceCfg {
  viewportWidth: number
  viewportHeight: number
  quality: number
  cropHeight?: number
  clip: { enabled: boolean; x: number; y: number; width: number; height: number }
  limit: number
}

export const SOURCE_CFG_DEFAULTS: SourceCfg = {
  viewportWidth: 1920,
  viewportHeight: 1080,
  quality: 85,
  cropHeight: undefined,
  clip: { enabled: false, x: 0, y: 0, width: 1920, height: 1080 },
  limit: 1,
}

export const useSourceConfigStore = defineStore('sourceConfig', () => {
  function loadFromStorage(): Record<string, SourceCfg> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  }

  const configs = reactive<Record<string, SourceCfg>>(loadFromStorage())

  watch(configs, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

  function getSourceCfg(name: string): SourceCfg {
    return configs[name] ?? { ...SOURCE_CFG_DEFAULTS, clip: { ...SOURCE_CFG_DEFAULTS.clip } }
  }

  function setSourceCfg(name: string, val: SourceCfg) {
    configs[name] = { ...val, clip: { ...val.clip } }
  }

  function resetSourceCfg(name: string) {
    delete configs[name]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
  }

  function hasCustomCfg(name: string): boolean {
    return name in configs
  }

  return { configs, getSourceCfg, setSourceCfg, resetSourceCfg, hasCustomCfg }
})
