<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-6">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Price Extractor</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ค้นหาราคาสินค้าแยกตามหมวด</p>
      </v-col>
      <v-col cols="auto">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small">System Logs</v-btn>
      </v-col>
    </v-row>

    <!-- ── Category group expansion panels ── -->
    <v-expansion-panels v-model="openPanels" multiple variant="accordion" class="mb-4">
      <v-expansion-panel
        v-for="grp in categoryGroups"
        :key="grp.label"
        rounded="lg"
      >
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small">mdi-tag-multiple-outline</v-icon>
          <span>{{ grp.label }}</span>
          <span class="text-caption text-medium-emphasis ml-2">หมวด {{ grp.ids.join(', ') }}</span>
          <v-spacer />
          <div class="d-flex align-center gap-2 mr-2" @click.stop>
            <span class="text-caption text-medium-emphasis">{{ grp.sources.filter(s => s.apiRoute).length }}/{{ grp.sources.length }} แหล่งพร้อมใช้</span>
            <v-chip v-if="grp.running" size="x-small" color="warning" variant="tonal">กำลังค้นหา...</v-chip>
            <v-chip
              v-else-if="Object.values(grp.runs).some(r => r.done)"
              size="x-small" color="primary" variant="tonal"
            >
              {{ Object.values(grp.runs).reduce((n, r) => n + r.results.flatMap(res => res.items).length, 0) }} รายการ
            </v-chip>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text class="pa-0">
          <!-- Query list + limit -->
          <v-card-text class="pb-2">
            <v-row dense align="center" class="mb-2">
              <v-col cols="12" md="8">
                <v-text-field
                  v-model="grp.newQuery"
                  :label="`เพิ่มสินค้าค้นหา ${grp.label}`"
                  prepend-inner-icon="mdi-plus"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :disabled="grp.running"
                  @keyup.enter="addQuery(grp)"
                >
                  <template #append-inner>
                    <v-btn
                      size="x-small"
                      variant="tonal"
                      :disabled="!grp.newQuery.trim() || grp.running"
                      @click.stop="addQuery(grp)"
                    >
                      เพิ่ม
                    </v-btn>
                  </template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-select
                  v-model="grp.limit"
                  :items="[3, 5, 10]"
                  label="จำนวน/แหล่ง/คำ"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :disabled="grp.running"
                />
              </v-col>
              <v-col cols="6" md="2" class="d-flex align-center">
                <v-btn
                  color="primary"
                  block
                  :loading="grp.running"
                  :disabled="grp.queries.length === 0 || !grp.sources.some(s => s.apiRoute && grp.enabled[s.name])"
                  prepend-icon="mdi-play"
                  @click="runGroup(grp)"
                >
                  ค้นหา
                </v-btn>
              </v-col>
            </v-row>
            <!-- Query chips -->
            <div v-if="grp.queries.length > 0" class="d-flex flex-wrap gap-1" @click.stop>
              <v-chip
                v-for="(q, qi) in grp.queries"
                :key="qi"
                size="small"
                closable
                :disabled="grp.running"
                @click:close="grp.queries.splice(qi, 1)"
              >
                {{ q }}
              </v-chip>
            </div>
            <p v-else class="text-caption text-medium-emphasis mb-0">ยังไม่มีรายการค้นหา</p>
          </v-card-text>

          <!-- Source list -->
          <v-divider />
          <v-list density="compact" class="py-0">
            <template v-for="(src, si) in grp.sources" :key="src.name">
              <v-divider v-if="si > 0" />
              <v-list-item class="py-2">
                <template #prepend>
                  <span class="text-caption text-medium-emphasis mr-2" style="min-width:20px">{{ si + 1 }}.</span>
                  <v-checkbox-btn
                    v-if="src.apiRoute"
                    v-model="grp.enabled[src.name]"
                    :disabled="grp.running"
                    density="compact"
                    hide-details
                    class="mr-1"
                  />
                  <v-icon v-else size="small" color="grey" class="mr-3">mdi-clock-outline</v-icon>
                </template>

                <v-list-item-title class="text-body-2 d-flex align-center">
                  <span>{{ src.name }}</span>
                  <v-chip v-if="src.apiRoute" size="x-small" color="success" variant="tonal" class="ml-2">Ready</v-chip>
                  <v-chip v-else size="x-small" color="grey" variant="tonal" class="ml-2">Not Ready</v-chip>
                  <v-progress-circular v-if="grp.runs[src.name]?.loading" indeterminate size="14" width="2" class="ml-2" />
                  <v-chip v-else-if="srcExtracted(grp, src.name).length > 0" size="x-small" color="primary" variant="tonal" class="ml-2">
                    {{ srcExtracted(grp, src.name).length }} รายการ
                  </v-chip>
                  <v-chip v-else-if="grp.runs[src.name]?.error" size="x-small" color="error" variant="tonal" class="ml-2">error</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ src.url }}</v-list-item-subtitle>

                <template #append>
                  <v-btn
                    v-if="grp.runs[src.name]"
                    size="small"
                    variant="tonal"
                    prepend-icon="mdi-console"
                    @click.stop="openDetail(grp, src.name)"
                  >
                    ดูรายละเอียด
                  </v-btn>
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <ImageLightbox v-model="lightboxOpen" :src="lightboxSrc" />

    <!-- ── Source detail dialog ── -->
    <v-dialog v-model="detailOpen" fullscreen transition="dialog-bottom-transition">
      <v-card v-if="detailRun">
        <!-- Toolbar -->
        <v-toolbar color="surface" density="compact">
          <v-btn icon="mdi-close" @click="detailOpen = false" />
          <v-toolbar-title>
            {{ detailSrcName }}
            <span class="text-caption text-medium-emphasis ml-2">{{ detailGrpLabel }}</span>
          </v-toolbar-title>
          <v-spacer />
          <span v-if="detailRun.summary" class="text-caption text-medium-emphasis mr-4">
            screenshot {{ detailRun.summary.screenshotOk }}/{{ detailRun.summary.total }}
            · extract {{ detailRun.summary.extractOk }}/{{ detailRun.summary.total }}
          </span>
          <v-chip v-if="detailRun.loading" size="small" color="warning" variant="tonal" class="mr-2">กำลังประมวลผล...</v-chip>
          <v-btn
            v-if="detailExtracted.length > 0"
            size="small"
            variant="tonal"
            prepend-icon="mdi-download"
            class="mr-2"
            @click="downloadJson(detailExtracted.map(({_screenshot:_s,...r})=>r))"
          >JSON</v-btn>
        </v-toolbar>

        <v-container fluid class="pa-4" style="height: calc(100vh - 48px); display:flex; flex-direction:column; gap:16px; overflow:auto">
          <!-- Terminal -->
          <template v-if="detailRun.logs.length > 0 || detailRun.loading">
            <div>
              <div class="d-flex align-center px-3 py-1 rounded-t" style="background:#1e1e1e">
                <v-icon color="green" size="x-small" class="mr-1">mdi-console</v-icon>
                <span class="text-caption" style="color:#ccc; font-family:monospace">terminal</span>
              </div>
              <div
                class="terminal-box rounded-b"
                ref="detailTermEl"
                style="height:320px"
              >
                <div v-if="detailRun.loading && detailRun.logs.length === 0" style="color:#666">รอการตอบสนอง...</div>
                <div
                  v-for="(line, li) in detailRun.logs"
                  :key="li"
                  :style="{ color: logColor(line.level), lineHeight: '1.7' }"
                >
                  <span style="color:#555">{{ formatLogTime(line.ts) }}</span>
                  <span :style="{ color: logLevelColor(line.level), marginLeft:'6px', marginRight:'6px' }">[{{ line.level.toUpperCase() }}]</span>
                  <span>{{ line.msg }}</span>
                  <span v-if="line.data" style="color:#666; margin-left:6px">{{ JSON.stringify(line.data) }}</span>
                </div>
                <div v-if="detailRun.loading" style="color:#4ec9b0">█</div>
              </div>
            </div>
          </template>

          <!-- Bot-block screenshot -->
          <v-img
            v-if="detailRun.searchPageScreenshot"
            :src="`data:image/jpeg;base64,${detailRun.searchPageScreenshot}`"
            max-height="360"
            contain
            class="bg-grey-lighten-4 rounded"
          />

          <!-- Error -->
          <v-alert v-if="detailRun.error" type="error" density="compact" :text="detailRun.error" class="alert-compact" style="flex:none" />

          <!-- Results table -->
          <v-data-table
            v-if="detailExtracted.length > 0"
            :headers="detailHeaders"
            :items="detailExtracted"
            density="compact"
            class="text-body-2"
            style="flex:1"
          >
            <template #[`item._screenshot`]="{ item }">
              <v-img
                v-if="item._screenshot"
                :src="`data:image/jpeg;base64,${item._screenshot}`"
                width="100"
                height="70"
                cover
                class="my-1 rounded cursor-pointer"
                @click="lightboxSrc = `data:image/jpeg;base64,${item._screenshot}`; lightboxOpen = true"
              />
              <span v-else class="text-medium-emphasis text-caption">—</span>
            </template>
          </v-data-table>
        </v-container>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
