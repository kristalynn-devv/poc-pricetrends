<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-6">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Price Extractor</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ค้นหาราคาสินค้าแยกตามหมวด</p>
      </v-col>
      <v-col cols="auto" class="d-flex align-center ga-1">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small"
          class="text-none">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small" class="text-none">System
          Logs</v-btn>
        <v-btn icon="mdi-tune" size="small" variant="text" @click="screenshotCfgOpen = true" />
      </v-col>
    </v-row>

    <!-- ── Category group expansion panels ── -->
    <v-expansion-panels v-model="openPanels" multiple variant="accordion" class="mb-4">
      <v-expansion-panel v-for="grp in categoryGroups" :key="grp.label" rounded="lg">
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small">mdi-tag-multiple-outline</v-icon>
          <span>{{ grp.label }}</span>
          <span class="text-caption text-medium-emphasis ml-2">หมวด {{ grp.ids.join(', ') }}</span>
          <v-spacer />
          <div class="d-flex align-center ga-1 me-2" @click.stop>
            <span class="text-caption text-medium-emphasis">{{grp.sources.filter(s => s.apiRoute).length}}/{{
              grp.sources.length }} แหล่งพร้อมใช้</span>
            <template v-if="Object.values(grp.runs).some(r => r.done)">
              <v-chip size="x-small" color="primary" variant="tonal">
                {{Object.values(grp.runs).reduce((n, r) => n + r.results.flatMap(res => res.items).length, 0)}} รายการ
              </v-chip>
              <v-btn v-if="grp.lastRoundId" size="x-small" variant="tonal" color="success"
                prepend-icon="mdi-open-in-new"
                :to="`/entries?round=${grp.lastRoundId}&date=${new Date().toISOString().slice(0, 10)}`" @click.stop>
                ดูผลลัพธ์
              </v-btn>
            </template>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text class="pa-0">
          <!-- Query list + limit -->
          <v-card-text class="pb-2">
            <!-- Required fields row -->
            <div class="d-flex align-center ga-2 mb-2">
              <v-text-field v-for="field in grp.requiredFields" :key="field.key" v-model="grp.fieldValues[field.key]"
                :label="field.label" variant="outlined" density="compact" hide-details :disabled="grp.running"
                style="flex:1; min-width:0" @keyup.enter="addQuery(grp)" clearable />
              <v-btn color="secondary" variant="tonal" size="small" class="text-none" height="40"
                :disabled="grp.requiredFields.every(f => !grp.fieldValues[f.key]?.trim()) || grp.running"
                prepend-icon="mdi-plus" @click.stop="addQuery(grp)">
                เพิ่มรายการ
              </v-btn>
            </div>

            <!-- Active optional fields -->
            <v-row v-if="grp.activeOptionals.length > 0" dense align="center" class="mb-1">
              <v-col v-for="key in grp.activeOptionals" :key="key" cols="6" md="3">
                <v-text-field v-model="grp.fieldValues[key]"
                  :label="grp.optionalFields.find(f => f.key === key)?.label ?? key" variant="outlined"
                  density="compact" hide-details :disabled="grp.running" @keyup.enter="addQuery(grp)" clearable>
                  <template #append-inner>
                    <v-icon size="x-small" class="cursor-pointer"
                      @click.stop="removeOptionalField(grp, key)">mdi-close</v-icon>
                  </template>
                </v-text-field>
              </v-col>
            </v-row>

            <!-- Optional field chips (suggestions) -->
            <div v-if="grp.optionalFields.some(f => !grp.activeOptionals.includes(f.key))"
              class="d-flex flex-wrap ga-1 mb-2" @click.stop> <v-chip
                v-for="field in grp.optionalFields.filter(f => !grp.activeOptionals.includes(f.key))" :key="field.key"
                size="small" variant="outlined" color="primary" :disabled="grp.running" prepend-icon="mdi-plus"
                @click.stop="addOptionalField(grp, field.key)">
                {{ field.label }}
              </v-chip>
            </div>

            <!-- Run button row -->
            <v-row dense align="center" class="mb-2">
              <v-col>
                <div v-if="grp.queries.length > 0" class="d-flex flex-wrap ga-1" @click.stop>
                  <v-chip v-for="(q, qi) in grp.queries" :key="q" :model-value="true" size="small" closable
                    :disabled="grp.running" @click:close="grp.queries.splice(qi, 1)">
                    {{ q }}
                  </v-chip>
                </div>
                <p v-else class="text-caption text-medium-emphasis mb-0">ยังไม่มีรายการค้นหา - กรอกข้อมูลแล้วกด
                  "เพิ่มรายการ"</p>
              </v-col>
              <v-col cols="auto" class="d-flex align-center ga-2">
                <v-btn color="primary" :loading="grp.running" height="40"
                  :disabled="grp.queries.length === 0 || !grp.sources.some(s => s.apiRoute && grp.enabled[s.name])"
                  prepend-icon="mdi-play" @click="runGroup(grp)">
                  ค้นหา
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>

          <!-- Source list -->
          <v-divider />
          <div class="d-flex align-center px-4 py-1 ga-1">
            <span class="text-caption text-medium-emphasis flex-grow-1">แหล่งค้นหา</span>
            <v-btn size="x-small" variant="text" class="text-none" :disabled="grp.running"
              @click.stop="toggleAllSources(grp)">
              {{grp.sources.every(s => !s.apiRoute || grp.enabled[s.name]) ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}}
            </v-btn>
          </div>
          <v-divider />
          <v-list>
            <template v-for="(src, si) in grp.sources" :key="src.name">
              <v-divider v-if="si > 0" />
              <v-list-item class="">
                <template #prepend>
                  <div class="d-flex align-center ga-1 me-2">
                    <span class="text-caption text-medium-emphasis">{{ si + 1 }}.</span>
                    <v-checkbox-btn v-if="src.apiRoute" v-model="grp.enabled[src.name]" :disabled="grp.running"
                      density="compact" hide-details />
                  </div>
                </template>

                <v-list-item-title class="text-body-2 font-weight-regular d-flex align-center ga-1">
                  <span>{{ src.name }}</span>
                  <v-chip v-if="src.apiRoute" size="x-small" color="success" variant="tonal">Ready</v-chip>
                  <v-chip v-else size="x-small" color="grey" variant="tonal">Not Ready</v-chip>
                  <v-progress-circular v-if="grp.runs[src.name]?.loading" indeterminate size="14" width="2" />
                  <v-chip v-else-if="srcExtracted(grp, src.name).length > 0" size="x-small" color="primary"
                    variant="tonal">
                    {{ srcExtracted(grp, src.name).length }} รายการ
                  </v-chip>
                  <v-chip v-else-if="grp.runs[src.name]?.error" size="x-small" color="error"
                    variant="tonal">error</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ src.url }}</v-list-item-subtitle>

                <template #append>
                  <v-btn v-if="grp.runs[src.name]" size="small" variant="tonal" prepend-icon="mdi-console"
                    @click.stop="openDetail(grp, src.name)">
                    ดูรายละเอียด
                  </v-btn>
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- ── Config Dialog ── -->
    <v-dialog v-model="screenshotCfgOpen" max-width="400">
      <v-card>
        <v-card-title class="d-flex align-center ga-1 pt-4 px-4">
          <v-icon size="small">mdi-tune</v-icon>
          <span class="">การตั้งค่า</span>
          <v-spacer />
          <v-btn icon="mdi-close" size="small" variant="text" @click="screenshotCfgOpen = false" />
        </v-card-title>
        <v-card-text class="px-4 pb-2">
          <v-form @submit.prevent="screenshotCfgOpen = false">
            <v-row dense class="mb-2">
              <v-col cols="5">
                <v-text-field v-model.number="screenshotCfg.viewportWidth" label="Width (px)" type="number"
                  variant="outlined" density="compact" hide-details clearable />
              </v-col>
              <v-col cols="2" class="d-flex align-center justify-center">
                <span class="text-body-2 text-medium-emphasis">×</span>
              </v-col>
              <v-col cols="5">
                <v-text-field v-model.number="screenshotCfg.viewportHeight" label="Height (px)" type="number"
                  variant="outlined" density="compact" hide-details :disabled="screenshotCfg.fullPage" clearable />
              </v-col>
            </v-row>
            <v-row dense align="center" class="mb-2">
              <v-col cols="6">
                <v-text-field v-model.number="screenshotCfg.quality" label="Quality (1–100)" type="number"
                  variant="outlined" density="compact" hide-details clearable />
              </v-col>
              <v-col cols="6" class="d-flex justify-end">
                <v-switch v-model="screenshotCfg.fullPage" label="เต็มจอ" density="compact" hide-details
                  color="primary" />
              </v-col>
            </v-row>
            <v-row dense class="mb-2">
              <v-col cols="7">
                <v-text-field v-model.number="screenshotCfg.cropHeight" label="Crop height (px)" type="number"
                  variant="outlined" density="compact" hide-details clearable placeholder="ไม่ตัด" />
              </v-col>
            </v-row>
            <v-divider class="mb-3" />
            <v-row dense>
              <v-col cols="6">
                <v-combobox v-model="screenshotCfg.limit" :items="[1, 3, 5, 10]" label="จำนวนชิ้น/แหล่ง/คำค้น"
                  variant="outlined" density="compact" hide-details :return-object="false" type="number" />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" size="small" class="text-none" @click="resetScreenshotCfg">Reset</v-btn>
          <v-spacer />
          <v-btn color="primary" size="small" class="text-none" @click="screenshotCfgOpen = false">ตกลง</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
          <v-btn v-if="detailExtracted.length > 0" size="small" variant="tonal" prepend-icon="mdi-download" class="mr-2"
            @click="downloadJson(detailExtracted.map(({ _screenshot: _s, ...r }) => r))">JSON</v-btn>
        </v-toolbar>

        <v-container fluid class="pa-4"
          style="height: calc(100vh - 48px); display:flex; flex-direction:column; gap:16px; overflow:auto">
          <!-- Terminal -->
          <template v-if="detailRun.logs.length > 0 || detailRun.loading">
            <div>
              <div class="d-flex align-center px-3 py-1 rounded-t" style="background:#1e1e1e">
                <v-icon color="green" size="x-small" class="mr-1">mdi-console</v-icon>
                <span class="text-caption" style="color:#ccc; font-family:monospace">terminal</span>
              </div>
              <div class="terminal-box rounded-b" ref="detailTermEl" style="height:320px">
                <div v-if="detailRun.loading && detailRun.logs.length === 0" style="color:#666">รอการตอบสนอง...</div>
                <div v-for="(line, li) in detailRun.logs" :key="li"
                  :style="{ color: logColor(line.level), lineHeight: '1.7' }">
                  <span style="color:#555">{{ formatLogTime(line.ts) }}</span>
                  <span :style="{ color: logLevelColor(line.level), marginLeft: '6px', marginRight: '6px' }">[{{
                    line.level.toUpperCase() }}]</span>
                  <span>{{ line.msg }}</span>
                  <span v-if="line.data" style="color:#666; margin-left:6px">{{ JSON.stringify(line.data) }}</span>
                </div>
                <div v-if="detailRun.loading" style="color:#4ec9b0">█</div>
              </div>
            </div>
          </template>

          <!-- Bot-block screenshot -->
          <ScreenshotImg v-if="detailRun.searchPageScreenshot" :src="detailRun.searchPageScreenshot" max-height="360" />

          <!-- Error -->
          <v-alert v-if="detailRun.error" type="error" density="compact" :text="detailRun.error" class="alert-compact"
            style="flex:none" />

          <!-- Results table -->
          <v-data-table v-if="detailExtracted.length > 0" :headers="detailHeaders" :items="detailExtracted"
            density="compact" class="text-body-2" style="flex:1">
            <template #[`item._screenshot`]="{ item }">
              <ScreenshotImg :src="item._screenshot" thumbnail class="my-1" />
            </template>
            <template #[`item.price`]="{ item }">
              <span>{{ item.price != null ? Number(item.price).toLocaleString('en-US', { maximumFractionDigits: 0 }) :
                '-' }}</span>
            </template>
          </v-data-table>
        </v-container>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { useCategoryFields } from '~/composables/useCategoryFields';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ItemResult {
  index: number;
  url: string;
  filename: string | null;
  base64: string | null;
  screenshotOk: boolean;
  extractOk: boolean;
  items: Record<string, unknown>[];
  error?: string;
  raw?: string;
}

