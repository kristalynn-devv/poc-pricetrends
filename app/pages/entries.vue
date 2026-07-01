<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-4">
      <v-col>
        <h1 class="text-h4 font-weight-bold">ผลลัพธ์รวม</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ข้อมูลสินค้าที่ดึงได้รายวัน</p>
      </v-col>
      <v-col cols="auto" class="d-flex ga-1">
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small" class="text-none">System
          Logs</v-btn>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" size="small" class="text-none">หน้าหลัก</v-btn>
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
            @click="downloadJson(flatItems, `results_${selectedDate}.json`)">
            JSON
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <v-progress-linear v-if="entriesLoading" indeterminate color="primary" class="mb-4" rounded />

    <v-alert
      v-if="entriesFetchError"
      :text="entriesFetchError"
      type="error"
      class="mb-4"
      closable
      @click:close="entriesFetchError = null"
    />

    <!-- Empty state -->
    <v-card v-if="!entriesLoading && resultEntries.length === 0" rounded="lg">
      <v-card-text class="text-center text-disabled py-10">
        <v-icon size="48" class="mb-2">mdi-database-off-outline</v-icon>
        <div>ไม่มีผลลัพธ์วันที่ {{ selectedDate }}</div>
      </v-card-text>
    </v-card>

    <!-- Results -->
    <template v-else-if="rounds.length > 0">
      <v-card rounded="lg" class="mb-4">
        <v-tabs v-model="selectedRound" color="primary" show-arrows slider-color="primary">
          <v-tab v-for="round in rounds" :key="round.roundId" :value="round.roundId" class="text-none">
            <div class="d-flex flex-column align-start py-1">
              <span class="text-body-2 font-weight-medium">{{ round.categoryLabel }}</span>
              <span class="text-caption text-medium-emphasis">
                รอบที่ {{ round.roundNumberInCategory }}
              </span>
            </div>
          </v-tab>
        </v-tabs>

        <v-divider />

        <v-window v-model="selectedRound">
          <v-window-item v-for="round in rounds" :key="round.roundId" :value="round.roundId">
            <v-card-text class="pa-4">
              <!-- Round summary -->
              <v-row dense class="mb-4">
                <v-col cols="6" sm="4">
                  <v-card rounded="lg" variant="tonal" color="primary">
                    <v-card-text class="text-center pa-3">
                      <div class="text-h5 font-weight-bold">{{ roundStats(round).items }}</div>
                      <div class="text-caption">รายการสินค้า</div>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="6" sm="4">
                  <v-card rounded="lg" variant="tonal" color="secondary">
                    <v-card-text class="text-center pa-3">
                      <div class="text-h5 font-weight-bold">{{ roundStats(round).sources }}</div>
                      <div class="text-caption">แหล่งข้อมูล</div>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="12" sm="4">
                  <v-card rounded="lg" variant="tonal" color="success">
                    <v-card-text class="text-center pa-3">
                      <div class="text-h5 font-weight-bold">{{ roundStats(round).categories }}</div>
                      <div class="text-caption">หมวดหมู่</div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Categories -->
              <v-expansion-panels v-model="openCategoryPanels" multiple variant="accordion">
                <v-expansion-panel v-for="catGroup in round.byCategory" :key="catGroup.categoryId" rounded="lg"
                  elevation="1">
                  <v-expansion-panel-title>
                    <v-icon class="me-2" size="small" color="primary">mdi-tag-multiple-outline</v-icon>
                    <span class="font-weight-medium">{{ catLabel(catGroup.categoryId) }}</span>
                    <v-spacer />
                    <div class="d-flex align-center ga-1 me-2" @click.stop>
                      <v-chip size="x-small" color="primary" variant="tonal">
                        {{catGroupEntries(catGroup).flatMap(e => e.items).length}} รายการ
                      </v-chip>
                      <v-chip size="x-small" variant="tonal">
                        {{ catGroupEntries(catGroup).length }} แหล่ง
                      </v-chip>
                      <v-chip v-if="catGroup.byQuery.length > 1" size="x-small" variant="tonal" color="secondary">
                        {{ catGroup.byQuery.length }} คำค้น
                      </v-chip>
                    </div>
                  </v-expansion-panel-title>

                  <v-expansion-panel-text>
                    <v-expansion-panels :model-value="openQueryPanelsFor(catGroup)" multiple variant="accordion"
                      @update:model-value="setOpenQueryPanels(catGroup, $event)">
                      <v-expansion-panel v-for="(queryGroup, qi) in catGroup.byQuery"
                        :key="queryGroup.query || `__none__${qi}`">
                        <v-expansion-panel-title class="px-4 py-2">
                          <v-icon class="me-2" size="small" color="primary">mdi-magnify</v-icon>
                          <span class="text-body-2 font-weight-medium">
                            {{ queryGroup.query || 'ไม่ระบุคำค้น' }}
                          </span>
                          <v-spacer />
                          <div class="d-flex align-center ga-1" @click.stop>
                            <v-chip size="x-small" variant="tonal">
                              {{queryGroup.entries.flatMap(e => e.items).length}} รายการ
                            </v-chip>
                            <v-chip size="x-small" variant="tonal">
                              {{ queryGroup.entries.length }} แหล่ง
                            </v-chip>
                          </div>
                        </v-expansion-panel-title>

                        <v-expansion-panel-text>
                          <div class="d-flex flex-column ga-2">
                            <EntrySourceCard v-for="(group, gi) in queryGroup.entries"
                              :key="`${queryGroup.query}-${group.source}-${gi}`" :group="group" @view-log="viewLog" />
                          </div>
                        </v-expansion-panel-text>
                      </v-expansion-panel>
                    </v-expansion-panels>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-card-text>
          </v-window-item>
        </v-window>
      </v-card>
    </template>

    <LogDetailDialog />
  </v-container>
