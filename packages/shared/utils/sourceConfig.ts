import type { SourceCfg } from '../types/sourceConfig'

export const DEFAULT_SOURCE_CFG: SourceCfg = {
  viewportWidth: 1920,
  viewportHeight: 1080,
  quality: 85,
  cropHeight: undefined,
  clip: { enabled: false, x: 0, y: 0, width: 1920, height: 1080 },
  limit: 1,
}

export function mergeSourceConfig(partial?: Partial<SourceCfg>): SourceCfg {
  if (!partial) return { ...DEFAULT_SOURCE_CFG, clip: { ...DEFAULT_SOURCE_CFG.clip } }
  return {
    viewportWidth: partial.viewportWidth ?? DEFAULT_SOURCE_CFG.viewportWidth,
    viewportHeight: partial.viewportHeight ?? DEFAULT_SOURCE_CFG.viewportHeight,
    quality: partial.quality ?? DEFAULT_SOURCE_CFG.quality,
    cropHeight: partial.cropHeight,
    clip: { ...DEFAULT_SOURCE_CFG.clip, ...partial.clip },
    limit: partial.limit ?? DEFAULT_SOURCE_CFG.limit,
  }
}
