<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-4">
      <v-col>
        <h1 class="text-h4 font-weight-bold">System Logs</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">บันทึกกิจกรรมและสรุปรายวัน</p>
      </v-col>
      <v-col cols="auto" class="d-flex ga-1">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" size="small">กลับหน้าหลัก</v-btn>
      </v-col>
    </v-row>

    <!-- Controls -->
    <v-row class="mb-4" align="center" dense>
      <v-col cols="12" sm="auto">
        <v-menu v-model="dateMenu" :close-on-content-click="false" min-width="auto">
          <template #activator="{ props }">
            <v-text-field :model-value="formattedDate" label="วันที่" prepend-inner-icon="mdi-calendar"
              variant="outlined" density="compact" hide-details readonly style="min-width: 180px" v-bind="props" />
          </template>
          <v-date-picker v-model="datePickerDate" hide-header />
        </v-menu>
      </v-col>
      <v-spacer />
      <v-col cols="auto">
        <v-btn-toggle v-model="activeView" density="compact" rounded="lg" mandatory border>
          <v-btn value="summary" prepend-icon="mdi-chart-box-outline" size="small">Summary</v-btn>
          <v-btn value="entries" prepend-icon="mdi-table" size="small">รายการ</v-btn>
        </v-btn-toggle>
      </v-col>
    </v-row>

    <v-alert v-if="logsFetchError" type="error" class="mb-4" closable>{{ logsFetchError }}</v-alert>

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
            <v-card rounded="lg" variant="tonal" color="success" @click="store.filterStatus('success')"
              class="cursor-pointer">
              <v-card-text class="text-center pa-4">
                <div class="text-h4 font-weight-bold">{{ summary.success }}</div>
                <div class="text-caption mt-1">สำเร็จ</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card rounded="lg" variant="tonal" :color="summary.failed > 0 ? 'error' : 'grey'"
              @click="store.filterStatus('failed')" class="cursor-pointer">
              <v-card-text class="text-center pa-4">
                <div class="text-h4 font-weight-bold">{{ summary.failed }}</div>
                <div class="text-caption mt-1">ล้มเหลว</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="3">
            <v-card rounded="lg" variant="tonal" color="deep-purple">
              <v-card-text class="pa-4">
                <div class="d-flex justify-space-between align-start">
                  <div>
                    <div class="text-caption text-medium-emphasis">Input tokens</div>
                    <div class="text-h6 font-weight-bold">{{ summary.totalInputTokens?.toLocaleString() ?? '-' }}</div>
                  </div>
                  <v-divider vertical class="mx-3" />
                  <div>
                    <div class="text-caption text-medium-emphasis">Output tokens</div>
                    <div class="text-h6 font-weight-bold">{{ summary.totalOutputTokens?.toLocaleString() ?? '-' }}</div>
                  </div>
                </div>
                <div class="text-caption text-medium-emphasis mt-1">Gemini tokens วันนี้</div>
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
                <thead>
                  <tr>
                    <th>Source</th>
                    <th class="text-right">ทั้งหมด</th>
                    <th class="text-right">สำเร็จ</th>
                    <th class="text-right">ล้มเหลว</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(stat, src) in summary.bySource" :key="src" class="cursor-pointer"
                    @click="store.filterSource(src as string)">
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
                <thead>
                  <tr>
                    <th>Category</th>
                    <th class="text-right">ทั้งหมด</th>
                    <th class="text-right">สำเร็จ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(stat, cat) in summary.byCategory" :key="cat" class="cursor-pointer"
                    @click="store.filterCategory(cat as string)">
                    <td>{{ cat }}</td>
                    <td class="text-right">{{ stat.total }}</td>
                    <td class="text-right text-success">{{ stat.success }}</td>
                  </tr>
                  <tr v-if="!Object.keys(summary.byCategory).length">
                    <td colspan="3" class="text-center text-disabled py-3">ไม่มีข้อมูล</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>
        </v-row>

        <!-- Error list -->
        <v-card rounded="lg">
          <v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2 d-flex align-center ga-1">
            Error Log
            <v-chip v-if="summary.errors.length" size="small" color="error" label>{{ summary.errors.length }}</v-chip>
            <v-chip v-else size="small" color="success" label>ไม่มี error</v-chip>
            <v-spacer />
            <span class="text-caption text-disabled font-weight-regular">avg {{ summary.avgDurationMs.toLocaleString()
              }} ms / request</span>
          </v-card-title>
          <v-divider />
          <template v-if="summary.errors.length">
            <v-list density="compact" lines="two">
              <v-list-item v-for="(err, i) in sortedErrors" :key="i" :subtitle="err.url">
                <template #prepend>
                  <v-chip size="x-small" :color="errorColor(err.errorType)" label class="mr-3">{{ err.errorType ??
                    'error' }}</v-chip>
                </template>
                <template #title>
                  <span class="text-error text-body-2">{{ err.error }}</span>
                  <v-chip v-if="err.searchQuery" size="x-small" variant="tonal" class="ml-2">🔍 {{ err.searchQuery
                    }}</v-chip>
                </template>
                <template #append>
                  <v-chip size="x-small" :color="err.source === 'chrono24-search' ? 'blue' : 'grey'" variant="tonal"
                    label class="mr-2">{{ err.source ?? 'analyze' }}</v-chip>
                  <span class="text-caption text-disabled">{{ formatTime(err.timestamp) }}</span>
                </template>
              </v-list-item>
            </v-list>
          </template>
          <v-card-text v-else class="text-center text-disabled py-6">ไม่มี error วันนี้</v-card-text>
        </v-card>
      </template>
      <v-card v-else-if="!logsLoading" rounded="lg">
        <v-card-text class="text-center text-disabled py-10">ไม่มีข้อมูล Log วันที่ {{ selectedDate }}</v-card-text>
      </v-card>
    </template>

    <!-- ══ ENTRIES VIEW ══ -->
    <template v-if="activeView === 'entries'">
      <!-- Filter bar -->
      <v-row class="mb-3" dense align="center">
        <v-col cols="12" sm="4">
          <v-text-field v-model="logsSearch" label="ค้นหา URL / keyword" prepend-inner-icon="mdi-magnify" variant="outlined"
            density="compact" hide-details clearable />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="logsFilterSrc" :items="['ทั้งหมด', ...logsAvailableSources]" label="Source" variant="outlined"
            density="compact" hide-details />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="logsFilterCat" :items="['ทั้งหมด', ...logsAvailableCategories]" label="Category" variant="outlined"
            density="compact" hide-details />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="logsFilterResult"
            :items="[{ title: 'ทั้งหมด', value: 'all' }, { title: 'สำเร็จ', value: 'success' }, { title: 'ล้มเหลว', value: 'failed' }]"
            item-title="title" item-value="value" label="สถานะ" variant="outlined" density="compact" hide-details />
        </v-col>
        <v-col cols="auto">
          <span class="text-caption text-disabled">{{ filteredEntries.length }} รายการ</span>
        </v-col>
      </v-row>

      <v-card rounded="lg">
        <v-data-table :headers="entryHeaders" :items="filteredEntries" density="compact" :items-per-page="25"
          class="text-body-2" @click:row="(_: any, { item }: any) => store.openLogsDetail(item)">
          <template #[`item.timestamp`]="{ item }">
            <span class="text-caption">{{ formatTime(item.timestamp) }}</span>
          </template>
          <template #[`item.httpStatus`]="{ item }">
            <v-chip size="x-small" :color="item.httpStatus === 200 ? 'success' : 'error'" label>{{ item.httpStatus
              }}</v-chip>
          </template>
          <template #[`item.source`]="{ item }">
            <v-chip size="x-small" :color="item.source === 'chrono24-search' ? 'blue' : 'grey'" variant="tonal" label>{{
              item.source }}</v-chip>
          </template>
          <template #[`item.url`]="{ item }">
            <span class="text-caption"
              style="max-width:320px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{{
                item.url }}</span>
          </template>
          <template #[`item.domain`]="{ item }">
            <span class="text-caption">{{ store.entryDomain(item) }}</span>
          </template>
          <template #[`item.screenshotFile`]="{ item }">
            <span class="text-caption text-medium-emphasis">{{ item.screenshotFile ?? '-' }}</span>
          </template>
          <template #[`item.error`]="{ item }">
            <span v-if="item.error" class="text-error text-caption"
              style="max-width:200px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{{
                item.error }}</span>
            <span v-else class="text-disabled">-</span>
          </template>
          <template #[`item.searchQuery`]="{ item }">
            <v-chip v-if="item.searchQuery" size="x-small" color="primary" variant="tonal" prepend-icon="mdi-magnify" label>{{ item.searchQuery }}</v-chip>
            <span v-else class="text-disabled">-</span>
          </template>
          <template #[`item.durationMs`]="{ item }">
            <span class="text-caption">{{ item.durationMs.toLocaleString() }} ms</span>
          </template>
          <template #[`item.tokens`]="{ item }">
            <span v-if="item.geminiInputTokens != null" class="text-caption text-medium-emphasis">
              {{ item.geminiInputTokens.toLocaleString() }} / {{ (item.geminiOutputTokens ?? 0).toLocaleString() }}
            </span>
            <span v-else class="text-disabled">-</span>
          </template>
        </v-data-table>
      </v-card>
    </template>

    <!-- Detail dialog -->
    <v-dialog v-model="logsDetailOpen" max-width="860" scrollable>
      <v-card v-if="logsDetailEntry" rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-chip :color="logsDetailEntry.httpStatus === 200 ? 'success' : 'error'" label class="mr-3">{{
            logsDetailEntry.httpStatus
            }}</v-chip>
          Log Detail
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="logsDetailOpen = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <!-- Screenshot -->
          <ScreenshotImg v-if="logsDetailEntry.screenshotFile" :src="`/api/screenshot?file=${logsDetailEntry.screenshotFile}`"
            max-height="260" class="mb-4" />

          <v-table density="compact">
            <tbody>
              <tr v-for="[k, v] in detailRows" :key="k">
                <td class="text-medium-emphasis font-weight-medium" style="width:160px">{{ k }}</td>
                <td>
                  <v-chip v-if="k === 'errorType' && v" size="x-small" :color="errorColor(v as string)" label>{{ v
                  }}</v-chip>
                  <span v-else-if="k === 'URL' && v" class="d-flex align-center ga-1">
                    <span style="word-break:break-all">{{ v }}</span>
                    <v-btn :href="v as string" target="_blank" rel="noopener" icon="mdi-open-in-new" size="x-small"
                      variant="text" />
                  </span>
                  <span v-else-if="k === 'dataFile' && v" class="d-flex align-center ga-1">
                    <span>{{ v }}</span>
                    <v-btn :href="`/api/data?file=${v}`" target="_blank" icon="mdi-code-json" size="x-small"
                      variant="text" />
                  </span>
                  <span v-else :class="k === 'error' && v ? 'text-error' : ''">{{ v ?? '-' }}</span>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Extracted Items -->
          <template v-if="logsDetailEntry.dataFile">
            <v-divider class="my-4" />
            <div class="mb-3 d-flex align-center ga-2">
              ข้อมูลที่ Gemini ดึงได้
            </div>
            <v-row v-if="logsDetailItems.length" dense>
              <v-col v-for="(item, i) in logsDetailItems" :key="i" cols="12">
                <v-card variant="tonal" color="surface-variant" rounded="lg" class="pa-3 text-body">
                  <v-row dense>
                    <v-col v-for="[fk, fv] in Object.entries(item).filter(([, v]) => v != null && v !== '')" :key="fk"
                      cols="6" sm="4">
                      <div class="text-medium-emphasis">{{ fk }}</div>
                      <div class="font-weight-medium">{{ fv }}</div>
                    </v-col>
                  </v-row>
                </v-card>
              </v-col>
            </v-row>
            <v-card v-else-if="!logsDetailItemsLoading" variant="outlined" rounded="lg"
              class="pa-3 text-center text-disabled text-body-2">
              ไม่มีข้อมูล
            </v-card>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">