// ── Types ──────────────────────────────────────────────────────────────────────
interface ItemResult {
  index: number
  url: string
  filename: string | null
  base64: string | null
  screenshotOk: boolean
  extractOk: boolean
  items: Record<string, unknown>[]
  error?: string
  raw?: string
}

interface LogLine { ts: string; level: string; msg: string; data?: unknown }
interface Summary { total: number; screenshotOk: number; extractOk: number }

interface SourceRun {
  loading: boolean
  done: boolean
  results: ItemResult[]
  logs: LogLine[]
  summary: Summary | null
  error: string
  searchPageScreenshot: string
}

interface SourceDef {
  name: string
  url: string
  apiRoute?: string
}

interface CategoryGroup {
  label: string
  ids: string[]
  sources: SourceDef[]
  queries: string[]
  newQuery: string
  limit: number
  running: boolean
  enabled: Record<string, boolean>
  runs: Record<string, SourceRun>
}

// ── Shared ─────────────────────────────────────────────────────────────────────
const lightboxOpen = ref(false)
const lightboxSrc = ref('')

const openPanels = ref<number[]>([0, 1, 2, 3, 4])

// ── Source detail dialog ──────────────────────────────────────────────────────
const detailOpen = ref(false)
const detailGrpLabel = ref('')
const detailSrcName = ref('')
const detailTermEl = ref<HTMLElement>()

