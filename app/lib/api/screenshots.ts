import { screenshotPath } from '#shared/api/paths'
import { apiUrl } from './client'

export function screenshotUrl(file: string, apiBase = ''): string {
  return apiUrl(screenshotPath(file), apiBase)
}