interface LogLine { ts: string; level: string; msg: string; data?: unknown; }
interface Summary { total: number; screenshotOk: number; extractOk: number; }

interface SourceRun {
  loading: boolean;
  done: boolean;
  results: ItemResult[];
  logs: LogLine[];
  summary: Summary | null;
  error: string;
  searchPageScreenshot: string;
}

interface SourceDef {
  name: string;
  url: string;
  apiRoute?: string;
}

interface FieldDef {
  key: string;
  label: string;
}

interface CategoryGroup {
  label: string;
  ids: string[];
  sources: SourceDef[];
  queries: string[];
  newQuery: string;
  running: boolean;
  enabled: Record<string, boolean>;
  runs: Record<string, SourceRun>;
  requiredFields: FieldDef[];
  optionalFields: FieldDef[];
  fieldValues: Record<string, string>;
  activeOptionals: string[];
  lastRoundId?: string;
}

// ── Shared ─────────────────────────────────────────────────────────────────────
const screenshotCfgOpen = ref(false);

// ── Screenshot config ──────────────────────────────────────────────────────────
const SCREENSHOT_CFG_KEY = 'screenshotCfg_v1';
const SCREENSHOT_CFG_DEFAULTS = {
  viewportWidth: 1920, viewportHeight: 1080, fullPage: true, quality: 85, cropHeight: undefined as number | undefined,
  clip: { enabled: false, x: 0, y: 0, width: 1920, height: 1080 },
  limit: 1,
};
function loadScreenshotCfg() {
  try {
    const raw = localStorage.getItem(SCREENSHOT_CFG_KEY);
    if (raw) return { ...SCREENSHOT_CFG_DEFAULTS, ...JSON.parse(raw), clip: { ...SCREENSHOT_CFG_DEFAULTS.clip, ...(JSON.parse(raw).clip ?? {}) } };
  } catch { }
  return { ...SCREENSHOT_CFG_DEFAULTS, clip: { ...SCREENSHOT_CFG_DEFAULTS.clip } };
}
const screenshotCfg = reactive(loadScreenshotCfg());
watch(screenshotCfg, (val) => localStorage.setItem(SCREENSHOT_CFG_KEY, JSON.stringify(val)), { deep: true });
function resetScreenshotCfg() {
  Object.assign(screenshotCfg, { ...SCREENSHOT_CFG_DEFAULTS, clip: undefined });
  Object.assign(screenshotCfg.clip, SCREENSHOT_CFG_DEFAULTS.clip);
  localStorage.removeItem(SCREENSHOT_CFG_KEY);
}