const store = useLogsEntriesStore()
const route = useRoute()

const {
  selectedDate, dateMenu, formattedDate,
  logsLoading, logsFetchError, summary, activeView,
  logsSearch, logsFilterSrc, logsFilterCat, logsFilterResult,
  sortedErrors, logsAvailableSources, logsAvailableCategories,
  filteredEntries,
  logsDetailOpen, logsDetailEntry, logsDetailItems, logsDetailItemsLoading,
} = storeToRefs(store)

const initialDate = typeof route.query.date === 'string' ? route.query.date : null
if (initialDate) selectedDate.value = initialDate

const datePickerDate = computed({
  get: () => new Date(selectedDate.value + 'T00:00:00'),
  set: (val: Date) => {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    selectedDate.value = `${y}-${m}-${d}`
    dateMenu.value = false
    store.fetchAll()
  },
})

const entryHeaders = [
  { title: 'เวลา', key: 'timestamp', width: 90 },
  { title: 'Status', key: 'httpStatus', width: 80 },
  { title: 'Source', key: 'domain', width: 120 },
  { title: 'Query', key: 'searchQuery', width: 150 },
  { title: 'URL', key: 'url' },
  { title: 'Error', key: 'error' },
  { title: 'ms', key: 'durationMs', width: 90 },
  { title: 'in/out tokens', key: 'tokens', width: 130 },
]