</template>

<script setup lang="ts">
import type { ResultEntry } from '#shared';

type QueryGroup = {
  query: string;
  entries: ResultEntry[];
};

type CatGroup = {
  categoryId: string;
  byQuery: QueryGroup[];
};

type Round = {
  roundId: string;
  timestamp: string;
  query: string;
  categoryKey: string;
  categoryLabel: string;
  roundNumberInCategory: number;
  byCategory: CatGroup[];
};

const store = useLogsEntriesStore();
const route = useRoute();
const { downloadJson } = useDownloadJson();

const { CATEGORY_NAMES } = store;
const {
  selectedDate, dateMenu, formattedDate,
  entriesLoading, entriesFetchError, resultEntries,
  entriesSearch, entriesFilterSrc, entriesFilterCat, selectedRound,
  entriesAvailableSources, entriesAvailableCategories,
  rounds, flatItems,
} = storeToRefs(store);

const initialDate = typeof route.query.date === 'string' ? route.query.date : null;
if (initialDate) selectedDate.value = initialDate;

const openCategoryPanels = ref<number[]>([]);
const openQueryPanels = ref<Record<string, number[]>>({});

function queryPanelsKey(catGroup: CatGroup) {
  const round = activeRound();
  return round ? `${round.roundId}:${catGroup.categoryId}` : catGroup.categoryId;
}

function openQueryPanelsFor(catGroup: CatGroup) {
  return openQueryPanels.value[queryPanelsKey(catGroup)] ?? [];
}

function setOpenQueryPanels(catGroup: CatGroup, val: number | number[]) {
  openQueryPanels.value[queryPanelsKey(catGroup)] = Array.isArray(val) ? val : [val];
}

function syncOpenQueryPanels() {
  const round = activeRound();
  if (!round) return;
  for (const cat of round.byCategory) {
    const key = `${round.roundId}:${cat.categoryId}`;
    const existing = openQueryPanels.value[key];
    if (!existing || existing.length !== cat.byQuery.length) {
      openQueryPanels.value[key] = cat.byQuery.map((_, i) => i);
    }
  }
}

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

function activeRound() {
  return rounds.value.find(r => r.roundId === selectedRound.value);
}

function syncOpenCategoryPanels() {
  const round = activeRound();
  openCategoryPanels.value = round ? round.byCategory.map((_, i) => i) : [];
}

function catGroupEntries(catGroup: CatGroup) {
  return catGroup.byQuery.flatMap(q => q.entries);
}

function roundStats(round: Round) {
  const entries = round.byCategory.flatMap(c => catGroupEntries(c));
  return {
    items: entries.flatMap(e => e.items).length,
    sources: entries.length,
    categories: round.byCategory.length,
  };
}

watch(rounds, (newRounds) => {
  const targetRound = typeof route.query.round === 'string' ? route.query.round : null;
  if (newRounds.length > 0 && targetRound && newRounds.some(r => r.roundId === targetRound)) {
    selectedRound.value = targetRound;
  }
});

watch([selectedRound, rounds], () => {
  syncOpenCategoryPanels();
  syncOpenQueryPanels();
}, { immediate: true });

function catLabel(id: string | null) {
  if (!id || id === '__none__') return 'ไม่ระบุหมวด';
  return CATEGORY_NAMES[id] ? `${CATEGORY_NAMES[id]} (${id})` : `หมวด ${id}`;
}

function viewLog(group: ResultEntry) {
  if (group.screenshotFile) store.openLogsDetailByScreenshot(group.screenshotFile);
}

const initialRound = typeof route.query.round === 'string' ? route.query.round : null;

onMounted(async () => {
  await store.fetchResultEntries();
  if (initialRound && rounds.value.some(r => r.roundId === initialRound)) {
    selectedRound.value = initialRound;
  }
});
</script>
