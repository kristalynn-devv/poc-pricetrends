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
