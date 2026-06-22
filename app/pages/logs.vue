<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-4">
      <v-col>
        <h1 class="text-h4 font-weight-bold">System Logs</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">บันทึกกิจกรรมและสรุปรายวัน</p>
      </v-col>
      <v-col cols="auto">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" size="small">กลับหน้าหลัก</v-btn>
      </v-col>
    </v-row>

    <!-- Controls -->
    <v-row class="mb-4" align="center" dense>
      <v-col cols="12" sm="auto">
        <v-text-field
          v-model="selectedDate"
          type="date"
          label="วันที่"
          variant="outlined"
          density="compact"
          hide-details
          style="min-width: 180px"
          @change="fetchAll"
        />
      </v-col>
      <v-col cols="auto">
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="fetchAll">รีเฟรช</v-btn>
      </v-col>
      <v-spacer />
      <v-col cols="auto">
        <v-btn-toggle v-model="activeView" density="compact" rounded="lg" mandatory>
          <v-btn value="summary" prepend-icon="mdi-chart-box-outline" size="small">Summary</v-btn>
          <v-btn value="entries" prepend-icon="mdi-table" size="small">รายการ</v-btn>
        </v-btn-toggle>
      </v-col>
    </v-row>

    <v-alert v-if="fetchError" type="error" class="mb-4" closable>{{ fetchError }}</v-alert>

    <!-- ══ SUMMARY VIEW ══ -->
    <template v-if="activeView === 'summary'">
      <template v-if="summary">
        <!-- KPI -->
        <v-row class="mb-4" dense>
          <v-col cols="6" sm="3">
            <v-card rounded="lg" variant="tonal" color="primary" @click="activeView = 'entries'" class="cursor-pointer">
              <v-card-text class="text-center pa-4">
                <div class="text-h4 font-weight-bold">{{ summary.total }}</div>
                <div class="text-caption mt-1">ทำงานทั้งหมด</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card rounded="lg" variant="tonal" color="success" @click="filterStatus('success')" class="cursor-pointer">
              <v-card-text class="text-center pa-4">
                <div class="text-h4 font-weight-bold">{{ summary.success }}</div>
                <div class="text-caption mt-1">สำเร็จ</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card rounded="lg" variant="tonal" :color="summary.failed > 0 ? 'error' : 'grey'" @click="filterStatus('failed')" class="cursor-pointer">
              <v-card-text class="text-center pa-4">
                <div class="text-h4 font-weight-bold">{{ summary.failed }}</div>
                <div class="text-caption mt-1">ล้มเหลว</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card rounded="lg" variant="tonal" color="info">
              <v-card-text class="text-center pa-4">
                <div class="text-h4 font-weight-bold">{{ summary.totalItemsExtracted }}</div>
                <div class="text-caption mt-1">items ดึงได้</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <v-row class="mb-4" dense>
          <!-- By Source -->
          <v-col cols="12" md="6">
            <v-card rounded="lg">
              <v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2">แหล่งข้อมูล</v-card-title>
              <v-table density="compact">
                <thead><tr>
                  <th>Source</th>
                  <th class="text-right">ทั้งหมด</th>
                  <th class="text-right">สำเร็จ</th>
                  <th class="text-right">ล้มเหลว</th>
                </tr></thead>
                <tbody>
                  <tr v-for="(stat, src) in summary.bySource" :key="src" class="cursor-pointer" @click="filterSource(src as string)">
                    <td><v-chip size="x-small" label>{{ src }}</v-chip></td>
                    <td class="text-right">{{ stat.total }}</td>
                    <td class="text-right text-success">{{ stat.success }}</td>
                    <td class="text-right" :class="stat.failed > 0 ? 'text-error' : ''">{{ stat.failed }}</td>
                  </tr>
                  <tr v-if="!Object.keys(summary.bySource).length">
                    <td colspan="4" class="text-center text-disabled py-3">ไม่มีข้อมูล</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>

          <!-- By Category -->
          <v-col cols="12" md="6">
            <v-card rounded="lg">
              <v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2">หมวดหมู่</v-card-title>
              <v-table density="compact">
                <thead><tr>
                  <th>Category</th>
                  <th class="text-right">ทั้งหมด</th>
                  <th class="text-right">สำเร็จ</th>
                  <th class="text-right">Items</th>
                </tr></thead>
                <tbody>
                  <tr v-for="(stat, cat) in summary.byCategory" :key="cat" class="cursor-pointer" @click="filterCategory(cat as string)">
                    <td>{{ cat }}</td>
                    <td class="text-right">{{ stat.total }}</td>
                    <td class="text-right text-success">{{ stat.success }}</td>
                    <td class="text-right">{{ stat.itemsExtracted }}</td>
                  </tr>
                  <tr v-if="!Object.keys(summary.byCategory).length">
                    <td colspan="4" class="text-center text-disabled py-3">ไม่มีข้อมูล</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>
        </v-row>

        <!-- Error list -->
        <v-card rounded="lg">
          <v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2 d-flex align-center gap-2">
            Error Log
            <v-chip v-if="summary.errors.length" size="small" color="error" label>{{ summary.errors.length }}</v-chip>
            <v-chip v-else size="small" color="success" label>ไม่มี error</v-chip>
            <v-spacer />
            <span class="text-caption text-disabled font-weight-regular">avg {{ summary.avgDurationMs.toLocaleString() }} ms / request</span>
          </v-card-title>
          <v-divider />
          <template v-if="summary.errors.length">
            <v-list density="compact" lines="two">
              <v-list-item v-for="(err, i) in sortedErrors" :key="i" :subtitle="err.url">
                <template #prepend>
                  <v-chip size="x-small" :color="errorColor(err.errorType)" label class="mr-3">{{ err.errorType ?? 'error' }}</v-chip>
                </template>
                <template #title>
                  <span class="text-error text-body-2">{{ err.error }}</span>
                  <v-chip v-if="err.searchQuery" size="x-small" variant="tonal" class="ml-2">🔍 {{ err.searchQuery }}</v-chip>
                </template>
                <template #append>
                  <v-chip size="x-small" :color="err.source === 'chrono24-search' ? 'blue' : 'grey'" variant="tonal" label class="mr-2">{{ err.source ?? 'analyze' }}</v-chip>
                  <span class="text-caption text-disabled">{{ formatTime(err.timestamp) }}</span>
                </template>
              </v-list-item>
            </v-list>
          </template>
          <v-card-text v-else class="text-center text-disabled py-6">ไม่มี error วันนี้</v-card-text>
        </v-card>
      </template>
      <v-card v-else-if="!loading" rounded="lg">
        <v-card-text class="text-center text-disabled py-10">ไม่มีข้อมูล Log วันที่ {{ selectedDate }}</v-card-text>
      </v-card>
    </template>

    <!-- ══ ENTRIES VIEW ══ -->
    <template v-if="activeView === 'entries'">
      <!-- Filter bar -->
      <v-row class="mb-3" dense align="center">
        <v-col cols="12" sm="4">
          <v-text-field
            v-model="search"
            label="ค้นหา URL / keyword"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
          />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select
            v-model="filterSrc"
            :items="['ทั้งหมด', ...availableSources]"
            label="Source"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select
            v-model="filterCat"
            :items="['ทั้งหมด', ...availableCategories]"
            label="Category"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select
            v-model="filterResult"
            :items="[{ title: 'ทั้งหมด', value: 'all' }, { title: 'สำเร็จ', value: 'success' }, { title: 'ล้มเหลว', value: 'failed' }]"
            item-title="title"
            item-value="value"
            label="สถานะ"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col cols="auto">
          <span class="text-caption text-disabled">{{ filteredEntries.length }} รายการ</span>
        </v-col>
      </v-row>

      <v-card rounded="lg">
        <v-data-table
          :headers="entryHeaders"
          :items="filteredEntries"
          density="compact"
          :items-per-page="25"
          class="text-body-2"
          @click:row="(_: any, { item }: any) => openDetail(item)"
        >
          <template #[`item.timestamp`]="{ item }">
            <span class="text-caption">{{ formatTime(item.timestamp) }}</span>
          </template>
          <template #[`item.httpStatus`]="{ item }">
            <v-chip size="x-small" :color="item.httpStatus === 200 ? 'success' : 'error'" label>{{ item.httpStatus }}</v-chip>
          </template>
          <template #[`item.source`]="{ item }">
            <v-chip size="x-small" :color="item.source === 'chrono24-search' ? 'blue' : 'grey'" variant="tonal" label>{{ item.source }}</v-chip>
          </template>
          <template #[`item.url`]="{ item }">
            <span class="text-caption" style="max-width:320px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{{ item.url }}</span>
          </template>
          <template #[`item.domain`]="{ item }">
            <span class="text-caption">{{ entryDomain(item) }}</span>
          </template>
          <template #[`item.screenshotFile`]="{ item }">
            <span class="text-caption text-medium-emphasis">{{ item.screenshotFile ?? '—' }}</span>
          </template>
          <template #[`item.itemsExtracted`]="{ item }">
            <v-chip v-if="item.itemsExtracted != null" size="x-small" :color="item.itemsExtracted > 0 ? 'success' : 'grey'" variant="tonal">{{ item.itemsExtracted }}</v-chip>
            <span v-else class="text-disabled">—</span>
          </template>
          <template #[`item.error`]="{ item }">
            <span v-if="item.error" class="text-error text-caption" style="max-width:200px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{{ item.error }}</span>
            <span v-else class="text-disabled">—</span>
          </template>
          <template #[`item.durationMs`]="{ item }">
            <span class="text-caption">{{ item.durationMs.toLocaleString() }} ms</span>
          </template>
        </v-data-table>
      </v-card>
    </template>

    <!-- Detail dialog -->
    <v-dialog v-model="detailOpen" max-width="700">
      <v-card v-if="detailEntry" rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-chip :color="detailEntry.httpStatus === 200 ? 'success' : 'error'" label class="mr-3">{{ detailEntry.httpStatus }}</v-chip>
          Log Detail
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="detailOpen = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <!-- Screenshot -->
          <div v-if="detailEntry.screenshotFile" class="mb-4">
            <a :href="`/api/screenshot?file=${detailEntry.screenshotFile}`" target="_blank">
              <v-img
                :src="`/api/screenshot?file=${detailEntry.screenshotFile}`"
                max-height="260"
                contain
                class="bg-grey-lighten-4 rounded cursor-pointer"
              />
            </a>
          </div>

          <!-- Data file -->
          <div class="mb-4" v-if="detailEntry.dataFile">
            <v-btn
              size="small" variant="tonal" color="primary" prepend-icon="mdi-code-json"
              :href="`/api/data?file=${detailEntry.dataFile}`"
              target="_blank"
            >ดูข้อมูล JSON</v-btn>
          </div>

          <v-table density="compact">
            <tbody>
              <tr v-for="[k, v] in detailRows" :key="k">
                <td class="text-medium-emphasis font-weight-medium" style="width:160px">{{ k }}</td>
                <td>
                  <v-chip v-if="k === 'errorType' && v" size="x-small" :color="errorColor(v as string)" label>{{ v }}</v-chip>
                  <span v-else :class="k === 'error' && v ? 'text-error' : ''">{{ v ?? '—' }}</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
