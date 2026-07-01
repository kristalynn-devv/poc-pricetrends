import { defineStore } from 'pinia'
import { getCategoryFieldDefs, type FieldDef } from '~/composables/useCategoryFields'
import type { ItemResult, BatchSummary } from '#shared/types/item'
import { SEARCH_ROUTE_CATEGORY } from '#shared/constants/searchRoutes'
import { CATEGORY_GROUPS } from '#shared/constants/categoryGroups'
import { DEFAULT_CATEGORY_RUN_CONFIG } from '#shared/utils/categoryConfig'
import type { CategoryRunConfig } from '#shared/types/categoryConfig'
import { streamBatchSearch } from '~/lib/api/search'
import { screenshotUrl } from '~/lib/api/screenshots'

export type { ItemResult }
export type Summary = BatchSummary

export interface LogLine { ts: string; level: string; msg: string; data?: unknown }

export interface SourceRun {
  loading: boolean
  done: boolean
  results: ItemResult[]
  logs: LogLine[]
  summary: Summary | null
  error: string
  searchPageScreenshot: string
}

export interface SourceDef {
  name: string
  url: string
  apiRoute?: string
}

export interface CategoryGroup {
  label: string
  ids: string[]
  sources: SourceDef[]
  queries: string[]
  newQuery: string
  running: boolean
  enabled: Record<string, boolean>
  runs: Record<string, SourceRun>
  requiredFields: FieldDef[]
  optionalFields: FieldDef[]
  fieldValues: Record<string, string>
  activeOptionals: string[]
  lastRoundId?: string
}

function makeRun(): SourceRun {
  return { loading: false, done: false, results: [], logs: [], summary: null, error: '', searchPageScreenshot: '' }
}

function buildGroup(label: string, ids: string[], sources: SourceDef[]): CategoryGroup {
  const enabled: Record<string, boolean> = {}
  sources.forEach((s) => { enabled[s.name] = false })
  const { required, optional } = getCategoryFieldDefs(ids[0])
  return {
    label, ids, sources, queries: [], newQuery: '', running: false, enabled, runs: {},
    requiredFields: required, optionalFields: optional, fieldValues: {}, activeOptionals: [],
  }
}