const openPanels = ref<number[]>([0, 1, 2, 3, 4]);

// ── Source detail dialog ──────────────────────────────────────────────────────
const detailOpen = ref(false);
const detailGrpLabel = ref('');
const detailSrcName = ref('');
const detailTermEl = ref<HTMLElement>();

const detailRun = computed(() => {
  if (!detailGrpLabel.value || !detailSrcName.value) return null;
  const grp = categoryGroups.value.find((g: any) => g.label === detailGrpLabel.value);
  return grp?.runs[detailSrcName.value] ?? null;
});

const detailExtracted = computed(() => {
  if (!detailRun.value) return [];
  const grp = categoryGroups.value.find((g: any) => g.label === detailGrpLabel.value);
  if (!grp) return [];
  return srcExtracted(grp, detailSrcName.value);
});

const { getAllowedKeys, getFieldOrder } = useCategoryFields();

const detailHeaders = computed(() => {
  if (detailExtracted.value.length === 0) return [];
  const grp = categoryGroups.value.find((g: any) => g.label === detailGrpLabel.value);
  const categoryId = grp?.ids?.[0] as string | undefined;
  const allowed = categoryId ? getAllowedKeys(categoryId) : null;
  const order = categoryId ? getFieldOrder(categoryId) : [];
  const allKeys = Object.keys(detailExtracted.value[0]).filter((k) => k !== '_screenshot' && k !== '_source');
  const filteredKeys = allowed ? allKeys.filter((k) => allowed.has(k)) : allKeys;
  const dataKeys = order.length
    ? [...filteredKeys].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    : filteredKeys;
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 116 },
    ...dataKeys.map((k) => ({ title: k, key: k, sortable: true })),
    { title: 'ไฟล์', key: '_source', sortable: false },
  ];
});

