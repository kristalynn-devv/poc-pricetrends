import { defineStore } from 'pinia'
import type { SourceCheckRun } from '#shared/types/sourcecheck'
import { fetchLatestSourceCheck, runSourceCheck, fetchSourceCheckHistory } from '~/lib/api'

export const useSourceCheckStore = defineStore('sourcecheck', () => {
  const config = useRuntimeConfig()
  const apiBase = computed(() => (config.public.apiBase as string) || '')

  const run = ref<SourceCheckRun | null>(null)
  const running = ref(false)
  const error = ref('')
  const loaded = ref(false)

  // ── History (ดูย้อนหลัง) ──────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const selectedDate = ref(today)
  const dateMenu = ref(false)
  const historyRuns = ref<SourceCheckRun[]>([])
  const availableDates = ref<string[]>([])
  const historyLoading = ref(false)
  const historyError = ref('')

  const formattedDate = computed(() => {
    const [y, m, d] = selectedDate.value.split('-')
    return `${d}/${m}/${y}`
  })

  const passCount = computed(() => run.value?.results.filter((r) => r.pass).length ?? 0)

  async function loadLatest() {
    try {
      run.value = await fetchLatestSourceCheck(apiBase.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loaded.value = true
    }
  }

  async function start() {
    if (running.value) return
    running.value = true
    error.value = ''
    try {
      run.value = await runSourceCheck(apiBase.value)
      await loadHistory()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      running.value = false
    }
  }

  async function loadHistory() {
    historyLoading.value = true
    historyError.value = ''
    try {
      const res = await fetchSourceCheckHistory(selectedDate.value.replace(/-/g, ''), apiBase.value)
      historyRuns.value = res.runs
      availableDates.value = res.availableDates
    } catch (e) {
      historyError.value = e instanceof Error ? e.message : String(e)
    } finally {
      historyLoading.value = false
    }
  }

  return {
    run, running, error, loaded, passCount, loadLatest, start,
    selectedDate, dateMenu, formattedDate,
    historyRuns, availableDates, historyLoading, historyError, loadHistory,
  }
})
