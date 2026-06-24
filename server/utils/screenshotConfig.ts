export interface ScreenshotClip {
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotConfig {
  viewportWidth: number
  viewportHeight: number
  fullPage: boolean
  quality: number
  cropHeight?: number
  clip: ScreenshotClip
  limit: number
}

export const DEFAULT_SCREENSHOT_CONFIG: ScreenshotConfig = {
  viewportWidth: 1920,
  viewportHeight: 1080,
  fullPage: true,
  quality: 85,
  cropHeight: undefined,
  clip: { enabled: false, x: 0, y: 0, width: 1920, height: 1080 },
  limit: 1,
}

export function mergeScreenshotConfig(partial?: Partial<ScreenshotConfig>): ScreenshotConfig {
  if (!partial) return DEFAULT_SCREENSHOT_CONFIG
  return {
    ...DEFAULT_SCREENSHOT_CONFIG,
    ...partial,
    clip: { ...DEFAULT_SCREENSHOT_CONFIG.clip, ...(partial.clip ?? {}) },
  }
}

export function buildScreenshotOptions(cfg: ScreenshotConfig): {
  viewport: { width: number; height: number }
  screenshotOpts: Parameters<import('playwright').Page['screenshot']>[0]
  cropHeight: number | undefined
} {
  let clip: { x: number; y: number; width: number; height: number } | undefined
  if (cfg.clip.enabled) {
    clip = { x: cfg.clip.x, y: cfg.clip.y, width: cfg.clip.width, height: cfg.clip.height }
  }
  return {
    viewport: { width: cfg.viewportWidth, height: cfg.viewportHeight },
    screenshotOpts: { fullPage: cfg.fullPage, type: 'jpeg', quality: cfg.quality, clip },
    cropHeight: cfg.cropHeight && cfg.cropHeight > 0 ? cfg.cropHeight : undefined,
  }
}
