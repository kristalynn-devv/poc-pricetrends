import { defineStore } from 'pinia'
import type { FieldDef } from '~/composables/useCategoryFields'

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
  _query?: string
}

export interface LogLine { ts: string; level: string; msg: string; data?: unknown }
export interface Summary { total: number; screenshotOk: number; extractOk: number }

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

const CATEGORY_FIELDS: Record<string, { required: FieldDef[]; optional: FieldDef[] }> = {
  '103': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'dialColor', label: 'สีหน้าปัด' },
      { key: 'caseMaterial', label: 'วัสดุตัวเรือน' },
      { key: 'strapMaterial', label: 'วัสดุสายนาฬิกา' },
      { key: 'movementType', label: 'ระบบ' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
  '106': {
    required: [{ key: 'title', label: 'ชื่อ/ยี่ห้อ' }, { key: 'material', label: 'วัสดุ' }],
    optional: [
      { key: 'moldType', label: 'พิมพ์' },
      { key: 'year', label: 'ปี' },
      { key: 'weight', label: 'น้ำหนัก' },
    ],
  },
  '107': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'capacity', label: 'ความจุ/สเปก' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
  '108': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'condition', label: 'สภาพ' },
      { key: 'year', label: 'ปี' },
    ],
  },
  '111': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
}

const API_CATEGORY_MAP: Record<string, string> = {
  '/api/chrono24-search': '103',
  '/api/auctionhouse-search': '103',
  '/api/radiumwatch-search': '103',
  '/api/siamwatchclub-search': '103',
  '/api/komehyo-search': '103',
  '/api/thaprachan-search': '106',
  '/api/compasia-search': '112',
  '/api/pantipmarket-search': '107',
  '/api/sfbrandname-search': '108',
  '/api/brandnamevoyage-search': '108',
}

function makeRun(): SourceRun {
  return { loading: false, done: false, results: [], logs: [], summary: null, error: '', searchPageScreenshot: '' }
}

function getFields(ids: string[]) {
  return CATEGORY_FIELDS[ids[0]] ?? {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [],
  }
}

function buildGroup(label: string, ids: string[], sources: SourceDef[]): CategoryGroup {
  const enabled: Record<string, boolean> = {}
  sources.forEach((s) => { enabled[s.name] = false })
  const { required, optional } = getFields(ids)
  const fieldValues: Record<string, string> = {}
  required.forEach((f) => { fieldValues[f.key] = '' })
  return {
    label, ids, sources, queries: [], newQuery: '', running: false, enabled, runs: {},
    requiredFields: required, optionalFields: optional, fieldValues, activeOptionals: [],
  }
}

