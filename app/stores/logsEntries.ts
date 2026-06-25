import { defineStore } from 'pinia'

const CATEGORY_NAMES: Record<string, string> = {
  '103': 'นาฬิกา',
  '106': 'พระ / วัตถุมงคล',
  '107': 'IT / โน้ตบุ๊ก',
  '108': 'แบรนด์เนม',
  '109': 'สมาร์ทโฟน',
  '110': 'แว่นตา',
  '111': 'เครื่องมือช่าง',
  '112': 'อุปกรณ์ไอที',
}

export const useLogsEntriesStore = defineStore('logsEntries', () => {
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
  const resultEntries = ref<any[]>([])
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
        const filteredItems = e.items.filter((item: any) =>
          Object.values(item).some((v) => String(v ?? '').toLowerCase().includes(q))
        )
        return filteredItems.length > 0 ? { ...e, items: filteredItems } : null
      })
      .filter(Boolean)
  })

  const rounds = computed(() => {
    const map = new Map<string, any[]>()
    for (const e of filteredGroups.value) {
      const key = (e as any).roundId ?? '__legacy__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return [...map.entries()]
      .map(([roundId, entries]) => {
        entries.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const timestamp = entries[0].timestamp
        const query = entries.find((e: any) => e.searchQuery)?.searchQuery ?? ''
        const catMap = new Map<string, any[]>()
        for (const e of entries) {
          const cat = e.categoryId ?? '__none__'
          if (!catMap.has(cat)) catMap.set(cat, [])
          catMap.get(cat)!.push(e)
        }
        const byCategory = [...catMap.entries()].map(([categoryId, catEntries]) => ({ categoryId, entries: catEntries }))
        return { roundId, timestamp, query, byCategory }
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  })

  const flatItems = computed(() => filteredGroups.value.flatMap((g: any) => g.items))

  async function fetchResultEntries() {
    entriesLoading.value = true
    entriesFetchError.value = null
    const dateParam = selectedDate.value.replace(/-/g, '')
    try {
      const res = await fetch(`/api/results/entries?date=${dateParam}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      resultEntries.value = data.entries ?? []
      selectedRound.value = null
      await nextTick()
      selectedRound.value = rounds.value[0]?.roundId ?? null
    } catch (err: any) {
      entriesFetchError.value = err?.message ?? 'โหลดข้อมูลล้มเหลว'
      resultEntries.value = []
      selectedRound.value = null
    } finally {
      entriesLoading.value = false
    }
  }

  // ── Logs page ─────────────────────────────────────────────────────────────────
  const logsLoading = ref(false)
  const logsFetchError = ref<string | null>(null)
  const summary = ref<any>(null)
  const logEntries = ref<any[]>([])
  const activeView = ref<'summary' | 'entries'>('summary')
  const logsSearch = ref('')
  const logsFilterSrc = ref('ทั้งหมด')
  const logsFilterCat = ref('ทั้งหมด')
  const logsFilterResult = ref('all')

  const logsDetailOpen = ref(false)
  const logsDetailEntry = ref<any>(null)
  const logsDetailItems = ref<any[]>([])
  const logsDetailItemsLoading = ref(false)

  function entryDomain(e: any): string {
    return e.source ?? extractDomain(e.url)
  }

  function extractDomain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0] } catch { return 'unknown' }
  }

  const sortedErrors = computed(() =>
    [...(summary.value?.errors ?? [])].sort(
      (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  )

  const logsAvailableSources = computed(() => [...new Set(logEntries.value.map(entryDomain))])
  const logsAvailableCategories = computed(() =>
    [...new Set(logEntries.value.map((e) => e.categoryId).filter(Boolean))]
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
      const [sumRes, entriesRes] = await Promise.all([
        fetch(`/api/logs/summary?date=${dateParam}`),
        fetch(`/api/logs/entries?date=${dateParam}`),
      ])
      const sumData = await sumRes.json()
      const entriesData = await entriesRes.json()
      summary.value = sumData.total === 0 ? null : sumData
      logEntries.value = entriesData.entries ?? []
    } catch (e: any) {
      logsFetchError.value = e?.message ?? 'โหลดข้อมูลล้มเหลว'
      summary.value = null
      logEntries.value = []
    } finally {
      logsLoading.value = false
    }
  }

  async function openLogsDetail(item: any) {
    logsDetailEntry.value = item
    logsDetailItems.value = []
    logsDetailOpen.value = true
    if (item.dataFile) {
      logsDetailItemsLoading.value = true
      try {
        const res = await fetch(`/api/data?file=${item.dataFile}`)
        const data = await res.json()
        logsDetailItems.value = Array.isArray(data) ? data : [data]
      } catch {}
      finally { logsDetailItemsLoading.value = false }
    }
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
    fetchAll, openLogsDetail, filterStatus, filterSource, filterCategory,
  }
})