function openDetail(grp: any, srcName: string) {
  detailGrpLabel.value = grp.label;
  detailSrcName.value = srcName;
  detailOpen.value = true;
}

watch([detailOpen, () => detailRun.value?.logs.length], async () => {
  if (!detailOpen.value || !detailTermEl.value) return;
  await nextTick();
  detailTermEl.value.scrollTop = detailTermEl.value.scrollHeight;
});

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `extracted_${Date.now()}.json`;
  a.click();
}

function formatLogTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ts; }
}

function logColor(level: string) {
  return level === 'error' ? '#f48771' : level === 'warn' ? '#dcdcaa' : '#d4d4d4';
}

function logLevelColor(level: string) {
  return level === 'error' ? '#f44747' : level === 'warn' ? '#ce9178' : '#4ec9b0';
}

// ── Category group definitions ─────────────────────────────────────────────────
function makeRun(): SourceRun {
  return { loading: false, done: false, results: [], logs: [], summary: null, error: '', searchPageScreenshot: '' };
}

const CATEGORY_FIELDS: Record<string, { required: FieldDef[]; optional: FieldDef[]; }> = {
  '103': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'dialColor', label: 'สีหน้าปัด' },
      { key: 'caseMaterial', label: 'วัสดุตัวเรือน' },
      { key: 'strapMaterial', label: 'วัสดุสายนาฬิกา' },
      { key: 'movementType', label: 'ระบบ' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
  '106': {
    required: [{ key: 'title', label: 'ชื่อ/ยี่ห้อ' }, { key: 'material', label: 'วัสดุ' }],
    optional: [
      { key: 'moldType', label: 'พิมพ์' },
      { key: 'year', label: 'ปี' },
      { key: 'weight', label: 'น้ำหนัก' },
    ],
  },
  '107': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'capacity', label: 'ความจุ/สเปก' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
  '108': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'condition', label: 'สภาพ' },
      { key: 'year', label: 'ปี' },
    ],
  },
  '111': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
};

