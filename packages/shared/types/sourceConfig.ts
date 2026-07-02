export interface SourceCfg {
  viewportWidth: number
  viewportHeight: number
  quality: number
  cropHeight?: number
  clip: { enabled: boolean; x: number; y: number; width: number; height: number }
  limit: number
}

export type SourceConfigMap = Record<string, SourceCfg>
