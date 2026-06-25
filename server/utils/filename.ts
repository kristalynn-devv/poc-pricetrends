const SOURCE_CODES: Record<string, string> = {
  'chrono24.com': 'CHR',
  'watchuseek.com': 'WUS',
  'rolex.com': 'ROL',
  'tarad.com': 'TAR',
  'kaidee.com': 'KAI',
  'shopee.co.th': 'SHP',
  'lazada.co.th': 'LAZ',
  'facebook.com': 'FBK',
  'instagram.com': 'INS',
  'ebay.com': 'EBY',
  'yahoo.co.jp': 'YAH',
  'mercari.com': 'MRC',
  'auctionhouse.co.th': 'AUC',
}

/** YYYYMMDD in UTC */
export function formatFileDate(d = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** HHmmss in UTC */
export function formatFileTime(d = new Date()): string {
  return d.toISOString().slice(11, 19).replace(/:/g, '')
}

/** YYYYMMDD_HHmmss — prefix for screenshot filenames */
export function fileTimestampPrefix(d = new Date()): string {
  return `${formatFileDate(d)}_${formatFileTime(d)}`
}

export function sourceCode(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (SOURCE_CODES[host]) return SOURCE_CODES[host]
    return host.split('.')[0].replace(/[aeiou]/gi, '').slice(0, 3).toUpperCase() || host.slice(0, 3).toUpperCase()
  } catch {
    return 'UNK'
  }
}

/** Build screenshot filename: YYYYMMDD_HHmmss_{parts...}.jpg */
export function buildScreenshotFilename(...parts: string[]): string {
  return `${fileTimestampPrefix()}_${parts.join('_')}.jpg`
}

/** URL-based screenshot name: YYYYMMDD_HHmmss_{categoryId}_{sourceCode}.jpg */
export function buildUrlScreenshotFilename(url: string, categoryId?: string): string {
  return buildScreenshotFilename(categoryId ?? '000', sourceCode(url))
}
