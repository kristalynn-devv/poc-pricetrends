<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-6">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Price Extractor</h1>
        <div class="d-flex align-center ga-2 mt-1">
          <p class="text-body-2 text-medium-emphasis mb-0">ค้นหาราคาสินค้าแยกตามหมวด</p>
        </div>
      </v-col>
      <v-col cols="auto" class="d-flex align-center ga-1">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small"
          class="text-none">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small" class="text-none">System
          Logs</v-btn>
      </v-col>
    </v-row>

    <!-- ── Category group expansion panels ── -->
    <v-expansion-panels v-model="openPanels" multiple variant="accordion" class="mb-4">
      <v-expansion-panel v-for="grp in groups" :key="grp.label" rounded="lg">
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small">mdi-tag-multiple-outline</v-icon>
          <span>{{ grp.label }}</span>
          <span class="text-caption text-medium-emphasis ml-2">หมวด {{ grp.ids.join(', ') }}</span>
          <v-spacer />
          <div class="d-flex align-center ga-1 me-2" @click.stop>
            <span class="text-caption text-medium-emphasis">{{grp.sources.filter(s => s.apiRoute).length}}/{{
              grp.sources.length }} แหล่งพร้อมใช้</span>
            <template v-if="groupsStore.grpTotalItems(grp) > 0 || grp.running">
              <v-chip size="x-small" :color="grp.running ? 'primary' : 'success'" variant="tonal">
                <v-progress-circular v-if="grp.running" indeterminate size="8" width="2" class="mr-1" />
                {{ groupsStore.grpTotalItems(grp) }} รายการ
              </v-chip>
              <v-btn v-if="grp.lastRoundId && !grp.running" size="x-small" variant="tonal" color="success"
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
            <!-- Search freetext row -->
            <div class="d-flex align-center ga-2 mb-2">
              <v-text-field v-model="grp.newQuery"
                :placeholder="[...grp.requiredFields, ...grp.optionalFields].map(f => f.label).join('  ')"
                variant="outlined" density="compact" hide-details :disabled="grp.running"
                style="flex:1; min-width:0" @keyup.enter="groupsStore.addQuery(grp)" clearable />
              <v-btn color="secondary" variant="tonal" size="small" class="text-none" height="40"
                :disabled="!grp.newQuery?.trim() || grp.running"
                prepend-icon="mdi-plus" @click.stop="groupsStore.addQuery(grp)">
                เพิ่มรายการ
              </v-btn>
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
                  prepend-icon="mdi-play" @click="groupsStore.runGroup(grp, cfgStore.getSourceCfg)">
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
              @click.stop="groupsStore.toggleAllSources(grp)">
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
                  <v-progress-circular v-if="grp.runs[src.name]?.loading" indeterminate size="14" width="2" />
                  <v-chip v-else-if="groupsStore.srcExtracted(grp, src.name).length > 0" size="x-small" color="primary"
                    variant="tonal">
                    {{ groupsStore.srcExtracted(grp, src.name).length }} รายการ
                  </v-chip>
                  <v-chip v-else-if="grp.runs[src.name]?.error" size="x-small" color="error"
                    variant="tonal">error</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ src.url }}</v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center ga-1">
                    <v-btn v-if="src.apiRoute" size="small" variant="text" :color="cfgStore.hasCustomCfg(src.name) ? 'primary' : undefined"
                      icon="mdi-tune" @click.stop="openSrcCfg(src.name)" />
                    <v-btn v-if="grp.runs[src.name]" size="small" variant="tonal" prepend-icon="mdi-console"
                      @click.stop="openDetail(grp, src.name)">
                      ดูรายละเอียด
                    </v-btn>
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- ── Per-source Config Dialog ── -->
    <v-dialog v-model="srcCfgOpen" max-width="400">
      <v-card v-if="srcCfgTarget">
        <v-card-title class="d-flex align-center ga-1 pt-4 px-4">
          <v-icon size="small">mdi-tune</v-icon>
          <span class="text-body-1">{{ srcCfgTarget }}</span>
          <v-spacer />
          <v-btn icon="mdi-close" size="small" variant="text" @click="srcCfgOpen = false" />
        </v-card-title>
        <v-card-text class="px-4 pb-2">
          <v-row dense class="mb-2">
            <v-col cols="5">
              <v-text-field v-model.number="srcCfgEdit.viewportWidth" label="Width (px)" type="number"
                variant="outlined" density="compact" hide-details />
            </v-col>
            <v-col cols="2" class="d-flex align-center justify-center">
              <span class="text-body-2 text-medium-emphasis">×</span>
            </v-col>
            <v-col cols="5">
              <v-text-field v-model.number="srcCfgEdit.viewportHeight" label="Height (px)" type="number"
                variant="outlined" density="compact" hide-details />
            </v-col>
          </v-row>
          <v-row dense align="center" class="mb-2">
            <v-col cols="6">
              <v-text-field v-model.number="srcCfgEdit.quality" label="Quality (1–100)" type="number"
                variant="outlined" density="compact" hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="srcCfgEdit.cropHeight" label="Crop height (px)" type="number"
                variant="outlined" density="compact" hide-details clearable placeholder="ไม่ตัด" />
            </v-col>
          </v-row>
          <v-divider class="mb-3" />
          <v-row dense>
            <v-col cols="6">
              <v-combobox v-model="srcCfgEdit.limit" :items="[1, 3, 5, 10]" label="จำนวนชิ้น/คำค้น"
                variant="outlined" density="compact" hide-details :return-object="false" type="number" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" size="small" class="text-none"
            @click="cfgStore.resetSourceCfg(srcCfgTarget); srcCfgOpen = false">Reset</v-btn>
          <v-spacer />
          <v-btn color="primary" size="small" class="text-none" @click="saveSrcCfg">ตกลง</v-btn>
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
            @click="downloadJson(detailExtracted.map(({ _screenshot: _s, ...r }) => r), `extracted_${Date.now()}.json`)">JSON</v-btn>
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
import { SOURCE_CFG_DEFAULTS, type SourceCfg } from '~/stores/globalConfig';