function getFields(ids: string[]) {
  return CATEGORY_FIELDS[ids[0]] ?? {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [],
  };
}

function makeGroup(label: string, ids: string[], sources: SourceDef[]): CategoryGroup {
  const enabled: Record<string, boolean> = {};
  sources.forEach((s) => { enabled[s.name] = false; });
  const { required, optional } = getFields(ids);
  const fieldValues: Record<string, string> = {};
  required.forEach((f) => { fieldValues[f.key] = ''; });
  return {
    label, ids, sources, queries: [], newQuery: '', running: false, enabled, runs: {},
    requiredFields: required, optionalFields: optional, fieldValues, activeOptionals: [],
  };
}

function toggleAllSources(grp: CategoryGroup) {
  const readySources = grp.sources.filter(s => s.apiRoute);
  const allEnabled = readySources.every(s => grp.enabled[s.name]);
  readySources.forEach(s => { grp.enabled[s.name] = !allEnabled; });
}

function addOptionalField(grp: CategoryGroup, key: string) {
  if (!grp.activeOptionals.includes(key)) {
    grp.activeOptionals.push(key);
    grp.fieldValues[key] = '';
  }
}

function removeOptionalField(grp: CategoryGroup, key: string) {
  grp.activeOptionals = grp.activeOptionals.filter((k) => k !== key);
  delete grp.fieldValues[key];
}