const detailRun = computed(() => {
  if (!detailGrpLabel.value || !detailSrcName.value) return null
  const grp = categoryGroups.value.find((g: any) => g.label === detailGrpLabel.value)
  return grp?.runs[detailSrcName.value] ?? null
})

const detailExtracted = computed(() => {
  if (!detailRun.value) return []
  const grp = categoryGroups.value.find((g: any) => g.label === detailGrpLabel.value)
  if (!grp) return []
  return srcExtracted(grp, detailSrcName.value)
})

const detailHeaders = computed(() => {
  if (detailExtracted.value.length === 0) return []
  const dataKeys = Object.keys(detailExtracted.value[0]).filter((k) => k !== '_screenshot' && k !== '_source')
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 116 },
    ...dataKeys.map((k) => ({ title: k, key: k, sortable: true })),
    { title: 'ไฟล์', key: '_source', sortable: false },
  ]
})

function openDetail(grp: any, srcName: string) {
  detailGrpLabel.value = grp.label
  detailSrcName.value = srcName
  detailOpen.value = true
}

watch([detailOpen, () => detailRun.value?.logs.length], async () => {
  if (!detailOpen.value || !detailTermEl.value) return
  await nextTick()
  detailTermEl.value.scrollTop = detailTermEl.value.scrollHeight
})

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `extracted_${Date.now()}.json`
  a.click()
}

function formatLogTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return ts }
}

function logColor(level: string) {
  return level === 'error' ? '#f48771' : level === 'warn' ? '#dcdcaa' : '#d4d4d4'
}

function logLevelColor(level: string) {
  return level === 'error' ? '#f44747' : level === 'warn' ? '#ce9178' : '#4ec9b0'
}

// ── Category group definitions ─────────────────────────────────────────────────
function makeRun(): SourceRun {
  return { loading: false, done: false, results: [], logs: [], summary: null, error: '', searchPageScreenshot: '' }
}

function makeGroup(label: string, ids: string[], sources: SourceDef[]): CategoryGroup {
  const enabled: Record<string, boolean> = {}
  sources.forEach((s) => { enabled[s.name] = false })
  return { label, ids, sources, queries: [], newQuery: '', limit: 5, running: false, enabled, runs: {} }
}

function addQuery(grp: CategoryGroup) {
  const q = grp.newQuery.trim()
  if (!q || grp.queries.includes(q)) return
  grp.queries.push(q)
  grp.newQuery = ''
}

