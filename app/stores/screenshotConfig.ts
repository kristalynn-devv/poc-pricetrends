import { defineStore } from 'pinia'

const STORAGE_KEY = 'screenshotCfg_v1'

const DEFAULTS = {
  viewportWidth: 1920,
  viewportHeight: 1080,
  fullPage: true,
  quality: 85,
  cropHeight: undefined as number | undefined,
  clip: { enabled: false, x: 0, y: 0, width: 1920, height: 1080 },
  limit: 1,
}

export const useScreenshotConfigStore = defineStore('screenshotConfig', () => {
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return { ...DEFAULTS, ...parsed, clip: { ...DEFAULTS.clip, ...(parsed.clip ?? {}) } }
      }
    } catch {}
    return { ...DEFAULTS, clip: { ...DEFAULTS.clip } }
  }

  const cfg = reactive(loadFromStorage())

  watch(cfg, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

  function reset() {
    Object.assign(cfg, { ...DEFAULTS })
    Object.assign(cfg.clip, DEFAULTS.clip)
    localStorage.removeItem(STORAGE_KEY)
  }

  return { cfg, reset }
})
