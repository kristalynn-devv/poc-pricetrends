<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-4">
      <v-col>
        <h1 class="text-h4 font-weight-bold">ผลลัพธ์รวม</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ข้อมูลสินค้าที่ดึงได้รายวัน</p>
      </v-col>
      <v-col cols="auto" class="d-flex gap-2">
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small">System Logs</v-btn>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" size="small">หน้าหลัก</v-btn>
      </v-col>
    </v-row>

    <!-- Controls -->
    <v-card rounded="lg" class="mb-4 pa-3">
      <v-row align="center" dense>
        <v-col cols="12" sm="auto">
          <v-text-field
            v-model="selectedDate"
            type="date"
            label="วันที่"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 180px"
            @change="fetchResults"
          />
        </v-col>
        <v-col cols="12" sm="3">
          <v-text-field
            v-model="search"
            label="ค้นหา brand / model / keyword"
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
        <v-col cols="auto">
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="fetchResults" size="small">รีเฟรช</v-btn>
        </v-col>
        <v-col cols="auto">
          <v-chip size="small" :color="flatItems.length !== allItems.length ? 'primary' : 'default'" variant="tonal">
            {{ flatItems.length }}<template v-if="flatItems.length !== allItems.length"> / {{ allItems.length }}</template> items
          </v-chip>
        </v-col>
        <v-spacer />
        <v-col cols="auto">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" :disabled="flatItems.length === 0" @click="downloadJson">JSON</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <v-alert v-if="fetchError" type="error" class="mb-4" closable>{{ fetchError }}</v-alert>

    <!-- Empty state -->
    <v-card v-if="!loading && resultEntries.length === 0" rounded="lg">
      <v-card-text class="text-center text-disabled py-10">ไม่มีผลลัพธ์วันที่ {{ selectedDate }}</v-card-text>
    </v-card>

    <!-- Results grouped by screenshot session -->
    <template v-else>
      <v-card v-for="(group, gi) in filteredGroups" :key="gi" rounded="lg" class="mb-4">
        <!-- Group header -->
        <v-card-title class="d-flex align-center gap-2 pa-3 pb-0 flex-wrap">
          <v-chip size="x-small" :color="sourceColor(group.source)" variant="tonal" label>{{ group.source }}</v-chip>
          <v-chip v-if="group.categoryId" size="x-small" variant="tonal" label>{{ group.categoryId }}</v-chip>
          <span class="text-body-2 text-truncate flex-grow-1" style="max-width:500px">{{ group.url }}</span>
          <v-spacer />
          <span class="text-caption text-disabled font-weight-regular">{{ formatTime(group.timestamp) }}</span>
          <v-btn icon="mdi-open-in-new" size="x-small" variant="text" :href="group.url" target="_blank" />
        </v-card-title>

        <v-divider class="mt-2" />

        <div class="d-flex">
          <!-- Screenshot thumbnail -->
          <div v-if="group.screenshotFile" class="pa-3 flex-shrink-0">
            <v-img
              :src="`/api/screenshots/${group.screenshotFile}`"
              width="160"
              height="90"
              cover
              rounded="lg"
              class="cursor-pointer"
              @click="previewImg = `/api/screenshots/${group.screenshotFile}`"
            >
              <template #error>
                <div class="d-flex align-center justify-center h-100 bg-grey-lighten-3 rounded-lg">
                  <v-icon color="grey">mdi-image-broken</v-icon>
                </div>
              </template>
            </v-img>
          </div>

          <!-- Items table -->
          <div class="flex-grow-1 overflow-x-auto">
            <v-table density="compact" class="text-body-2">
              <thead>
                <tr>
                  <th v-for="col in getColumns(group.items)" :key="col">{{ col }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, ii) in group.items" :key="ii">
                  <td v-for="col in getColumns(group.items)" :key="col">
                    <template v-if="col === 'price'">
                      <span class="font-weight-medium">{{ item[col] != null ? Number(item[col]).toLocaleString() : '—' }}</span>
                    </template>
                    <template v-else-if="col === 'condition'">
                      <v-chip v-if="item[col]" size="x-small" :color="conditionColor(item[col])" variant="tonal">{{ item[col] }}</v-chip>
                      <span v-else class="text-disabled">—</span>
                    </template>
                    <template v-else>
                      <span>{{ item[col] ?? '—' }}</span>
                    </template>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </div>

        <v-card-text v-if="group.items.length === 0" class="text-disabled text-center py-4">ไม่มี item</v-card-text>
      </v-card>
    </template>

    <!-- Image preview dialog -->
    <v-dialog v-model="previewOpen" max-width="1200">
      <v-card rounded="lg" class="pa-2">
        <v-img :src="previewImg" max-height="85vh" contain />
        <v-card-actions class="justify-end pt-1">
          <v-btn variant="text" @click="previewOpen = false">ปิด</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
const today = new Date().toISOString().slice(0, 10)
const selectedDate = ref(today)
const loading = ref(false)
const fetchError = ref<string | null>(null)
const resultEntries = ref<any[]>([])

const search = ref('')
const filterSrc = ref('ทั้งหมด')
const filterCat = ref('ทั้งหมด')

const previewImg = ref('')
const previewOpen = computed({
  get: () => !!previewImg.value,
  set: (v) => { if (!v) previewImg.value = '' },
})

const availableSources = computed(() => [...new Set(resultEntries.value.map((e) => e.source).filter(Boolean))])
const availableCategories = computed(() => [...new Set(resultEntries.value.map((e) => e.categoryId).filter(Boolean))])

const allItems = computed(() => resultEntries.value.flatMap((e) => e.items))

const filteredGroups = computed(() => {
  return resultEntries.value
    .filter((e) => {
      if (filterSrc.value !== 'ทั้งหมด' && e.source !== filterSrc.value) return false
      if (filterCat.value !== 'ทั้งหมด' && e.categoryId !== filterCat.value) return false
      return true
    })
    .map((e) => {
      if (!search.value) return e
      const q = search.value.toLowerCase()
      const filteredItems = e.items.filter((item: any) =>
        Object.values(item).some((v) => String(v ?? '').toLowerCase().includes(q))
      )
      return filteredItems.length > 0 ? { ...e, items: filteredItems } : null
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
})

const flatItems = computed(() => filteredGroups.value.flatMap((g: any) => g.items))

function getColumns(items: any[]): string[] {
  if (!items.length) return []
  return Object.keys(items[0])
}

async function fetchResults() {
  loading.value = true
  fetchError.value = null
  const dateParam = selectedDate.value.replace(/-/g, '')
  try {
    const data = await $fetch<any>(`/api/results/entries?date=${dateParam}`)
    resultEntries.value = data.entries ?? []
  } catch (err: any) {
    fetchError.value = err?.message ?? 'โหลดข้อมูลล้มเหลว'
    resultEntries.value = []
  } finally {
    loading.value = false
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function sourceColor(source: string) {
  if (source === 'chrono24') return 'blue'
  if (source === 'auctionhouse') return 'purple'
  return 'grey'
}

function conditionColor(c: string) {
  if (c === 'new') return 'success'
  if (c === 'used') return 'warning'
  return 'grey'
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(flatItems.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `results_${selectedDate.value}.json`
  a.click()
}

onMounted(fetchResults)
</script>