function addQuery(grp: CategoryGroup) {
  const allFields = [
    ...grp.requiredFields,
    ...grp.optionalFields.filter((f) => grp.activeOptionals.includes(f.key)),
  ];
  const parts = allFields.map((f) => grp.fieldValues[f.key]?.trim()).filter(Boolean);
  if (parts.length === 0) return;
  const q = parts.join(' ');
  if (!grp.queries.includes(q)) grp.queries.push(q);
  allFields.forEach((f) => { grp.fieldValues[f.key] = ''; });
}

const categoryGroups = useState<CategoryGroup[]>('categoryGroups', () => [
  makeGroup('นาฬิกา', ['103'], [
    { name: 'StarBuyers Global Auction', url: 'https://www.starbuyers-global-auction.com/login' },
    { name: 'Chrono24', url: 'https://www.chrono24.com', apiRoute: '/api/chrono24-search' },
    { name: 'Auction House', url: 'https://www.auctionhouse.co.th', apiRoute: '/api/auctionhouse-search' },
    { name: 'Radium Watch', url: 'https://radiumwatch.com', apiRoute: '/api/radiumwatch-search' },
    { name: 'Siam Watch Club', url: 'https://www.siamwatchclub.com', apiRoute: '/api/siamwatchclub-search' },
    { name: 'Komehyo (นาฬิกา)', url: 'https://www.komehyo.co.th', apiRoute: '/api/komehyo-search' },
  ]),
  makeGroup('พระ / วัตถุมงคล', ['106'], [
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
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function srcExtracted(grp: CategoryGroup, srcName: string) {
  const run = grp.runs[srcName];
  if (!run) return [];
  const multiQuery = grp.queries.length > 1;
  return run.results.flatMap((r) => {
    const base = {
      _screenshot: r.filename ? `/api/screenshot?file=${r.filename}` : '',
      ...(multiQuery ? { _query: (r as ItemResult & { _query?: string; })._query ?? '' } : {}),
      _source: r.filename ?? r.url,
    };
    if (r.items.length > 0) {
      return r.items.map((item) => ({ ...base, ...item }));
    }
    if (r.screenshotOk && !r.extractOk) {
      return [{ ...base, _error: r.error ?? r.raw ?? 'AI extraction failed' }];
    }
    return [];
  });
}

function srcHeaders(grp: CategoryGroup, srcName: string) {
  const rows = srcExtracted(grp, srcName);
  if (rows.length === 0) return [];
  const categoryId = grp.ids?.[0] as string | undefined;
  const allowed = categoryId ? getAllowedKeys(categoryId) : null;
  const order = categoryId ? getFieldOrder(categoryId) : [];
  const allKeys = Object.keys(rows[0]).filter((k) => k !== '_screenshot' && k !== '_source');
  const filteredKeys = allowed ? allKeys.filter((k) => allowed.has(k)) : allKeys;
  const dataKeys = order.length
    ? [...filteredKeys].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    : filteredKeys;
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 116 },
    ...dataKeys.map((k) => ({ title: k, key: k, sortable: true })),
    { title: 'ไฟล์', key: '_source', sortable: false },
  ];
}

// ── Terminal refs ──────────────────────────────────────────────────────────────
const termRefs = ref<Record<string, Element | null>>({});
function setTermRef(groupLabel: string, srcName: string, el: unknown) {
  termRefs.value[`${groupLabel}:${srcName}`] = el as Element | null;
}
function scrollTerm(groupLabel: string, srcName: string) {
  nextTick(() => {
    const el = termRefs.value[`${groupLabel}:${srcName}`];
    if (el) el.scrollTop = el.scrollHeight;
  });
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
};

async function runSourceQuery(grp: CategoryGroup, src: SourceDef, query: string, qi: number, roundId?: string) {
  const run = grp.runs[src.name];
  const categoryId = API_CATEGORY_MAP[src.apiRoute!] ?? grp.ids[0];
  const prefix = grp.queries.length > 1 ? `[${qi + 1}/${grp.queries.length}] ` : '';

  run.logs.push({ ts: new Date().toISOString(), level: 'info', msg: `${prefix}ค้นหา: ${query}` });
  scrollTerm(grp.label, src.name);

  try {
    const res = await fetch(src.apiRoute!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, categoryId, limit: Number(screenshotCfg.limit) || 1, screenshotConfig: screenshotCfg, roundId }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.body) throw new Error('No response stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'log') {
            run.logs.push({ ...ev, msg: prefix + ev.msg });
            scrollTerm(grp.label, src.name);
          } else if (ev.type === 'result') {
            run.results.push({ ...ev, _query: query });
          } else if (ev.type === 'searchpage') {
            run.searchPageScreenshot = ev.base64;
          } else if (ev.type === 'done') {
            const s = ev.summary as Summary;
            if (!run.summary) {
              run.summary = { ...s };
            } else {
              run.summary.total += s.total;
              run.summary.screenshotOk += s.screenshotOk;
              run.summary.extractOk += s.extractOk;
            }
            if (ev.error) run.error = (run.error ? run.error + ' | ' : '') + `${query}: ${ev.error}`;
          }
        } catch { }
      }
    }
  } catch (e: unknown) {
    const msg = (e as Error).message ?? 'ค้นหาไม่สำเร็จ';
    run.error = (run.error ? run.error + ' | ' : '') + `${query}: ${msg}`;
    run.logs.push({ ts: new Date().toISOString(), level: 'error', msg: `${prefix}${msg}` });
    scrollTerm(grp.label, src.name);
  }
}