const categoryGroups = ref<CategoryGroup[]>([
  makeGroup('นาฬิกา', ['103'], [
    { name: 'StarBuyers Global Auction', url: 'https://www.starbuyers-global-auction.com/login' },
    { name: 'Chrono24', url: 'https://www.chrono24.com', apiRoute: '/api/chrono24-search' },
    { name: 'Auction House', url: 'https://www.auctionhouse.co.th', apiRoute: '/api/auctionhouse-search' },
    { name: 'Radium Watch', url: 'https://radiumwatch.com', apiRoute: '/api/radiumwatch-search' },
    { name: 'Siam Watch Club', url: 'https://www.siamwatchclub.com', apiRoute: '/api/siamwatchclub-search' },
    { name: 'Komehyo (นาฬิกา)', url: 'https://www.komehyo.co.th', apiRoute: '/api/komehyo-search' },
  ]),
  makeGroup('พระ/วัตถุมงคล', ['106'], [
    { name: 'Thaprachan', url: 'https://www.thaprachan.com/', apiRoute: '/api/thaprachan-search' },
    { name: 'Wutdychonburi', url: 'https://wutdychonburi.com/', apiRoute: '/api/wutdychonburi-search' },
    { name: 'Prapantip', url: 'https://www.prapantip.com/amulet/', apiRoute: '/api/prapantip-search' },
    { name: 'G-Pra', url: 'https://www.g-pra.com/' },
    { name: 'UAmulet', url: 'https://uauction.uamulet.com/AuctionUClubTopList.aspx', apiRoute: '/api/uauction-search' },
  ]),
  makeGroup('สินค้าไอที / โน้ตบุ๊ก / สมาร์ทโฟน', ['107', '109', '112'], [
    { name: 'ShopBKK', url: 'https://www.shopbkk.com', apiRoute: '/api/shopbkk-search' },
    { name: 'CompAsia', url: 'https://compasia.co.th', apiRoute: '/api/compasia-search' },
    { name: 'Kaidee', url: 'https://www.kaidee.com', apiRoute: '/api/kaidee-search' },
    { name: 'Pantipmarket (Mobile)', url: 'https://www.pantipmarket.com' },
    { name: '108 Accessory', url: 'http://www.108accessory.com/' },
  ]),
  makeGroup('แบรนเนม / แว่นตา', ['108', '110'], [
    { name: 'Komehyo', url: 'https://www.komehyo.co.th/', apiRoute: '/api/komehyo-search' },
    { name: 'Sasom', url: 'https://sasom.co.th/th', apiRoute: '/api/sasom-search' },
    { name: 'Moppet Brandname', url: 'https://www.moppetbrandname.com/', apiRoute: '/api/moppet-search' },
    { name: 'SF Brandname', url: 'https://sfbrandname.com/', apiRoute: '/api/sfbrandname-search' },
    { name: 'Brandname Voyage', url: 'https://brandnamevoyage.com/', apiRoute: '/api/brandnamevoyage-search' },
  ]),
  makeGroup('เครื่องมือช่าง', ['111'], [
    { name: 'Kaidee (เครื่องมือช่าง)', url: 'https://www.kaidee.com/c296-appliances_decoration-accessories_and_tool_suppliers', apiRoute: '/api/kaidee-search' },
    { name: 'Shopee (เครื่องมือช่าง)', url: 'https://shopee.co.th/search?keyword=%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%9B%E0%B9%88%E0%B8%B2%E0%B8%A5%E0%B8%A1' },
    { name: 'Truck2Hand', url: 'https://www.truck2hand.com/category/cat_equipment/', apiRoute: '/api/truck2hand-search' },
    { name: 'Facebook กลุ่ม 1', url: 'https://www.facebook.com/groups/198988708155849/' },
    { name: 'Facebook กลุ่ม 2', url: 'https://www.facebook.com/groups/4392804640788959/' },
    { name: 'Facebook กลุ่ม 3', url: 'https://www.facebook.com/groups/455495127955260/' },
  ]),
])