export const useSearchGroupsStore = defineStore('searchGroups', () => {
  const config = useRuntimeConfig()
  const apiBase = computed(() => (config.public.apiBase as string) || '')
  const groups = ref<CategoryGroup[]>([])

  function init() {
    if (groups.value.length > 0) return
    groups.value = CATEGORY_GROUPS.map((g) => buildGroup(g.label, g.ids, g.sources))
  }

  function toggleAllSources(grp: CategoryGroup) {
    const readySources = grp.sources.filter(s => s.apiRoute)
    const allEnabled = readySources.every(s => grp.enabled[s.name])
    readySources.forEach(s => { grp.enabled[s.name] = !allEnabled })
  }

  function addOptionalField(grp: CategoryGroup, key: string) {
    if (!grp.activeOptionals.includes(key)) {
      grp.activeOptionals.push(key)
      grp.fieldValues[key] = ''
    }
  }

  function removeOptionalField(grp: CategoryGroup, key: string) {
    grp.activeOptionals = grp.activeOptionals.filter(k => k !== key)
    delete grp.fieldValues[key]
  }

  function addQuery(grp: CategoryGroup) {
    const q = grp.newQuery.trim()
    if (!q) return
    if (!grp.queries.includes(q)) grp.queries.push(q)
    grp.newQuery = ''
  }

  function grpTotalItems(grp: CategoryGroup) {
    return Object.values(grp.runs).reduce((n, r) => n + r.results.reduce((m, res) => m + res.items.length, 0), 0)
  }

  function srcExtracted(grp: CategoryGroup, srcName: string) {
    const run = grp.runs[srcName]
    if (!run) return []
    const multiQuery = grp.queries.length > 1
    return run.results.flatMap(r => {
      const base = {
        _screenshot: r.filename ? screenshotUrl(r.filename, apiBase.value) : '',
        ...(multiQuery ? { _query: r._query ?? '' } : {}),
        _source: r.filename ?? r.url,
      }
      if (r.items.length > 0) return r.items.map(item => ({ ...base, ...item }))
      if (r.screenshotOk && !r.extractOk) return [{ ...base, _error: r.error ?? r.raw ?? 'AI extraction failed' }]
      return []
    })
  }

  async function runSourceQuery(
    grp: CategoryGroup,
    src: SourceDef,
    query: string,
    qi: number,
    cfg: Record<string, unknown>,
    roundId?: string,
  ) {
    const run = grp.runs[src.name]
    const categoryId = (src.apiRoute && SEARCH_ROUTE_CATEGORY[src.apiRoute as keyof typeof SEARCH_ROUTE_CATEGORY])
      ?? grp.ids[0]
    const prefix = grp.queries.length > 1 ? `[${qi + 1}/${grp.queries.length}] ` : ''

    run.logs.push({ ts: new Date().toISOString(), level: 'info', msg: `${prefix}ค้นหา: ${query}` })

    try {
      for await (const ev of streamBatchSearch(
        src.apiRoute!,
        { query, categoryId, limit: Number(cfg.limit) || 1, config: cfg, roundId },
        apiBase.value,
      )) {
        if (ev.type === 'log') {
          run.logs.push({ ts: ev.ts, level: ev.level, msg: prefix + ev.msg, data: ev.data })
        } else if (ev.type === 'result') {
          const { type: _t, ...result } = ev
          run.results.push({ ...result, _query: query } as ItemResult & { _query?: string })
        } else if (ev.type === 'searchpage') {
          run.searchPageScreenshot = ev.base64
        } else if (ev.type === 'done') {
          const s = ev.summary
          if (!s) continue
          if (!run.summary) {
            run.summary = { ...s }
          } else {
            run.summary.total += s.total
            run.summary.screenshotOk += s.screenshotOk
            run.summary.extractOk += s.extractOk
          }
          if (ev.error) run.error = (run.error ? run.error + ' | ' : '') + `${query}: ${ev.error}`
        }
      }
    } catch (e: unknown) {
      const msg = (e as Error).message ?? 'ค้นหาไม่สำเร็จ'
      run.error = (run.error ? run.error + ' | ' : '') + `${query}: ${msg}`
      run.logs.push({ ts: new Date().toISOString(), level: 'error', msg: `${prefix}${msg}` })
    }
  }

  async function runSource(grp: CategoryGroup, src: SourceDef, cfg: Record<string, unknown>, roundId?: string) {
    if (!src.apiRoute || grp.queries.length === 0) return
    if (!grp.runs[src.name]) grp.runs[src.name] = makeRun()
    const run = grp.runs[src.name]
    run.loading = true
    run.done = false
    run.results = []
    run.logs = []
    run.summary = null
    run.error = ''
    run.searchPageScreenshot = ''

    try {
      for (let qi = 0; qi < grp.queries.length; qi++) {
        await runSourceQuery(grp, src, grp.queries[qi], qi, cfg, roundId)
      }
    } finally {
      run.loading = false
      run.done = true
    }
  }

  async function runGroup(
    grp: CategoryGroup,
    getCfg: (srcName: string) => Record<string, unknown>,
    categoryCfg: CategoryRunConfig = DEFAULT_CATEGORY_RUN_CONFIG,
  ) {
    if (grp.queries.length === 0) return
    grp.running = true
    const roundId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    grp.lastRoundId = roundId

    const TARGET_HITS = categoryCfg.maxSources
    const CONCURRENCY = Math.max(1, Math.min(3, TARGET_HITS))
    const queue = grp.sources.filter(s => s.apiRoute && grp.enabled[s.name])

    try {
      let qi = 0
      let hits = 0
      let active = 0

      await new Promise<void>((resolve) => {
        function tryNext() {
          while (active < CONCURRENCY && hits + active < TARGET_HITS && qi < queue.length) {
            const src = queue[qi++]
            active++
            runSource(grp, src, getCfg(src.name), roundId).then(() => {
              active--
              if (srcExtracted(grp, src.name).length > 0) hits++
              if (hits >= TARGET_HITS || (qi >= queue.length && active === 0)) {
                resolve()
              } else {
                tryNext()
              }
            })
          }
          if (active === 0) resolve()
        }
        tryNext()
      })
    } finally {
      grp.running = false
    }
  }

  return {
    groups,
    init,
    toggleAllSources,
    addOptionalField,
    removeOptionalField,
    addQuery,
    grpTotalItems,
    srcExtracted,
    runGroup,
  }
})