const detailRows = computed(() => {
  if (!logsDetailEntry.value) return []
  const e = logsDetailEntry.value
  return [
    ['เวลา', new Date(e.timestamp).toLocaleString('th-TH')],
    ['source', e.source],
    ['searchQuery', e.searchQuery],
    ['roundId', e.roundId],
    ['URL', e.url],
    ['categoryId', e.categoryId],
    ['httpStatus', e.httpStatus],
    ['screenshotFile', e.screenshotFile],
    ['dataFile', e.dataFile],
    ['durationMs', e.durationMs != null ? `${e.durationMs.toLocaleString()} ms` : null],
    ['errorType', e.errorType],
    ['error', e.error],
    ['geminiInputTokens', e.geminiInputTokens != null ? e.geminiInputTokens.toLocaleString() : null],
    ['geminiOutputTokens', e.geminiOutputTokens != null ? e.geminiOutputTokens.toLocaleString() : null],
    ['imageResolution', e.imageWidth != null ? `${e.imageWidth} × ${e.imageHeight} px` : null],
  ]
})

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

onMounted(async () => {
  await store.fetchAll()
  const targetFile = typeof route.query.file === 'string' ? route.query.file : null
  if (targetFile) {
    const match = store.logEntries.find(e => e.screenshotFile === targetFile)
    if (match) {
      activeView.value = 'entries'
      store.openLogsDetail(match)
    }
  }
})
</script>
