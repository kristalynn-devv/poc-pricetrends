import { defineStore } from 'pinia'
import type { BacktestRun } from '#shared/types/backtest'
import { fetchLatestBacktest, runBacktest } from '~/lib/api'

export const useBacktestStore = defineStore('backtest', () => {
  const config = useRuntimeConfig()
  const apiBase = computed(() => (config.public.apiBase as string) || '')

  const run = ref<BacktestRun | null>(null)
  const running = ref(false)
  const error = ref('')
  const loaded = ref(false)

  const passCount = computed(() => run.value?.results.filter((r) => r.pass).length ?? 0)

  async function loadLatest() {
    try {
      run.value = await fetchLatestBacktest(apiBase.value)
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
      run.value = await runBacktest(apiBase.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      running.value = false
    }
  }

  return { run, running, error, loaded, passCount, loadLatest, start }
})
