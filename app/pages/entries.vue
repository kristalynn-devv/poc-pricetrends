<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-4">
      <v-col>
        <h1 class="text-h4 font-weight-bold">ผลลัพธ์รวม</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ข้อมูลสินค้าที่ดึงได้รายวัน</p>
      </v-col>
      <v-col cols="auto" class="d-flex ga-1">
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small">System Logs</v-btn>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" size="small">หน้าหลัก</v-btn>
      </v-col>
    </v-row>

    <!-- Controls -->
    <v-card rounded="lg" class="mb-4 pa-3">
      <v-row align="center" dense>
        <v-col cols="12" sm="auto">
          <v-menu v-model="dateMenu" :close-on-content-click="false" min-width="auto">
            <template #activator="{ props }">
              <v-text-field :model-value="formattedDate" label="วันที่" prepend-inner-icon="mdi-calendar"
                variant="outlined" density="compact" hide-details readonly style="min-width: 180px" v-bind="props" />
            </template>
            <v-date-picker v-model="datePickerDate" hide-header />
          </v-menu>
        </v-col>
        <v-col cols="12" sm="3">
          <v-text-field v-model="entriesSearch" label="ค้นหา brand / model / keyword" prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details clearable />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="entriesFilterSrc" :items="['ทั้งหมด', ...entriesAvailableSources]" label="Source" variant="outlined"
            density="compact" hide-details />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="entriesFilterCat" :items="['ทั้งหมด', ...entriesAvailableCategories]" label="Category" variant="outlined"
            density="compact" hide-details />
        </v-col>
        <v-spacer />
        <v-col cols="auto">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" :disabled="flatItems.length === 0"
            @click="downloadJson">JSON</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <v-alert v-if="entriesFetchError" type="error" class="mb-4" closable>{{ entriesFetchError }}</v-alert>

    <!-- Empty state -->
    <v-card v-if="!entriesLoading && resultEntries.length === 0" rounded="lg">
      <v-card-text class="text-center text-disabled py-10">ไม่มีผลลัพธ์วันที่ {{ selectedDate }}</v-card-text>
    </v-card>

    <!-- Tabs by round -->
    <template v-else-if="rounds.length > 0">
      <v-tabs v-model="selectedRound" color="primary" show-arrows class="mb-3">
        <v-tab v-for="(round, ri) in rounds" :key="round.roundId" :value="round.roundId">
          <div class="d-flex flex-column align-start" style="line-height: 1.3">
            <span class="text-caption font-weight-medium">รอบที่ {{ rounds.length - ri }}</span>
            <span class="text-caption text-disabled">{{ formatTime(round.timestamp) }}<span v-if="round.query"> · {{
              round.query }}</span></span>
          </div>
        </v-tab>
      </v-tabs>

      <v-window v-model="selectedRound">
        <v-window-item v-for="round in rounds" :key="round.roundId" :value="round.roundId" eager>
          <template v-for="(catGroup, ci) in round.byCategory" :key="ci">
            <!-- Category section header -->
            <div class="d-flex align-center ga-2 px-1 pt-4 pb-2">
              <v-chip size="small" label color="primary" variant="tonal">{{ catLabel(catGroup.categoryId) }}</v-chip>
              <span class="text-caption text-medium-emphasis">{{catGroup.entries.flatMap((e: any) => e.items).length}}
                items</span>
            </div>

            <!-- Entry cards -->
            <v-card v-for="(group, gi) in catGroup.entries" :key="gi" rounded="lg" class="mb-3">
              <v-card-title class="d-flex align-center ga-1 pa-3 pb-0 flex-wrap">
                <v-chip size="x-small" label>{{ group.source }}</v-chip>
                <v-chip v-if="group.searchQuery" size="x-small" color="primary" variant="tonal" label
                  prepend-icon="mdi-magnify">{{ group.searchQuery }}</v-chip>
                <v-spacer />
                <span class="text-caption text-disabled font-weight-regular">{{ formatTime(group.timestamp) }}</span>
                <v-btn v-if="group.screenshotFile" icon="mdi-text-box-search-outline" size="x-small" variant="text"
                  :title="'ดู log'" @click.stop="viewLog(group)" />
                <v-btn icon="mdi-open-in-new" size="x-small" variant="text" :href="group.url" target="_blank" />
              </v-card-title>

              <v-divider class="mt-2" />

              <div class="d-flex">
                <div v-if="group.screenshotFile" class="pa-3 flex-shrink-0">
                  <ScreenshotImg :src="`/api/screenshot?file=${group.screenshotFile}`" thumbnail width="160"
                    height="90" />
                </div>
                <div class="flex-grow-1 overflow-x-auto">
                  <v-table density="compact" class="text-body-2">
                    <thead>
                      <tr>
                        <th v-for="col in getColumns(group.items, group.categoryId)" :key="col">{{ col }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(item, ii) in group.items" :key="ii">
                        <td v-for="col in getColumns(group.items, group.categoryId)" :key="col">
                          <template v-if="col === 'price'">
                            <span class="font-weight-medium">{{ item[col] != null ?
                              Number(item[col]).toLocaleString('en-US',
                                { maximumFractionDigits: 0 }) : '-' }}</span>
                          </template>
                          <template v-else-if="col === 'condition'">
                            <v-chip v-if="item[col]" size="x-small" :color="conditionColor(item[col])"
                              variant="tonal">{{
                                item[col] }}</v-chip>
                            <span v-else class="text-disabled">-</span>
                          </template>
                          <template v-else>
                            <span>{{ item[col] ?? '-' }}</span>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
              </div>

              <v-card-text v-if="group.items.length === 0" class="text-disabled text-center py-4">ไม่มี
                item</v-card-text>
            </v-card>
          </template>
        </v-window-item>
      </v-window>
    </template>

  </v-container>
</template>

<script setup lang="ts">
import { useLogsEntriesStore } from '~/stores/logsEntries'
import { useCategoryFields } from '../composables/useCategoryFields'

const store = useLogsEntriesStore()
const route = useRoute()
const router = useRouter()

const { CATEGORY_NAMES } = store
const {
  selectedDate, dateMenu, formattedDate,
  entriesLoading, entriesFetchError, resultEntries,
  entriesSearch, entriesFilterSrc, entriesFilterCat, selectedRound,
  entriesAvailableSources, entriesAvailableCategories,
  filteredGroups, rounds, flatItems,
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
    store.fetchResultEntries()
  },
})

