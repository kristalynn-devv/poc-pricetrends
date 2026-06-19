<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-6">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Price Extractor</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ถ่ายรูปเว็บ → AI ดึงข้อมูลสินค้า</p>
      </v-col>
      <v-col cols="auto">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small">System Logs</v-btn>
      </v-col>
    </v-row>

    <!-- ── Tab: Single URL vs Chrono24 ── -->
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="single">Single URL</v-tab>
      <v-tab value="chrono24">Chrono24</v-tab>
      <v-tab value="auctionhouse">AuctionHouse</v-tab>
    </v-tabs>

    <!-- ══════════════ TAB: Single URL ══════════════ -->
    <template v-if="activeTab === 'single'">
      <v-card class="mb-4" rounded="lg">
        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="8">
              <v-text-field
                v-model="url"
                label="URL หน้าเว็บ"
                placeholder="https://..."
                prepend-inner-icon="mdi-web"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="2">
              <v-select
                v-model="categoryId"
                :items="categories"
                item-title="label"
                item-value="id"
                label="หมวดสินค้า"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="2" class="d-flex align-center">
              <v-btn color="primary" block :loading="screenshotLoading" :disabled="!url" @click="takeScreenshot">
                <v-icon start>mdi-camera</v-icon>
                ถ่ายรูป
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Custom template toggle -->
      <v-card class="mb-4" rounded="lg" v-if="!useCustomTemplate">
        <v-card-text class="py-3">
          <span class="text-body-2 text-medium-emphasis mr-3">ใช้ template ตามหมวดสินค้า</span>
          <v-btn size="small" variant="tonal" @click="useCustomTemplate = true">กำหนด template เอง</v-btn>
        </v-card-text>
      </v-card>

      <v-card class="mb-4" rounded="lg" v-else>
        <v-card-title class="py-3 px-4 text-body-1">
          Template ที่ต้องการ
          <v-btn size="x-small" variant="text" class="ml-2" @click="useCustomTemplate = false">ใช้ default</v-btn>
        </v-card-title>
        <v-card-text>
          <v-row dense v-for="(row, i) in customFields" :key="i" align="center">
            <v-col cols="4">
              <v-text-field v-model="row.key" label="ชื่อ field" density="compact" variant="outlined" hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="row.desc" label="คำอธิบาย" density="compact" variant="outlined" hide-details />
            </v-col>
            <v-col cols="2">
              <v-btn icon="mdi-delete" size="small" variant="text" @click="customFields.splice(i, 1)" />
            </v-col>
          </v-row>
          <v-btn size="small" variant="tonal" class="mt-2" prepend-icon="mdi-plus" @click="customFields.push({ key: '', desc: '' })">
            เพิ่ม field
          </v-btn>
        </v-card-text>
      </v-card>

      <!-- Screenshot preview -->
      <v-card class="mb-4" rounded="lg" v-if="screenshot">
        <v-card-title class="py-3 px-4 d-flex align-center">
          <v-icon class="mr-2">mdi-image</v-icon>
          Screenshot
          <v-spacer />
          <v-btn color="primary" size="small" :loading="extractLoading" @click="extractData">
            <v-icon start>mdi-robot</v-icon>
            AI ดึงข้อมูล
          </v-btn>
        </v-card-title>
        <v-divider />
        <v-img
          :src="`data:${screenshotMime};base64,${screenshot}`"
          max-height="500"
          contain
          class="bg-grey-lighten-4 cursor-pointer"
          @click="lightboxSrc = `data:${screenshotMime};base64,${screenshot}`; lightboxOpen = true"
        />
      </v-card>
      <ImageLightbox v-model="lightboxOpen" :src="lightboxSrc" />

      <!-- Upload fallback -->
      <v-card class="mb-4" rounded="lg" v-if="!screenshot">
        <v-card-text class="py-3 text-center">
          <p class="text-body-2 text-medium-emphasis mb-2">หรืออัปโหลดรูปเอง</p>
          <v-btn variant="tonal" prepend-icon="mdi-upload" @click="triggerUpload">เลือกไฟล์รูป</v-btn>
          <input ref="fileInput" type="file" accept="image/*" class="d-none" @change="onFileUpload" />
        </v-card-text>
      </v-card>

      <!-- Error -->
      <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

      <!-- Results -->
      <v-card rounded="lg" v-if="items.length > 0">
        <v-card-title class="py-3 px-4 d-flex align-center">
          <v-icon class="mr-2">mdi-table</v-icon>
          ผลลัพธ์ ({{ items.length }} รายการ)
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" @click="downloadJson(items)">JSON</v-btn>
        </v-card-title>
        <v-divider />
        <v-data-table :headers="tableHeaders(items)" :items="items" density="compact" class="text-body-2" />
      </v-card>
    </template>

    <!-- ══════════════ TAB: Chrono24 Search ══════════════ -->
    <template v-if="activeTab === 'chrono24'">
      <v-card class="mb-4" rounded="lg">
        <v-card-text>
          <v-row dense align="center">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="searchQuery"
                label="ค้นหาบน Chrono24"
                placeholder="เช่น Rolex Submariner"
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                hide-details
                @keyup.enter="runSearch"
              />
            </v-col>
            <v-col cols="6" md="2">
              <v-select
                v-model="searchCategoryId"
                :items="categories"
                item-title="label"
                item-value="id"
                label="หมวด"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6" md="2">
              <v-select
                v-model="searchLimit"
                :items="[3, 5, 10]"
                label="จำนวน"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="2" class="d-flex align-center">
              <v-btn
                color="primary"
                block
                :loading="searchLoading"
                :disabled="!searchQuery.trim()"
                @click="runSearch"
              >
                <v-icon start>mdi-magnify</v-icon>
                ค้นหา
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Error -->
      <v-alert v-if="searchError" type="error" class="mb-4" closable @click:close="searchError = ''">{{ searchError }}</v-alert>

      <!-- Terminal log -->
      <v-card class="mb-4" rounded="lg" v-if="searchLogs.length > 0 || searchLoading">
        <v-card-title class="py-2 px-4 d-flex align-center" style="background:#1e1e1e; border-radius: 8px 8px 0 0">
          <v-icon class="mr-2" color="green" size="small">mdi-console</v-icon>
          <span class="text-body-2" style="color:#ccc; font-family:monospace">
            สถานะ{{ searchLoading ? ' — กำลังประมวลผล...' : ' — เสร็จสิ้น' }}
          </span>
          <v-spacer />
          <span v-if="searchSummary" class="text-caption" style="color:#888; font-family:monospace">
            screenshot {{ searchSummary.screenshotOk }}/{{ searchSummary.total }} · extract {{ searchSummary.extractOk }}/{{ searchSummary.total }}
          </span>
        </v-card-title>
        <div
          ref="searchTerminalEl"
          class="terminal-box"
        >
          <div v-if="searchLoading && searchLogs.length === 0" style="color:#666">รอการตอบสนอง...</div>
          <div
            v-for="(line, i) in searchLogs.slice(-15)"
            :key="i"
            :style="{ color: logColor(line.level), lineHeight: '1.7' }"
          >
            <span style="color:#555">{{ formatLogTime(line.ts) }}</span>
            <span :style="{ color: logLevelColor(line.level), marginLeft:'6px', marginRight:'6px' }">[{{ line.level.toUpperCase() }}]</span>
            <span>{{ line.msg }}</span>
            <span v-if="line.data" style="color:#666; margin-left:6px">{{ JSON.stringify(line.data) }}</span>
          </div>
          <div v-if="searchLoading" style="color:#4ec9b0">█</div>
        </div>
      </v-card>

      <!-- Combined results table -->
      <v-card rounded="lg" v-if="allExtractedItems.length > 0">
        <v-card-title class="py-3 px-4 d-flex align-center">
          <v-icon class="mr-2">mdi-table</v-icon>
          ผลลัพธ์รวม ({{ allExtractedItems.length }} รายการ)
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" @click="downloadJson(allExtractedItemsForExport)">JSON</v-btn>
        </v-card-title>
        <v-divider />
        <v-data-table
          :headers="searchTableHeaders"
          :items="allExtractedItems"
          density="compact"
          class="text-body-2"
        >
          <template #[`item._screenshot`]="{ item }">
            <v-img
              v-if="item._screenshot"
              :src="`data:image/jpeg;base64,${item._screenshot}`"
              width="120"
              height="80"
              cover
              class="my-1 rounded cursor-pointer"
              @click="lightboxSrc = `data:image/jpeg;base64,${item._screenshot}`; lightboxOpen = true"
            />
            <span v-else class="text-medium-emphasis text-caption">—</span>
          </template>
        </v-data-table>
      </v-card>
      <ImageLightbox v-model="lightboxOpen" :src="lightboxSrc" />
    </template>

    <!-- ══════════════ TAB: AuctionHouse ══════════════ -->
    <template v-if="activeTab === 'auctionhouse'">
      <v-card class="mb-4" rounded="lg">
        <v-card-text>
          <v-row dense align="center">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="ahQuery"
                label="ค้นหาบน AuctionHouse"
                placeholder="เช่น Rolex Daytona"
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                hide-details
                @keyup.enter="runAhSearch"
              />
            </v-col>
            <v-col cols="6" md="2">
              <v-select
                v-model="ahCategoryId"
                :items="categories"
                item-title="label"
                item-value="id"
                label="หมวด"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6" md="2">
              <v-select
                v-model="ahLimit"
                :items="[3, 5, 10]"
                label="จำนวน"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="2" class="d-flex align-center">
              <v-btn
                color="primary"
                block
                :loading="ahLoading"
                :disabled="!ahQuery.trim()"
                @click="runAhSearch"
              >
                <v-icon start>mdi-magnify</v-icon>
                ค้นหา
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-alert v-if="ahError" type="error" class="mb-4" closable @click:close="ahError = ''">{{ ahError }}</v-alert>

      <!-- Bot-blocked fallback: show search page screenshot -->
      <v-card class="mb-4" rounded="lg" v-if="ahSearchPageScreenshot">
        <v-card-title class="py-3 px-4 text-body-1 text-warning">
          <v-icon class="mr-2" color="warning">mdi-shield-alert</v-icon>
          Bot protection — ภาพหน้า search
        </v-card-title>
        <v-divider />
        <v-img
          :src="`data:image/jpeg;base64,${ahSearchPageScreenshot}`"
          max-height="400"
          contain
          class="bg-grey-lighten-4"
        />
      </v-card>

      <!-- Terminal log -->
      <v-card class="mb-4" rounded="lg" v-if="ahLogs.length > 0 || ahLoading">
        <v-card-title class="py-2 px-4 d-flex align-center" style="background:#1e1e1e; border-radius: 8px 8px 0 0">
          <v-icon class="mr-2" color="green" size="small">mdi-console</v-icon>
          <span class="text-body-2" style="color:#ccc; font-family:monospace">
            สถานะ{{ ahLoading ? ' — กำลังประมวลผล...' : ' — เสร็จสิ้น' }}
          </span>
          <v-spacer />
          <span v-if="ahSummary" class="text-caption" style="color:#888; font-family:monospace">
            screenshot {{ ahSummary.screenshotOk }}/{{ ahSummary.total }} · extract {{ ahSummary.extractOk }}/{{ ahSummary.total }}
          </span>
        </v-card-title>
        <div
          ref="ahTerminalEl"
          class="terminal-box"
        >
          <div v-if="ahLoading && ahLogs.length === 0" style="color:#666">รอการตอบสนอง...</div>
          <div
            v-for="(line, i) in ahLogs.slice(-15)"
            :key="i"
            :style="{ color: logColor(line.level), lineHeight: '1.7' }"
          >
            <span style="color:#555">{{ formatLogTime(line.ts) }}</span>
            <span :style="{ color: logLevelColor(line.level), marginLeft:'6px', marginRight:'6px' }">[{{ line.level.toUpperCase() }}]</span>
            <span>{{ line.msg }}</span>
            <span v-if="line.data" style="color:#666; margin-left:6px">{{ JSON.stringify(line.data) }}</span>
          </div>
          <div v-if="ahLoading" style="color:#4ec9b0">█</div>
        </div>
      </v-card>

      <!-- Combined results table -->
      <v-card rounded="lg" v-if="ahAllItems.length > 0">
        <v-card-title class="py-3 px-4 d-flex align-center">
          <v-icon class="mr-2">mdi-table</v-icon>
          ผลลัพธ์รวม ({{ ahAllItems.length }} รายการ)
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" @click="downloadJson(ahAllItemsForExport)">JSON</v-btn>
        </v-card-title>
        <v-divider />
        <v-data-table
          :headers="ahTableHeaders"
          :items="ahAllItems"
          density="compact"
          class="text-body-2"
        >
          <template #[`item._screenshot`]="{ item }">
            <v-img
              v-if="item._screenshot"
              :src="`data:image/jpeg;base64,${item._screenshot}`"
              width="120"
              height="80"
              cover
              class="my-1 rounded cursor-pointer"
              @click="lightboxSrc = `data:image/jpeg;base64,${item._screenshot}`; lightboxOpen = true"
            />
            <span v-else class="text-medium-emphasis text-caption">—</span>
          </template>
        </v-data-table>
      </v-card>
      <ImageLightbox v-model="lightboxOpen" :src="lightboxSrc" />
    </template>
  </v-container>
