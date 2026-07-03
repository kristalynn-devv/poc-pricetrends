<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-4">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Token Usage</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ค่าใช้จ่าย Gemini แยกรายวันและรายหมวด</p>
      </v-col>
      <v-col cols="auto">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/logs" size="small">Logs</v-btn>
      </v-col>
    </v-row>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <template v-if="!loading && days.length">
      <!-- Totals KPI -->
      <v-row class="mb-6" dense>
        <v-col cols="6" sm="3">
          <v-card rounded="lg" variant="tonal" color="primary">
            <v-card-text class="text-center pa-4">
              <div class="text-h5 font-weight-bold">{{ totals.requests.toLocaleString() }}</div>
              <div class="text-caption mt-1">requests ทั้งหมด</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card rounded="lg" variant="tonal" color="blue">
            <v-card-text class="text-center pa-4">
              <div class="text-h5 font-weight-bold">{{ (totals.inputTokens / 1000).toFixed(1) }}K</div>
              <div class="text-caption mt-1">input tokens รวม</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card rounded="lg" variant="tonal" color="indigo">
            <v-card-text class="text-center pa-4">
              <div class="text-h5 font-weight-bold">{{ (totals.outputTokens / 1000).toFixed(1) }}K</div>
              <div class="text-caption mt-1">output tokens รวม</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card rounded="lg" variant="tonal" color="deep-purple">
            <v-card-text class="text-center pa-4">
              <div class="text-h5 font-weight-bold">{{ formatCost(totals.costThb) }}</div>
              <div class="text-caption mt-1">ค่าใช้จ่ายรวม</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Daily table -->
      <v-card rounded="lg" class="mb-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2">รายวัน</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>วันที่</th>
              <th class="text-right">Requests</th>
              <th class="text-right">Input tokens</th>
              <th class="text-right">Output tokens</th>
              <th class="text-right">ประมาณค่าใช้จ่าย</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="day in [...days].reverse()" :key="day.date">
              <tr class="cursor-pointer" @click="toggleExpand(day.date)">
                <td class="font-weight-medium">{{ formatDate(day.date) }}</td>
                <td class="text-right">{{ day.totalRequests.toLocaleString() }}</td>
                <td class="text-right text-medium-emphasis">{{ day.totalInputTokens.toLocaleString() }}</td>
                <td class="text-right text-medium-emphasis">{{ day.totalOutputTokens.toLocaleString() }}</td>
                <td class="text-right font-weight-medium">{{ formatCost(day.estimatedCostThb) }}</td>
                <td class="text-right">
                  <v-icon size="small" :icon="expanded.has(day.date) ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
                </td>
              </tr>
              <!-- Category breakdown -->
              <tr v-if="expanded.has(day.date)" v-for="(stat, cat) in day.byCategory" :key="cat"
                class="bg-grey-lighten-3">
                <td class="pl-8 text-caption text-medium-emphasis">
                  <v-chip size="x-small" label>{{ CATEGORY_NAMES[cat] ?? cat }}</v-chip>
                </td>
                <td class="text-right text-caption">{{ stat.requests.toLocaleString() }}</td>
                <td class="text-right text-caption text-medium-emphasis">{{ stat.inputTokens.toLocaleString() }}</td>
                <td class="text-right text-caption text-medium-emphasis">{{ stat.outputTokens.toLocaleString() }}</td>
                <td class="text-right text-caption">{{ formatCost(stat.estimatedCostThb) }}</td>
                <td></td>
              </tr>
            </template>
          </tbody>
          <tfoot>
            <tr class="font-weight-bold">
              <td>รวมทั้งหมด</td>
              <td class="text-right">{{ totals.requests.toLocaleString() }}</td>
              <td class="text-right">{{ totals.inputTokens.toLocaleString() }}</td>
              <td class="text-right">{{ totals.outputTokens.toLocaleString() }}</td>
              <td class="text-right">{{ formatCost(totals.costThb) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </v-table>
        <v-card-text class="text-caption text-medium-emphasis pt-1">
          gemini-3.1-flash-lite · $0.25/$1.50 per 1M input/output tokens · ≈36 ฿/$
        </v-card-text>
      </v-card>

      <!-- By category totals -->
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4 pb-2">รวมตามหมวด</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>หมวด</th>
              <th class="text-right">Requests</th>
              <th class="text-right">Input tokens</th>
              <th class="text-right">Output tokens</th>
              <th class="text-right">ค่าใช้จ่าย</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(stat, cat) in categoryTotals" :key="cat">
              <td><v-chip size="x-small" label>{{ CATEGORY_NAMES[cat] ?? cat }}</v-chip></td>
              <td class="text-right">{{ stat.requests.toLocaleString() }}</td>
              <td class="text-right text-medium-emphasis">{{ stat.inputTokens.toLocaleString() }}</td>
              <td class="text-right text-medium-emphasis">{{ stat.outputTokens.toLocaleString() }}</td>
              <td class="text-right font-weight-medium">{{ formatCost(stat.costThb) }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <v-card v-else-if="!loading" rounded="lg">
      <v-card-text class="text-center text-disabled py-10">ยังไม่มีข้อมูล token</v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mt-4" />
  </v-container>
</template>

<script setup lang="ts">
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

interface CategoryStat {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostThb: number;
}

interface DayStats {
  date: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostThb: number;
  byCategory: Record<string, CategoryStat>;
}

const loading = ref(true);
const error = ref<string | null>(null);
const days = ref<DayStats[]>([]);
const expanded = ref(new Set<string>());

const apiBase = useRuntimeConfig().public.apiBase;

onMounted(async () => {
  try {
    const res = await fetch(`${apiBase}/api/logs/token-history`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    days.value = data.days ?? [];
    // auto-expand most recent day
    if (days.value.length) expanded.value.add(days.value[days.value.length - 1].date);
  } catch (e: any) {
    error.value = e?.message ?? 'โหลดข้อมูลล้มเหลว';
  } finally {
    loading.value = false;
  }
});

const totals = computed(() => days.value.reduce((acc, d) => ({
  requests: acc.requests + d.totalRequests,
  inputTokens: acc.inputTokens + d.totalInputTokens,
  outputTokens: acc.outputTokens + d.totalOutputTokens,
  costThb: acc.costThb + d.estimatedCostThb,
}), { requests: 0, inputTokens: 0, outputTokens: 0, costThb: 0 }));

const categoryTotals = computed(() => {
  const acc: Record<string, { requests: number; inputTokens: number; outputTokens: number; costThb: number; }> = {};
  for (const day of days.value) {
    for (const [cat, s] of Object.entries(day.byCategory)) {
      acc[cat] ??= { requests: 0, inputTokens: 0, outputTokens: 0, costThb: 0 };
      acc[cat].requests += s.requests;
      acc[cat].inputTokens += s.inputTokens;
      acc[cat].outputTokens += s.outputTokens;
      acc[cat].costThb += s.estimatedCostThb;
    }
  }
  return Object.fromEntries(Object.entries(acc).sort((a, b) => b[1].costThb - a[1].costThb));
});

function toggleExpand(date: string) {
  if (expanded.value.has(date)) expanded.value.delete(date);
  else expanded.value.add(date);
  expanded.value = new Set(expanded.value);
}

function formatDate(d: string) {
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

function formatCost(thb: number) {
  if (thb === 0) return '-';
  return thb < 1 ? `${(thb * 100).toFixed(2)} สต.` : `${thb.toFixed(2)} ฿`;
}
</script>
