import { defineStore } from 'pinia'
import { DEFAULT_CATEGORY_RUN_CONFIG, mergeCategoryRunConfig } from '#shared/utils/categoryConfig'
import type { CategoryRunConfig } from '#shared/types/categoryConfig'

const STORAGE_KEY = 'categoryRunConfigs_v1'

export { DEFAULT_CATEGORY_RUN_CONFIG }
export type { CategoryRunConfig }

export const useCategoryConfigStore = defineStore('categoryConfig', () => {
  function loadFromStorage(): Record<string, Partial<CategoryRunConfig>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  }

  const configs = reactive<Record<string, Partial<CategoryRunConfig>>>(loadFromStorage())

  watch(configs, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

  function getCategoryCfg(key: string): CategoryRunConfig {
    return mergeCategoryRunConfig(configs[key])
  }

  function setCategoryCfg(key: string, val: CategoryRunConfig) {
    configs[key] = { ...val }
  }

  function resetCategoryCfg(key: string) {
    delete configs[key]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
  }

  function hasCustomCfg(key: string): boolean {
    return key in configs
  }

  return { configs, getCategoryCfg, setCategoryCfg, resetCategoryCfg, hasCustomCfg }
})