</template>

<script setup lang="ts">
// ── Shared ────────────────────────────────────────────────────────────────────
const activeTab = useState<'single' | 'chrono24' | 'auctionhouse'>('idx-activeTab', () => 'single')
const lightboxOpen = ref(false)
const lightboxSrc = ref('')

const categories = [
  { id: '103', label: 'นาฬิกา' },
  { id: '106', label: 'พระ/วัตถุมงคล' },
  { id: '107', label: 'สินค้าไอที' },
  { id: '108', label: 'แบรนเนม' },
  { id: '109', label: 'โน้ตบุ๊ก/แท็บเล็ต' },
  { id: '110', label: 'แว่นตา' },
  { id: '111', label: 'เครื่องมือช่าง' },
  { id: '112', label: 'สมาร์ทโฟน' },
]

function tableHeaders(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return []
  return Object.keys(rows[0]).map((k) => ({ title: k, key: k, sortable: true }))
}

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `extracted_${Date.now()}.json`
  a.click()
}

// ── Single URL ─────────────────────────────────────────────────────────────────
const url = useState('idx-url', () => '')
const categoryId = useState('idx-categoryId', () => '103')
const screenshot = useState('idx-screenshot', () => '')
const screenshotMime = useState('idx-screenshotMime', () => 'image/jpeg')
const screenshotLoading = ref(false)
const extractLoading = ref(false)
const error = useState('idx-error', () => '')
const items = useState<Record<string, unknown>[]>('idx-items', () => [])
const fileInput = ref<HTMLInputElement>()
const useCustomTemplate = useState('idx-useCustomTemplate', () => false)
const customFields = useState<{ key: string; desc: string }[]>('idx-customFields', () => [
  { key: 'title', desc: 'ชื่อสินค้า' },
  { key: 'price', desc: 'ราคา (ตัวเลขบาท) | null' },
  { key: 'condition', desc: '"new" | "used" | "unknown" | null' },
])

