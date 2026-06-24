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
          <v-text-field v-model="selectedDate" type="date" label="วันที่" variant="outlined" density="compact"
            hide-details style="min-width: 180px" @change="fetchResults" clearable />
        </v-col>
        <v-col cols="12" sm="3">
          <v-text-field v-model="search" label="ค้นหา brand / model / keyword" prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details clearable />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="filterSrc" :items="['ทั้งหมด', ...availableSources]" label="Source" variant="outlined"
            density="compact" hide-details />
        </v-col>
        <v-col cols="6" sm="2">
          <v-select v-model="filterCat" :items="['ทั้งหมด', ...availableCategories]" label="Category" variant="outlined"
            density="compact" hide-details />
        </v-col>
        <v-col cols="auto">
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" height="40"
            @click="fetchResults">รีเฟรช</v-btn>
        </v-col>
        <v-spacer />
        <v-col cols="auto">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-download" :disabled="flatItems.length === 0"
            @click="downloadJson">JSON</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <v-alert v-if="fetchError" type="error" class="mb-4" closable>{{ fetchError }}</v-alert>

    <!-- Empty state -->
    <v-card v-if="!loading && resultEntries.length === 0" rounded="lg">
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
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useCategoryFields } from '../composables/useCategoryFields';

const route = useRoute();

const CATEGORY_NAMES: Record<string, string> = {
  '103': 'นาฬิกา',
  '106': 'พระ / วัตถุมงคล',
  '107': 'IT / โน้ตบุ๊ก',
  '108': 'แบรนด์เนม',
  '109': 'สมาร์ทโฟน',
  '110': 'แว่นตา',
  '111': 'เครื่องมือช่าง',
  '112': 'อุปกรณ์ไอที',
};

function catLabel(id: string | null) {
  if (!id || id === '__none__') return 'ไม่ระบุหมวด';
  return CATEGORY_NAMES[id] ? `${CATEGORY_NAMES[id]} (${id})` : `หมวด ${id}`;
}

const today = new Date().toISOString().slice(0, 10);
const initialDate = typeof route.query.date === 'string' ? route.query.date : today;
const selectedDate = ref(initialDate);
const loading = ref(false);
const fetchError = ref<string | null>(null);
const resultEntries = ref<any[]>([]);

const search = ref('');
const filterSrc = ref('ทั้งหมด');
const filterCat = ref('ทั้งหมด');
const selectedRound = ref<string | null>(null);

const availableSources = computed(() => [...new Set(resultEntries.value.map((e) => e.source).filter(Boolean))]);
const availableCategories = computed(() => [...new Set(resultEntries.value.map((e) => e.categoryId).filter(Boolean))]);

const filteredGroups = computed(() => {
  return resultEntries.value
    .filter((e) => {
      if (filterSrc.value !== 'ทั้งหมด' && e.source !== filterSrc.value) return false;
      if (filterCat.value !== 'ทั้งหมด' && e.categoryId !== filterCat.value) return false;
      return true;
    })
    .map((e) => {
      if (!search.value) return e;
      const q = search.value.toLowerCase();
      const filteredItems = e.items.filter((item: any) =>
        Object.values(item).some((v) => String(v ?? '').toLowerCase().includes(q))
      );
      return filteredItems.length > 0 ? { ...e, items: filteredItems } : null;
    })
    .filter(Boolean);
});

const rounds = computed(() => {
  const map = new Map<string, any[]>();
  for (const e of filteredGroups.value) {
    const key = (e as any).roundId ?? '__legacy__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  return [...map.entries()]
    .map(([roundId, entries]) => {
      entries.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const timestamp = entries[0].timestamp;
      const query = entries.find((e: any) => e.searchQuery)?.searchQuery ?? '';

      const catMap = new Map<string, any[]>();
      for (const e of entries) {
        const cat = e.categoryId ?? '__none__';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat)!.push(e);
      }
      const byCategory = [...catMap.entries()].map(([categoryId, catEntries]) => ({ categoryId, entries: catEntries }));

      return { roundId, timestamp, query, byCategory };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
});

watch(rounds, (newRounds) => {
  const targetRound = typeof route.query.round === 'string' ? route.query.round : null;
  if (newRounds.length > 0) {
    if (targetRound && newRounds.some((r) => r.roundId === targetRound)) {
      selectedRound.value = targetRound;
    } else if (!selectedRound.value || !newRounds.some((r) => r.roundId === selectedRound.value)) {
      selectedRound.value = newRounds[0].roundId;
    }
  }
}, { immediate: true });

const flatItems = computed(() => filteredGroups.value.flatMap((g: any) => g.items));

const { getAllowedKeys, getFieldOrder } = useCategoryFields();

function getColumns(items: any[], categoryId?: string): string[] {
  if (!items.length) return [];
  const allKeys = Object.keys(items[0]);
  if (!categoryId) return allKeys;
  const allowed = getAllowedKeys(categoryId);
  const order = getFieldOrder(categoryId);
  const filtered = allKeys.filter((k) => allowed.has(k));
  return [...filtered].sort((a, b) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

async function fetchResults() {
  loading.value = true;
  fetchError.value = null;
  const dateParam = selectedDate.value.replace(/-/g, '');
  try {
    const res = await fetch(`/api/results/entries?date=${dateParam}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    resultEntries.value = data.entries ?? [];
  } catch (err: any) {
    fetchError.value = err?.message ?? 'โหลดข้อมูลล้มเหลว';
    resultEntries.value = [];
  } finally {
    loading.value = false;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function conditionColor(c: string) {
  if (c === 'new') return 'success';
  if (c === 'used') return 'warning';
  return 'grey';
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(flatItems.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `results_${selectedDate.value}.json`;
  a.click();
}

onMounted(fetchResults);
</script>