export const useSearchGroupsStore = defineStore('searchGroups', () => {
  const groups = ref<CategoryGroup[]>([])

  function init() {
    if (groups.value.length > 0) return
    groups.value = [
      buildGroup('นาฬิกา', ['103'], [
        { name: 'StarBuyers Global Auction', url: 'https://www.starbuyers-global-auction.com/login' },
        { name: 'Chrono24', url: 'https://www.chrono24.com', apiRoute: '/api/chrono24-search' },
        { name: 'Auction House', url: 'https://www.auctionhouse.co.th', apiRoute: '/api/auctionhouse-search' },
        { name: 'Radium Watch', url: 'https://radiumwatch.com', apiRoute: '/api/radiumwatch-search' },
        { name: 'Siam Watch Club', url: 'https://www.siamwatchclub.com', apiRoute: '/api/siamwatchclub-search' },
        { name: 'Komehyo (นาฬิกา)', url: 'https://www.komehyo.co.th', apiRoute: '/api/komehyo-search' },
      ]),
      buildGroup('พระ / วัตถุมงคล', ['106'], [
        { name: 'Thaprachan', url: 'https://www.thaprachan.com/', apiRoute: '/api/thaprachan-search' },
        { name: 'Wutdychonburi', url: 'https://wutdychonburi.com/', apiRoute: '/api/wutdychonburi-search' },
        { name: 'Prapantip', url: 'https://www.prapantip.com/amulet/', apiRoute: '/api/prapantip-search' },
        { name: 'G-Pra', url: 'https://www.g-pra.com/' },
        { name: 'UAmulet', url: 'https://uauction.uamulet.com/AuctionUClubTopList.aspx', apiRoute: '/api/uauction-search' },
      ]),
      buildGroup('สินค้าไอที / โน้ตบุ๊ก / สมาร์ทโฟน', ['107', '109', '112'], [
        { name: 'ShopBKK', url: 'https://www.shopbkk.com', apiRoute: '/api/shopbkk-search' },
        { name: 'CompAsia', url: 'https://compasia.co.th', apiRoute: '/api/compasia-search' },
        { name: 'Kaidee', url: 'https://www.kaidee.com', apiRoute: '/api/kaidee-search' },
        { name: 'Pantipmarket (Mobile)', url: 'https://www.pantipmarket.com' },
        { name: '108 Accessory', url: 'http://www.108accessory.com/' },
      ]),
      buildGroup('แบรนเนม / แว่นตา', ['108', '110'], [
        { name: 'Komehyo', url: 'https://www.komehyo.co.th/', apiRoute: '/api/komehyo-search' },
        { name: 'Sasom', url: 'https://sasom.co.th/th', apiRoute: '/api/sasom-search' },
        { name: 'Moppet Brandname', url: 'https://www.moppetbrandname.com/', apiRoute: '/api/moppet-search' },
        { name: 'SF Brandname', url: 'https://sfbrandname.com/', apiRoute: '/api/sfbrandname-search' },
        { name: 'Brandname Voyage', url: 'https://brandnamevoyage.com/', apiRoute: '/api/brandnamevoyage-search' },
      ]),
      buildGroup('เครื่องมือช่าง', ['111'], [
        { name: 'Kaidee (เครื่องมือช่าง)', url: 'https://www.kaidee.com/c296-appliances_decoration-accessories_and_tool_suppliers', apiRoute: '/api/kaidee-search' },
        { name: 'Shopee (เครื่องมือช่าง)', url: 'https://shopee.co.th/search?keyword=%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%9B%E0%B9%88%E0%B8%B2%E0%B8%A5%E0%B8%A1' },
        { name: 'Truck2Hand', url: 'https://www.truck2hand.com/category/cat_equipment/', apiRoute: '/api/truck2hand-search' },
        { name: 'Facebook กลุ่ม 1', url: 'https://www.facebook.com/groups/198988708155849/' },
        { name: 'Facebook กลุ่ม 2', url: 'https://www.facebook.com/groups/4392804640788959/' },
        { name: 'Facebook กลุ่ม 3', url: 'https://www.facebook.com/groups/455495127955260/' },
      ]),
    ]
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
    const allFields = [
      ...grp.requiredFields,
      ...grp.optionalFields.filter(f => grp.activeOptionals.includes(f.key)),
    ]
    const parts = allFields.map(f => grp.fieldValues[f.key]?.trim()).filter(Boolean)
    if (parts.length === 0) return
    const q = parts.join(' ')
    if (!grp.queries.includes(q)) grp.queries.push(q)
    allFields.forEach(f => { grp.fieldValues[f.key] = '' })
  }

  function srcExtracted(grp: CategoryGroup, srcName: string) {
    const run = grp.runs[srcName]
    if (!run) return []
    const multiQuery = grp.queries.length > 1
    return run.results.flatMap(r => {
      const base = {
        _screenshot: r.filename ? `/api/screenshot?file=${r.filename}` : '',
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
    const categoryId = API_CATEGORY_MAP[src.apiRoute!] ?? grp.ids[0]
    const prefix = grp.queries.length > 1 ? `[${qi + 1}/${grp.queries.length}] ` : ''

    run.logs.push({ ts: new Date().toISOString(), level: 'info', msg: `${prefix}ค้นหา: ${query}` })

    try {
      const res = await fetch(src.apiRoute!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, categoryId, limit: Number(cfg.limit) || 1, config: cfg, roundId }),
        signal: AbortSignal.timeout(300_000),
      })
      if (!res.body) throw new Error('No response stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line)
            if (ev.type === 'log') {
              run.logs.push({ ...ev, msg: prefix + ev.msg })
            } else if (ev.type === 'result') {
              run.results.push({ ...ev, _query: query })
            } else if (ev.type === 'searchpage') {
              run.searchPageScreenshot = ev.base64
            } else if (ev.type === 'done') {
              const s = ev.summary as Summary
              if (!run.summary) {
                run.summary = { ...s }
              } else {
                run.summary.total += s.total
                run.summary.screenshotOk += s.screenshotOk
                run.summary.extractOk += s.extractOk
              }
              if (ev.error) run.error = (run.error ? run.error + ' | ' : '') + `${query}: ${ev.error}`
            }
          } catch {}
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

  async function runGroup(grp: CategoryGroup, cfg: Record<string, unknown>) {
    if (grp.queries.length === 0) return
    grp.running = true
    const roundId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    grp.lastRoundId = roundId

    const CONCURRENCY = 3
    const TARGET_HITS = 3
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
            runSource(grp, src, cfg, roundId).then(() => {
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
    srcExtracted,
    runGroup,
  }
})