async function takeScreenshot() {
  screenshotLoading.value = true
  error.value = ''
  screenshot.value = ''
  try {
    const res = await $fetch<{ base64: string; mimeType: string }>('/api/screenshot', {
      method: 'POST',
      body: { url: url.value },
    })
    screenshot.value = res.base64
    screenshotMime.value = res.mimeType
    await extractData()
  } catch (e: unknown) {
    error.value = (e as Error).message ?? 'ถ่ายรูปไม่สำเร็จ'
  } finally {
    screenshotLoading.value = false
  }
}

function triggerUpload() { fileInput.value?.click() }

function onFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  screenshotMime.value = file.type
  const reader = new FileReader()
  reader.onload = () => {
    screenshot.value = (reader.result as string).split(',')[1]
  }
  reader.readAsDataURL(file)
}

async function extractData() {
  extractLoading.value = true
  error.value = ''
  items.value = []
  try {
    const template = useCustomTemplate.value
      ? Object.fromEntries(customFields.value.filter((r) => r.key).map((r) => [r.key, r.desc]))
      : undefined
    const res = await $fetch<{ items: Record<string, unknown>[]; raw?: string }>('/api/extract', {
      method: 'POST',
      body: { base64: screenshot.value, mimeType: screenshotMime.value, categoryId: categoryId.value, template },
    })
    items.value = res.items
    if (res.raw) error.value = 'AI ส่งข้อมูลมาแต่ parse JSON ไม่ได้: ' + res.raw.slice(0, 200)
  } catch (e: unknown) {
    error.value = (e as Error).message ?? 'ดึงข้อมูลไม่สำเร็จ'
  } finally {
    extractLoading.value = false
  }
}

