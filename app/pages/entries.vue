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
          <v-select v-model="entriesFilterSrc" :items="['ทั้งหมด', ...entriesAvailableSources]" label="Source"
            variant="outlined" density="compact" hide-details />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="entriesFilterCat" :items="['ทั้งหมด', ...entriesAvailableCategories]" label="Category"
            variant="outlined" density="compact" hide-details />
        </v-col>
        <v-spacer />
        <v-col cols="auto">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" :disabled="flatItems.length === 0"
            @click="downloadJson(flatItems, `results_${selectedDate}.json`)">JSON</v-btn>
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
        <v-window-item v-for="round in rounds" :key="round.roundId" :value="round.roundId">
          <v-expansion-panels variant="accordion" multiple rounded="lg">
            <v-expansion-panel v-for="(catGroup, ci) in round.byCategory" :key="ci">
              <v-expansion-panel-title>
                <v-chip size="small" label color="primary" variant="tonal" class="me-2">
                  {{ catLabel(catGroup.categoryId) }}
                </v-chip>
                <span class="text-caption text-medium-emphasis d-flex ga-2">
                  <v-chip size="x-small" label>{{catGroup.entries.flatMap((e: any) => e.items).length}} รายการ</v-chip>
                  <v-chip size="x-small" label>{{ catGroup.entries.length }} แหล่ง</v-chip>
                </span>
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pa-3 pt-0">
                <v-card v-for="(group, gi) in catGroup.entries" :key="gi" rounded="lg" class="mb-3 entry-source-card">
                  <v-card-title class="d-flex align-center ga-2 pa-3 flex-wrap">
                    <v-chip size="small" label>{{ group.source }}</v-chip>
                    <v-chip v-if="group.searchQuery" size="x-small" color="primary" variant="tonal" label
                      prepend-icon="mdi-magnify">
                      {{ group.searchQuery }}
                    </v-chip>
                    <v-spacer />
                    <span class="text-caption text-disabled">{{ formatTime(group.timestamp) }}</span>
                    <v-btn v-if="group.screenshotFile" icon="mdi-text-box-search-outline" size="x-small" variant="text"
                      title="ดู log" @click.stop="viewLog(group)" />
                    <v-btn icon="mdi-open-in-new" size="x-small" variant="text" :href="group.url" target="_blank"
                      title="เปิดลิงก์ต้นทาง" />
                  </v-card-title>

                  <v-divider />

                  <v-card-text v-if="group.items.length === 0" class="text-disabled text-center py-6">
                    ไม่มีรายการสินค้า
                  </v-card-text>

                  <div v-else class="entry-source-body">
                    <div v-if="group.screenshotFile" class="entry-screenshot pa-3">
                      <ScreenshotImg :src="screenshotSrc(group.screenshotFile)" thumbnail width="180" height="101" />
                    </div>
                    <v-data-table :headers="tableHeaders(group.items, group.categoryId)" :items="group.items"
                      density="compact" class="text-body-2 entry-items-table" hide-default-footer :items-per-page="-1">
                      <template #[`item.price`]="{ value }">
                        <span class="font-weight-medium tabular-nums">
                          {{ formatPrice(value) }}
                        </span>
                      </template>
                      <template #[`item.condition`]="{ value }">
                        <v-chip v-if="value" size="x-small" :color="conditionColor(String(value))" variant="tonal">
                          {{ value }}
                        </v-chip>
                        <span v-else class="text-disabled">-</span>
                      </template>
                      <template #[`item.currency`]="{ value }">
                        <span>{{ value ?? '-' }}</span>
                      </template>
                      <template v-for="col in textColumns(group.categoryId)" :key="col" #[`item.${col}`]="{ value }">
                        <span>{{ value ?? '-' }}</span>
                      </template>
                    </v-data-table>
                  </div>
                </v-card>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-window-item>
      </v-window>
    </template>

    <LogDetailDialog />
  </v-container>
</template>

<script setup lang="ts">

const store = useLogsEntriesStore();
const route = useRoute();
const { downloadJson } = useDownloadJson();
const { screenshotUrl } = useApi();

