import { defineStore } from 'pinia'
import type { DailySummary, LogEntry } from '#shared/types/log'
import type { ResultEntry } from '#shared/types/result'
import { CATEGORY_NAMES } from '#shared/constants/categories'
import { extractDomain } from '#shared/utils/domain'
import {
  fetchDailyResults,
  fetchDailySummary,
  fetchLogEntries,
  fetchResultByScreenshot,
} from '~/lib/api'

export const useLogsEntriesStore = defineStore('logsEntries', () => {
  const config = useRuntimeConfig()
  const apiBase = computed(() => (config.public.apiBase as string) || '')

  // ── Shared ────────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const selectedDate = ref(today)
  const dateMenu = ref(false)

  const formattedDate = computed(() => {
    const [y, m, d] = selectedDate.value.split('-')
    return `${d}/${m}/${y}`
  })

  // ── Entries page ──────────────────────────────────────────────────────────────
  const entriesLoading = ref(false)
  const entriesFetchError = ref<string | null>(null)
  const resultEntries = ref<ResultEntry[]>([])
  const entriesSearch = ref('')
  const entriesFilterSrc = ref('ทั้งหมด')
  const entriesFilterCat = ref('ทั้งหมด')
  const selectedRound = ref<string | null>(null)

  const entriesAvailableSources = computed(() =>
    [...new Set(resultEntries.value.map((e) => e.source).filter(Boolean))]
  )
  const entriesAvailableCategories = computed(() =>
    [...new Set(resultEntries.value.map((e) => e.categoryId).filter(Boolean))]
  )

  const filteredGroups = computed(() => {
    return resultEntries.value
      .filter(e => {
        if (entriesFilterSrc.value !== 'ทั้งหมด' && e.source !== entriesFilterSrc.value) return false
        if (entriesFilterCat.value !== 'ทั้งหมด' && e.categoryId !== entriesFilterCat.value) return false
        return true
      })
      .map(e => {
        if (!entriesSearch.value) return e
        const q = entriesSearch.value.toLowerCase()
        const filteredItems = e.items.filter((item) =>
          Object.values(item).some((v) => String(v ?? '').toLowerCase().includes(q))
        )
        return filteredItems.length > 0 ? { ...e, items: filteredItems } : null
      })
      .filter(Boolean) as ResultEntry[]
  })

  function roundCategoryKey(entries: ResultEntry[]): string {
    const cats = [...new Set(entries.map(e => e.categoryId).filter(Boolean))].sort() as string[]
    return cats.length > 0 ? cats.join(',') : '__none__'
  }

  function roundCategoryLabel(entries: ResultEntry[]): string {
    const cats = [...new Set(entries.map(e => e.categoryId).filter(Boolean))] as string[]
    if (cats.length === 0) return 'ไม่ระบุหมวด'
    if (cats.length === 1) {
      const id = cats[0]
      return CATEGORY_NAMES[id] ? `${CATEGORY_NAMES[id]} (${id})` : `หมวด ${id}`
    }
    return cats.map(id => CATEGORY_NAMES[id] ?? id).join(' · ')
  }

  const rounds = computed(() => {
    const map = new Map<string, ResultEntry[]>()
    for (const e of filteredGroups.value) {
      const key = e.roundId ?? '__legacy__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    const built = [...map.entries()]
      .map(([roundId, entries]) => {
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const timestamp = entries[0].timestamp
        const query = entries.find(e => e.searchQuery)?.searchQuery ?? ''
        const categoryKey = roundCategoryKey(entries)
        const categoryLabel = roundCategoryLabel(entries)
        const catMap = new Map<string, ResultEntry[]>()
        for (const e of entries) {
          const cat = e.categoryId ?? '__none__'
          if (!catMap.has(cat)) catMap.set(cat, [])
          catMap.get(cat)!.push(e)
        }
        const byCategory = [...catMap.entries()].map(([categoryId, catEntries]) => {
          const queryMap = new Map<string, ResultEntry[]>()
          for (const e of catEntries) {
            const q = e.searchQuery?.trim() || '__none__'
            if (!queryMap.has(q)) queryMap.set(q, [])
            queryMap.get(q)!.push(e)
          }
          const byQuery = [...queryMap.entries()]
            .map(([queryKey, queryEntries]) => {
              queryEntries.sort((a, b) => a.source.localeCompare(b.source))
              return {
                query: queryKey === '__none__' ? '' : queryKey,
                entries: queryEntries,
              }
            })
            .sort((a, b) => {
              const ta = a.entries[0]?.timestamp ?? ''
              const tb = b.entries[0]?.timestamp ?? ''
              return new Date(ta).getTime() - new Date(tb).getTime()
            })
          return { categoryId, byQuery }
        })
        return { roundId, timestamp, query, categoryKey, categoryLabel, roundNumberInCategory: 1, byCategory }
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const countByCategory = new Map<string, number>()
    for (const round of [...built].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())) {
      round.roundNumberInCategory = (countByCategory.get(round.categoryKey) ?? 0) + 1
      countByCategory.set(round.categoryKey, round.roundNumberInCategory)
    }
    return built
  })

  const flatItems = computed(() => filteredGroups.value.flatMap(g => g.items))

  async function fetchResultEntries() {
    entriesLoading.value = true
    entriesFetchError.value = null
    const dateParam = selectedDate.value.replace(/-/g, '')
    try {
      const data = await fetchDailyResults(dateParam, apiBase.value)
      resultEntries.value = data.entries ?? []
      selectedRound.value = null
      await nextTick()
      selectedRound.value = rounds.value[0]?.roundId ?? null
    } catch (err: unknown) {
      entriesFetchError.value = (err as Error)?.message ?? 'โหลดข้อมูลล้มเหลว'
      resultEntries.value = []
      selectedRound.value = null
    } finally {
      entriesLoading.value = false
    }
  }

  // ── Logs page ─────────────────────────────────────────────────────────────────
  const logsLoading = ref(false)
  const logsFetchError = ref<string | null>(null)
  const summary = ref<DailySummary | null>(null)
  const logEntries = ref<LogEntry[]>([])
  const activeView = ref<'summary' | 'entries'>('summary')
  const logsSearch = ref('')
  const logsFilterSrc = ref('ทั้งหมด')
  const logsFilterCat = ref('ทั้งหมด')
  const logsFilterResult = ref('all')

  const logsDetailOpen = ref(false)
  const logsDetailEntry = ref<LogEntry | null>(null)
  const logsDetailItems = ref<Record<string, unknown>[]>([])
  const logsDetailItemsLoading = ref(false)

  function entryDomain(e: LogEntry): string {
    return e.source ?? extractDomain(e.url)
  }

  const sortedErrors = computed(() =>
    [...(summary.value?.errors ?? [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  )

  const logsAvailableSources = computed(() => [...new Set(logEntries.value.map(entryDomain))])
  const logsAvailableCategories = computed(() =>
    [...new Set(logEntries.value.map(e => e.categoryId).filter(Boolean))]
  )

  const filteredEntries = computed(() => {
    return logEntries.value
      .filter(e => {
        if (logsFilterSrc.value !== 'ทั้งหมด' && entryDomain(e) !== logsFilterSrc.value) return false
        if (logsFilterCat.value !== 'ทั้งหมด' && e.categoryId !== logsFilterCat.value) return false
        if (logsFilterResult.value === 'success' && (e.httpStatus !== 200 || e.error)) return false
        if (logsFilterResult.value === 'failed' && e.httpStatus === 200 && !e.error) return false
        if (logsSearch.value) {
          const q = logsSearch.value.toLowerCase()
          if (
            !e.url?.toLowerCase().includes(q) &&
            !e.searchQuery?.toLowerCase().includes(q) &&
            !e.screenshotFile?.toLowerCase().includes(q)
          ) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  })

  async function fetchAll() {
    logsLoading.value = true
    logsFetchError.value = null
    const dateParam = selectedDate.value.replace(/-/g, '')
    try {
      const [sumData, entriesData] = await Promise.all([
        fetchDailySummary(dateParam, apiBase.value),
        fetchLogEntries(dateParam, apiBase.value),
      ])
      summary.value = sumData.total === 0 ? null : sumData
      logEntries.value = entriesData.entries ?? []
    } catch (e: unknown) {
      logsFetchError.value = (e as Error)?.message ?? 'โหลดข้อมูลล้มเหลว'
      summary.value = null
      logEntries.value = []
    } finally {
      logsLoading.value = false
    }
  }

  async function openLogsDetail(item: LogEntry) {
    logsDetailEntry.value = item
    logsDetailItems.value = []
    logsDetailOpen.value = true
    if (item.screenshotFile && item.httpStatus === 200 && !item.error) {
      logsDetailItemsLoading.value = true
      try {
        const dateParam = selectedDate.value.replace(/-/g, '')
        const data = await fetchResultByScreenshot(dateParam, item.screenshotFile, apiBase.value)
        logsDetailItems.value = data.entry?.items ?? []
      } catch {}
      finally { logsDetailItemsLoading.value = false }
    }
  }

  async function openLogsDetailByScreenshot(screenshotFile: string) {
    const dateParam = selectedDate.value.replace(/-/g, '')
    if (!logEntries.value.length) {
      try {
        const data = await fetchLogEntries(dateParam, apiBase.value)
        logEntries.value = data.entries ?? []
      } catch {
        return
      }
    }
    let match = logEntries.value.find(e => e.screenshotFile === screenshotFile)
    if (!match) {
      try {
        const data = await fetchLogEntries(dateParam, apiBase.value)
        logEntries.value = data.entries ?? []
        match = logEntries.value.find(e => e.screenshotFile === screenshotFile)
      } catch {
        return
      }
    }
    if (match) await openLogsDetail(match)
  }

  function filterStatus(status: 'success' | 'failed') {
    logsFilterSrc.value = 'ทั้งหมด'
    logsFilterCat.value = 'ทั้งหมด'
    logsFilterResult.value = status
    activeView.value = 'entries'
  }

  function filterSource(src: string) {
    logsFilterCat.value = 'ทั้งหมด'
    logsFilterResult.value = 'all'
    logsFilterSrc.value = src
    activeView.value = 'entries'
  }

  function filterCategory(cat: string) {
    logsFilterSrc.value = 'ทั้งหมด'
    logsFilterResult.value = 'all'
    logsFilterCat.value = cat
    activeView.value = 'entries'
  }

  return {
    // shared
    selectedDate, dateMenu, formattedDate, CATEGORY_NAMES,
    // entries
    entriesLoading, entriesFetchError, resultEntries,
    entriesSearch, entriesFilterSrc, entriesFilterCat, selectedRound,
    entriesAvailableSources, entriesAvailableCategories,
    filteredGroups, rounds, flatItems,
    fetchResultEntries,
    // logs
    logsLoading, logsFetchError, summary, logEntries, activeView,
    logsSearch, logsFilterSrc, logsFilterCat, logsFilterResult,
    sortedErrors, logsAvailableSources, logsAvailableCategories,
    filteredEntries, entryDomain,
    logsDetailOpen, logsDetailEntry, logsDetailItems, logsDetailItemsLoading,
    fetchAll, openLogsDetail, openLogsDetailByScreenshot, filterStatus, filterSource, filterCategory,
  }
})