// ── Chrono24 Search ────────────────────────────────────────────────────────────
interface ItemResult {
  index: number
  url: string
  filename: string | null
  base64: string | null
  screenshotOk: boolean
  extractOk: boolean
  items: Record<string, unknown>[]
  error?: string
}


const searchQuery = useState('idx-searchQuery', () => '')
const searchCategoryId = useState('idx-searchCategoryId', () => '103')
const searchLimit = useState('idx-searchLimit', () => 5)
const searchLoading = ref(false)
const searchError = useState('idx-searchError', () => '')
const searchResults = useState<ItemResult[]>('idx-searchResults', () => [])
const searchSummary = useState<{ total: number; screenshotOk: number; extractOk: number } | null>('idx-searchSummary', () => null)
const searchLogs = useState<{ ts: string; level: string; msg: string; data?: unknown }[]>('idx-searchLogs', () => [])
const searchTerminalEl = ref<HTMLElement>()

function scrollTerminal(el?: HTMLElement) {
  nextTick(() => { if (el) el.scrollTop = el.scrollHeight })
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

// Each row includes _screenshot (base64) for table display and _source for reference
const allExtractedItems = computed(() =>
  searchResults.value.flatMap((r) =>
    r.items.map((item) => ({ _screenshot: r.base64 ?? '', _source: r.filename ?? r.url, ...item }))
  )
)

// Export version without the heavy base64 blob
const allExtractedItemsForExport = computed(() =>
  allExtractedItems.value.map(({ _screenshot: _s, ...rest }) => rest)
)

const searchTableHeaders = computed(() => {
  if (allExtractedItems.value.length === 0) return []
  const dataKeys = Object.keys(allExtractedItems.value[0]).filter((k) => k !== '_screenshot' && k !== '_source')
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 136 },
    ...dataKeys.map((k) => ({ title: k, key: k, sortable: true })),
    { title: 'ไฟล์', key: '_source', sortable: false },
  ]
})