async function runSource(grp: CategoryGroup, src: SourceDef, roundId?: string) {
  if (!src.apiRoute || grp.queries.length === 0) return;
  if (!grp.runs[src.name]) grp.runs[src.name] = makeRun();
  const run = grp.runs[src.name];
  run.loading = true;
  run.done = false;
  run.results = [];
  run.logs = [];
  run.summary = null;
  run.error = '';
  run.searchPageScreenshot = '';

  try {
    for (let qi = 0; qi < grp.queries.length; qi++) {
      await runSourceQuery(grp, src, grp.queries[qi], qi, roundId);
    }
  } finally {
    run.loading = false;
    run.done = true;
    scrollTerm(grp.label, src.name);
  }
}

async function runGroup(grp: CategoryGroup) {
  if (grp.queries.length === 0) return;
  grp.running = true;
  const roundId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  grp.lastRoundId = roundId;

  const CONCURRENCY = 3;
  const TARGET_HITS = 3;
  const queue = grp.sources.filter((s) => s.apiRoute && grp.enabled[s.name]);

  try {
    let qi = 0;
    let hits = 0;
    let active = 0;

    await new Promise<void>((resolve) => {
      function tryNext() {
        // fill slots while under concurrency limit and haven't hit target
        while (active < CONCURRENCY && hits + active < TARGET_HITS && qi < queue.length) {
          const src = queue[qi++];
          active++;
          runSource(grp, src, roundId).then(() => {
            active--;
            if (srcExtracted(grp, src.name).length > 0) hits++;
            if (hits >= TARGET_HITS || (qi >= queue.length && active === 0)) {
              resolve();
            } else {
              tryNext();
            }
          });
        }
        if (active === 0) resolve();
      }
      tryNext();
    });
  } finally {
    grp.running = false;
  }
}
</script>

<style scoped>
.alert-compact :deep(.v-alert__content) {
  padding-top: 6px;
  padding-bottom: 6px;
}

.alert-compact {
  min-height: unset !important;
}

.terminal-box {
  background: #1e1e1e;
  font-family: monospace;
  font-size: 12px;
  padding: 10px 14px;
  overflow-y: auto;
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
