import {
  apiUrl,
  fetchDailyResults,
  fetchDailySummary,
  fetchLogEntries,
  fetchResultByScreenshot,
  fetchLatestSourceCheck,
  runSourceCheck,
  screenshotUrl,
  streamBatchSearch,
  fetchCronConfig,
  saveCronConfig,
  fetchCronRuns,
} from '~/lib/api'

/** Frontend API access — reads `NUXT_PUBLIC_API_BASE` for cross-origin backend. */
export function useApi() {
  const config = useRuntimeConfig()
  const apiBase = computed(() => (config.public.apiBase as string) || '')

  return {
    apiBase,
    url: (path: string) => apiUrl(path, apiBase.value),
    screenshotUrl: (file: string) => screenshotUrl(file, apiBase.value),
    fetchDailyResults: (date: string) => fetchDailyResults(date, apiBase.value),
    fetchDailySummary: (date: string) => fetchDailySummary(date, apiBase.value),
    fetchLogEntries: (date: string) => fetchLogEntries(date, apiBase.value),
    fetchResultByScreenshot: (date: string, screenshotFile: string) =>
      fetchResultByScreenshot(date, screenshotFile, apiBase.value),
    streamBatchSearch: (
      route: string,
      body: Parameters<typeof streamBatchSearch>[1],
      signal?: AbortSignal,
    ) => streamBatchSearch(route, body, apiBase.value, signal),
    fetchLatestSourceCheck: () => fetchLatestSourceCheck(apiBase.value),
    runSourceCheck: () => runSourceCheck(apiBase.value),
    fetchCronConfig: () => fetchCronConfig(apiBase.value),
    saveCronConfig: (label: string, config: Parameters<typeof saveCronConfig>[1]) => saveCronConfig(label, config, apiBase.value),
    fetchCronRuns: () => fetchCronRuns(apiBase.value),
  }
}