const today = new Date().toISOString().slice(0, 10)
const selectedDate = ref(today)
const loading = ref(false)
const fetchError = ref<string | null>(null)
const summary = ref<any>(null)
const entries = ref<any[]>([])
const activeView = ref<'summary' | 'entries'>('summary')

// Filters for entries view
const search = ref('')
const filterSrc = ref('ทั้งหมด')
const filterCat = ref('ทั้งหมด')
const filterResult = ref('all')

function entryDomain(e: any): string {
  return e.source ?? extractDomain(e.url)
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0] } catch { return 'unknown' }
}

const sortedErrors = computed(() =>
  [...(summary.value?.errors ?? [])].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
)

const availableSources = computed(() => [...new Set(entries.value.map(entryDomain))])
const availableCategories = computed(() => [...new Set(entries.value.map((e) => e.categoryId).filter(Boolean))])

const filteredEntries = computed(() => {
  return entries.value.filter((e) => {
    if (filterSrc.value !== 'ทั้งหมด' && entryDomain(e) !== filterSrc.value) return false
    if (filterCat.value !== 'ทั้งหมด' && e.categoryId !== filterCat.value) return false
    if (filterResult.value === 'success' && (e.httpStatus !== 200 || e.error)) return false
    if (filterResult.value === 'failed' && e.httpStatus === 200 && !e.error) return false
    if (search.value) {
      const q = search.value.toLowerCase()
      if (!e.url?.toLowerCase().includes(q) && !e.searchQuery?.toLowerCase().includes(q) && !e.screenshotFile?.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
})

const entryHeaders = [
  { title: 'เวลา', key: 'timestamp', width: 90 },
  { title: 'Status', key: 'httpStatus', width: 80 },
  { title: 'Source', key: 'domain', width: 150 },
  { title: 'URL', key: 'url' },
  { title: 'ไฟล์', key: 'screenshotFile', width: 200 },
  { title: 'Items', key: 'itemsExtracted', width: 70 },
  { title: 'Error', key: 'error' },
  { title: 'ms', key: 'durationMs', width: 100 },
]

// Detail dialog
const detailOpen = ref(false)
const detailEntry = ref<any>(null)

function openDetail(item: any) {
  detailEntry.value = item
  detailOpen.value = true
}

const detailRows = computed(() => {
  if (!detailEntry.value) return []
  const e = detailEntry.value
  return [
    ['เวลา', new Date(e.timestamp).toLocaleString('th-TH')],
    ['source', e.source],
    ['URL', e.url],
    ['searchQuery', e.searchQuery],
    ['categoryId', e.categoryId],
    ['httpStatus', e.httpStatus],
    ['screenshotFile', e.screenshotFile],
    ['dataFile', e.dataFile],
    ['itemsExtracted', e.itemsExtracted],
    ['durationMs', e.durationMs != null ? `${e.durationMs.toLocaleString()} ms` : null],
    ['errorType', e.errorType],
    ['error', e.error],
  ]
})

async function fetchAll() {
  loading.value = true
  fetchError.value = null
  const dateParam = selectedDate.value.replace(/-/g, '')
  try {
    const [sumData, entriesData] = await Promise.all([
      $fetch<any>(`/api/logs/summary?date=${dateParam}`),
      $fetch<any>(`/api/logs/entries?date=${dateParam}`),
    ])
    summary.value = sumData.total === 0 ? null : sumData
    entries.value = entriesData.entries ?? []
  } catch (e: any) {
    fetchError.value = e?.message ?? 'โหลดข้อมูลล้มเหลว'
    summary.value = null
    entries.value = []
  } finally {
    loading.value = false
  }
}

function filterStatus(status: 'success' | 'failed') {
  filterSrc.value = 'ทั้งหมด'
  filterCat.value = 'ทั้งหมด'
  filterResult.value = status
  activeView.value = 'entries'
}

function filterSource(src: string) {
  filterCat.value = 'ทั้งหมด'
  filterResult.value = 'all'
  filterSrc.value = src
  activeView.value = 'entries'
}

function filterCategory(cat: string) {
  filterSrc.value = 'ทั้งหมด'
  filterResult.value = 'all'
  filterCat.value = cat
  activeView.value = 'entries'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function errorColor(type: string | null) {
  const map: Record<string, string> = {
    timeout: 'warning', screenshot: 'error', extraction: 'orange',
    parse: 'purple', config: 'red',
  }
  return map[type ?? ''] ?? 'error'
}

onMounted(fetchAll)
</script>