// ── Helpers ───────────────────────────────────────────────────────────────────
function srcExtracted(grp: CategoryGroup, srcName: string) {
  const run = grp.runs[srcName]
  if (!run) return []
  const multiQuery = grp.queries.length > 1
  return run.results.flatMap((r) => {
    const base = {
      _screenshot: r.base64 ?? '',
      ...(multiQuery ? { _query: (r as ItemResult & { _query?: string })._query ?? '' } : {}),
      _source: r.filename ?? r.url,
    }
    if (r.items.length > 0) {
      return r.items.map((item) => ({ ...base, ...item }))
    }
    if (r.screenshotOk && !r.extractOk) {
      return [{ ...base, _error: r.error ?? r.raw ?? 'AI extraction failed' }]
    }
    return []
  })
}

function srcHeaders(grp: CategoryGroup, srcName: string) {
  const rows = srcExtracted(grp, srcName)
  if (rows.length === 0) return []
  const dataKeys = Object.keys(rows[0]).filter((k) => k !== '_screenshot' && k !== '_source')
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 116 },
    ...dataKeys.map((k) => ({ title: k, key: k, sortable: true })),
    { title: 'ไฟล์', key: '_source', sortable: false },
  ]
}

// ── Terminal refs ──────────────────────────────────────────────────────────────
const termRefs = ref<Record<string, Element | null>>({})
function setTermRef(groupLabel: string, srcName: string, el: unknown) {
  termRefs.value[`${groupLabel}:${srcName}`] = el as Element | null
}
function scrollTerm(groupLabel: string, srcName: string) {
  nextTick(() => {
    const el = termRefs.value[`${groupLabel}:${srcName}`]
    if (el) el.scrollTop = el.scrollHeight
  })
}

// ── API mapping ────────────────────────────────────────────────────────────────
const API_CATEGORY_MAP: Record<string, string> = {
  '/api/chrono24-search': '103',
  '/api/auctionhouse-search': '103',
  '/api/radiumwatch-search': '103',
  '/api/siamwatchclub-search': '103',
  '/api/komehyo-search': '103', // overridden per-group at runtime
  '/api/thaprachan-search': '106',
  '/api/compasia-search': '112',
  // kaidee-search is used in multiple groups; categoryId resolved from grp.ids[0] at runtime
  '/api/pantipmarket-search': '107',
  '/api/sfbrandname-search': '108',
  '/api/brandnamevoyage-search': '108',
}

async function runSourceQuery(grp: CategoryGroup, src: SourceDef, query: string, qi: number) {
  const run = grp.runs[src.name]
  const categoryId = API_CATEGORY_MAP[src.apiRoute!] ?? grp.ids[0]
  const prefix = grp.queries.length > 1 ? `[${qi + 1}/${grp.queries.length}] ` : ''

  run.logs.push({ ts: new Date().toISOString(), level: 'info', msg: `${prefix}ค้นหา: ${query}` })
  scrollTerm(grp.label, src.name)

  try {
    const res = await fetch(src.apiRoute!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, categoryId, limit: grp.limit }),
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
            scrollTerm(grp.label, src.name)
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
        } catch { }
      }
    }
  } catch (e: unknown) {
    const msg = (e as Error).message ?? 'ค้นหาไม่สำเร็จ'
    run.error = (run.error ? run.error + ' | ' : '') + `${query}: ${msg}`
    run.logs.push({ ts: new Date().toISOString(), level: 'error', msg: `${prefix}${msg}` })
    scrollTerm(grp.label, src.name)
  }
}

async function runSource(grp: CategoryGroup, src: SourceDef) {
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
      await runSourceQuery(grp, src, grp.queries[qi], qi)
    }
  } finally {
    run.loading = false
    run.done = true
    scrollTerm(grp.label, src.name)
  }
}

async function runGroup(grp: CategoryGroup) {
  if (grp.queries.length === 0) return
  grp.running = true
  try {
    const enabledSources = grp.sources.filter((s) => s.apiRoute && grp.enabled[s.name])
    for (const src of enabledSources) {
      await runSource(grp, src)
    }
  } finally {
    grp.running = false
  }
}
</script>

<style scoped>
.alert-compact :deep(.v-alert__content) { padding-top: 6px; padding-bottom: 6px; }
.alert-compact { min-height: unset !important; }
.terminal-box {
  background: #1e1e1e;
  font-family: monospace;
  font-size: 12px;
  padding: 10px 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #555 #2d2d2d;
}
.terminal-box::-webkit-scrollbar { width: 6px; }
.terminal-box::-webkit-scrollbar-track { background: #2d2d2d; }
.terminal-box::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
.terminal-box::-webkit-scrollbar-thumb:hover { background: #777; }
</style>