const cfgStore = useSourceConfigStore();
const groupsStore = useSearchGroupsStore();

const { groups } = storeToRefs(groupsStore);

groupsStore.init();

// ── Local UI state ─────────────────────────────────────────────────────────────
const openPanels = ref<number[]>([0, 1, 2, 3, 4]);

// ── Per-source config dialog ───────────────────────────────────────────────────
const srcCfgOpen = ref(false);
const srcCfgTarget = ref('');
const srcCfgEdit = reactive<SourceCfg>({ ...SOURCE_CFG_DEFAULTS, clip: { ...SOURCE_CFG_DEFAULTS.clip } });

function openSrcCfg(name: string) {
  srcCfgTarget.value = name;
  const existing = cfgStore.getSourceCfg(name);
  Object.assign(srcCfgEdit, existing);
  Object.assign(srcCfgEdit.clip, existing.clip);
  srcCfgOpen.value = true;
}

function saveSrcCfg() {
  cfgStore.setSourceCfg(srcCfgTarget.value, { ...srcCfgEdit, clip: { ...srcCfgEdit.clip } });
  srcCfgOpen.value = false;
}

// ── Source detail dialog ───────────────────────────────────────────────────────
const detailOpen = ref(false);
const detailGrpLabel = ref('');
const detailSrcName = ref('');
const detailTermEl = ref<HTMLElement>();

const detailRun = computed(() => {
  if (!detailGrpLabel.value || !detailSrcName.value) return null;
  const grp = groups.value.find(g => g.label === detailGrpLabel.value);
  return grp?.runs[detailSrcName.value] ?? null;
});

const detailExtracted = computed(() => {
  if (!detailRun.value) return [];
  const grp = groups.value.find(g => g.label === detailGrpLabel.value);
  if (!grp) return [];
  return groupsStore.srcExtracted(grp, detailSrcName.value);
});

const totalFound = computed(() =>
  groups.value.reduce((sum, grp) => sum + groupsStore.grpTotalItems(grp), 0)
)
const anyRunning = computed(() => groups.value.some(g => g.running))

const { getAllowedKeys, getFieldOrder } = useCategoryFields();
const { downloadJson } = useDownloadJson();
const { formatLogTime, logColor, logLevelColor } = useLogStyle();

const detailHeaders = computed(() => {
  if (detailExtracted.value.length === 0) return [];
  const grp = groups.value.find(g => g.label === detailGrpLabel.value);
  const categoryId = grp?.ids?.[0] as string | undefined;
  const allowed = categoryId ? getAllowedKeys(categoryId) : null;
  const order = categoryId ? getFieldOrder(categoryId) : [];
  const allKeys = Object.keys(detailExtracted.value[0]).filter(k => k !== '_screenshot' && k !== '_source');
  const filteredKeys = allowed ? allKeys.filter(k => allowed.has(k)) : allKeys;
  const dataKeys = order.length
    ? [...filteredKeys].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    : filteredKeys;
  return [
    { title: 'รูป', key: '_screenshot', sortable: false, width: 116 },
    ...dataKeys.map(k => ({ title: k, key: k, sortable: true })),
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
})

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