// ── AuctionHouse Search ───────────────────────────────────────────────────────

const ahQuery = useState('idx-ahQuery', () => '')
const ahCategoryId = useState('idx-ahCategoryId', () => '103')
const ahLimit = useState('idx-ahLimit', () => 5)
const ahLoading = ref(false)
const ahError = useState('idx-ahError', () => '')
const ahResults = useState<ItemResult[]>('idx-ahResults', () => [])
const ahSummary = useState<{ total: number; screenshotOk: number; extractOk: number } | null>('idx-ahSummary', () => null)
const ahSearchPageScreenshot = useState('idx-ahSearchPageScreenshot', () => '')
const ahLogs = useState<{ ts: string; level: string; msg: string; data?: unknown }[]>('idx-ahLogs', () => [])
const ahTerminalEl = ref<HTMLElement>()

const ahAllItems = computed(() =>
  ahResults.value.flatMap((r) =>
    r.items.map((item) => ({ _screenshot: r.base64 ?? '', _source: r.filename ?? r.url, ...(item as Record<string, unknown>) }))
  )
)
const ahAllItemsForExport = computed(() =>
  ahAllItems.value.map(({ _screenshot: _s, ...rest }) => rest)
)
const ahTableHeaders = computed(() => {
  if (ahAllItems.value.length === 0) return []
  const dataKeys = Object.keys(ahAllItems.value[0]).filter((k) => k !== '_screenshot' && k !== '_source')
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 136 },
    ...dataKeys.map((k) => ({ title: k, key: k, sortable: true })),
    { title: 'ไฟล์', key: '_source', sortable: false },
  ]
})

