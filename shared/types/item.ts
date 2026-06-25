export interface ItemResult {
  index: number
  url: string
  filename: string | null
  base64: string | null
  screenshotOk: boolean
  extractOk: boolean
  items: Record<string, unknown>[]
  error?: string
  raw?: string
}

export interface BatchSummary {
  total: number
  screenshotOk: number
  extractOk: number
}
