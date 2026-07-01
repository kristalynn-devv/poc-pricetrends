import type { CategoryRunConfig } from '../types/categoryConfig'

export const DEFAULT_CATEGORY_RUN_CONFIG: CategoryRunConfig = {
  maxSources: 3,
  itemsPerSource: 1,
}

export function mergeCategoryRunConfig(partial?: Partial<CategoryRunConfig>): CategoryRunConfig {
  if (!partial) return DEFAULT_CATEGORY_RUN_CONFIG
  const maxSources = partial.maxSources ? Number(partial.maxSources) : DEFAULT_CATEGORY_RUN_CONFIG.maxSources
  const itemsPerSource = partial.itemsPerSource ? Number(partial.itemsPerSource) : DEFAULT_CATEGORY_RUN_CONFIG.itemsPerSource
  return {
    maxSources: maxSources > 0 ? maxSources : DEFAULT_CATEGORY_RUN_CONFIG.maxSources,
    itemsPerSource: itemsPerSource > 0 ? itemsPerSource : DEFAULT_CATEGORY_RUN_CONFIG.itemsPerSource,
  }
}