function screenshotSrc(file: string) {
  return screenshotUrl(file);
}

const { CATEGORY_NAMES } = store;
const {
  selectedDate, dateMenu, formattedDate,
  entriesLoading, entriesFetchError, resultEntries,
  entriesSearch, entriesFilterSrc, entriesFilterCat, selectedRound,
  entriesAvailableSources, entriesAvailableCategories,
  filteredGroups, rounds, flatItems,
} = storeToRefs(store);

const initialDate = typeof route.query.date === 'string' ? route.query.date : null;
if (initialDate) selectedDate.value = initialDate;

const datePickerDate = computed({
  get: () => new Date(selectedDate.value + 'T00:00:00'),
  set: (val: Date) => {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    selectedDate.value = `${y}-${m}-${d}`;
    dateMenu.value = false;
    store.fetchResultEntries();
  },
});

watch(rounds, (newRounds) => {
  const targetRound = typeof route.query.round === 'string' ? route.query.round : null;
  if (newRounds.length > 0 && targetRound && newRounds.some((r: any) => r.roundId === targetRound)) {
    selectedRound.value = targetRound;
  }
});

function catLabel(id: string | null) {
  if (!id || id === '__none__') return 'ไม่ระบุหมวด';
  return CATEGORY_NAMES[id] ? `${CATEGORY_NAMES[id]} (${id})` : `หมวด ${id}`;
}

const { getAllowedKeys, getFieldOrder, getFields, COMMON_FIELDS } = useCategoryFields();

function getColumnKeys(items: any[], categoryId?: string): string[] {
  if (!items.length) return [];
  const allKeys = Object.keys(items[0]);
  if (!categoryId) return allKeys;
  const allowed = getAllowedKeys(categoryId);
  const order = getFieldOrder(categoryId);
  const filtered = allKeys.filter(k => allowed.has(k));
  return [...filtered].sort((a, b) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function colLabel(key: string, categoryId?: string): string {
  if (!categoryId) return key;
  const { required, optional } = getFields(categoryId);
  const field = [...required, ...COMMON_FIELDS, ...optional].find(f => f.key === key);
  return field?.label ?? key;
}

function tableHeaders(items: any[], categoryId?: string) {
  return getColumnKeys(items, categoryId).map(key => ({
    title: colLabel(key, categoryId),
    key,
    sortable: false,
    align: key === 'price' ? 'end' as const : 'start' as const,
    minWidth: key === 'price' ? '100px' : undefined,
  }));
}

/** Plain text columns — price/condition/currency use dedicated slots */
function textColumns(categoryId?: string): string[] {
  if (!categoryId) return [];
  const skip = new Set(['price', 'currency', 'condition']);
  const { required, optional } = getFields(categoryId);
  return [...required, ...COMMON_FIELDS, ...optional]
    .map(f => f.key)
    .filter(k => !skip.has(k));
}

function formatPrice(price: unknown) {
  if (price == null) return '-';
  return Number(price).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function conditionColor(c: string) {
  if (c === 'new') return 'success';
  if (c === 'used') return 'warning';
  return 'grey';
}

function viewLog(group: { screenshotFile: string; }) {
  store.openLogsDetailByScreenshot(group.screenshotFile);
}


const initialRound = typeof route.query.round === 'string' ? route.query.round : null;

onMounted(async () => {
  await store.fetchResultEntries();
  if (initialRound && rounds.value.some(r => r.roundId === initialRound)) {
    selectedRound.value = initialRound;
  }
});
</script>

<style scoped>
.entry-source-card:last-child {
  margin-bottom: 0 !important;
}

.entry-source-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
}

.entry-screenshot {
  flex: 0 0 auto;
}

.entry-items-table {
  flex: 1 1 280px;
  min-width: 0;
}

.entry-items-table :deep(thead th) {
  background: rgba(var(--v-theme-on-surface), 0.04);
  font-weight: 600;
  white-space: nowrap;
}

.entry-items-table :deep(tbody tr:nth-child(even)) {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
