export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0]
  } catch {
    return 'unknown'
  }
}