async function runAhSearch() {
  if (!ahQuery.value.trim()) return
  ahLoading.value = true
  ahError.value = ''
  ahResults.value = []
  ahSummary.value = null
  ahSearchPageScreenshot.value = ''
  ahLogs.value = []
  try {
    const res = await fetch('/api/auctionhouse-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ahQuery.value.trim(), categoryId: ahCategoryId.value, limit: ahLimit.value }),
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
          if (ev.type === 'log') { ahLogs.value.push(ev); scrollTerminal(ahTerminalEl.value) }
          else if (ev.type === 'result') ahResults.value.push(ev)
          else if (ev.type === 'searchpage') ahSearchPageScreenshot.value = ev.base64
          else if (ev.type === 'done') { ahSummary.value = ev.summary; if (ev.error) ahError.value = ev.error }
        } catch { }
      }
    }
  } catch (e: unknown) {
    ahError.value = (e as Error).message ?? 'ค้นหาไม่สำเร็จ'
  } finally {
    ahLoading.value = false
    scrollTerminal(ahTerminalEl.value)
  }
}

async function runSearch() {
  if (!searchQuery.value.trim()) return
  searchLoading.value = true
  searchError.value = ''
  searchResults.value = []
  searchSummary.value = null
  searchLogs.value = []
  try {
    const res = await fetch('/api/chrono24-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery.value.trim(), categoryId: searchCategoryId.value, limit: searchLimit.value }),
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
          if (ev.type === 'log') { searchLogs.value.push(ev); scrollTerminal(searchTerminalEl.value) }
          else if (ev.type === 'result') searchResults.value.push(ev)
          else if (ev.type === 'done') { searchSummary.value = ev.summary; if (ev.error) searchError.value = ev.error }
        } catch { }
      }
    }
  } catch (e: unknown) {
    searchError.value = (e as Error).message ?? 'ค้นหาไม่สำเร็จ'
  } finally {
    searchLoading.value = false
    scrollTerminal(searchTerminalEl.value)
  }
}
</script>

<style scoped>
.terminal-box {
  background: #1e1e1e;
  font-family: monospace;
  font-size: 12px;
  padding: 12px 16px;
  height: 260px;
  overflow-y: auto;
  border-radius: 0 0 8px 8px;
  scrollbar-width: thin;
  scrollbar-color: #555 #2d2d2d;
}
.terminal-box::-webkit-scrollbar {
  width: 6px;
}
.terminal-box::-webkit-scrollbar-track {
  background: #2d2d2d;
}
.terminal-box::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}
.terminal-box::-webkit-scrollbar-thumb:hover {
  background: #777;
}
</style>