watch(rounds, (newRounds) => {
  const targetRound = typeof route.query.round === 'string' ? route.query.round : null
  if (newRounds.length > 0) {
    if (targetRound && newRounds.some(r => r.roundId === targetRound)) {
      selectedRound.value = targetRound
    } else if (!selectedRound.value || !newRounds.some(r => r.roundId === selectedRound.value)) {
      selectedRound.value = newRounds[0].roundId
    }
  }
}, { immediate: true })

function catLabel(id: string | null) {
  if (!id || id === '__none__') return 'ไม่ระบุหมวด'
  return CATEGORY_NAMES[id] ? `${CATEGORY_NAMES[id]} (${id})` : `หมวด ${id}`
}

const { getAllowedKeys, getFieldOrder } = useCategoryFields()

function getColumns(items: any[], categoryId?: string): string[] {
  if (!items.length) return []
  const allKeys = Object.keys(items[0])
  if (!categoryId) return allKeys
  const allowed = getAllowedKeys(categoryId)
  const order = getFieldOrder(categoryId)
  const filtered = allKeys.filter(k => allowed.has(k))
  return [...filtered].sort((a, b) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function conditionColor(c: string) {
  if (c === 'new') return 'success'
  if (c === 'used') return 'warning'
  return 'grey'
}

function viewLog(group: any) {
  const dateParam = selectedDate.value.replace(/-/g, '')
  router.push(`/logs?date=${dateParam}&file=${encodeURIComponent(group.screenshotFile)}`)
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(flatItems.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `results_${selectedDate.value}.json`
  a.click()
}

const initialRound = typeof route.query.round === 'string' ? route.query.round : null

onMounted(async () => {
  await store.fetchResultEntries()
  if (initialRound && rounds.value.some(r => r.roundId === initialRound)) {
    selectedRound.value = initialRound
  }
})
</script>
