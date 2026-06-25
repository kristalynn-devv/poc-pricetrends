import type { ScreenshotClip, ScreenshotConfig } from '#shared/types/screenshot'

export type { ScreenshotClip, ScreenshotConfig } from '#shared/types/screenshot'

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
  const cropHeight = partial.cropHeight != null ? Number(partial.cropHeight) : undefined
  const vw = partial.viewportWidth ? Number(partial.viewportWidth) : DEFAULT_SCREENSHOT_CONFIG.viewportWidth
  const vh = partial.viewportHeight ? Number(partial.viewportHeight) : DEFAULT_SCREENSHOT_CONFIG.viewportHeight
  const quality = partial.quality ? Number(partial.quality) : DEFAULT_SCREENSHOT_CONFIG.quality
  return {
    ...DEFAULT_SCREENSHOT_CONFIG,
    ...partial,
    viewportWidth: vw,
    viewportHeight: vh,
    quality,
    cropHeight: cropHeight && cropHeight > 0 ? cropHeight : undefined,
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
    screenshotOpts: { fullPage: true, type: 'jpeg', quality: cfg.quality, clip },
    cropHeight: cfg.cropHeight && cfg.cropHeight > 0 ? cfg.cropHeight : undefined,
  }
}
