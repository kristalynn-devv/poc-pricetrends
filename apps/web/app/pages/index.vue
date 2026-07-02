<template>
  <v-container class="py-8" max-width="1200">
    <v-row class="mb-6">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Price Extractor</h1>
        <div class="d-flex align-center ga-2 mt-1">
          <p class=" text-medium-emphasis mb-0">ค้นหาราคาสินค้าแยกตามหมวด</p>
        </div>
      </v-col>
      <v-col cols="auto" class="d-flex ga-1">
        <v-btn variant="text" prepend-icon="mdi-table-eye" to="/entries" size="small"
          class="text-none">รายการข้อมูล</v-btn>
        <v-btn variant="text" prepend-icon="mdi-text-box-outline" to="/logs" size="small" class="text-none">System
          Logs</v-btn>
        <v-btn variant="text" prepend-icon="mdi-clipboard-check-outline" to="/backtest" size="small"
          class="text-none">Backtest</v-btn>
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
            <v-btn size="small" variant="text" icon="mdi-cog-outline"
              :color="catCfgStore.hasCustomCfg(grp.label) ? 'primary' : undefined"
              @click.stop="openCatCfg(grp.label)" />
            <v-btn size="small" variant="text" icon="mdi-clock-outline"
              :color="cronCfgStore.getCronCfg(grp.label).enabled ? 'primary' : undefined"
              @click.stop="openCronCfg(grp.label)" />
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
                variant="outlined" density="compact" hide-details :disabled="grp.running" style="flex:1; min-width:0"
                @keyup.enter="groupsStore.addQuery(grp)" clearable />
              <v-btn color="secondary" variant="tonal" size="small" class="text-none" height="40"
                :disabled="!grp.newQuery?.trim() || grp.running" prepend-icon="mdi-plus"
                @click.stop="groupsStore.addQuery(grp)">
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
                  prepend-icon="mdi-play"
                  @click="groupsStore.runGroup(grp, getSrcCfgForGroup(grp), catCfgStore.getCategoryCfg(grp.label))">
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

                <v-list-item-title class="font-weight-regular d-flex align-center ga-1">
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
                    <v-btn v-if="src.apiRoute" size="small" variant="text"
                      :color="cfgStore.hasCustomCfg(src.name) ? 'primary' : undefined" icon="mdi-tune"
                      @click.stop="openSrcCfg(src.name)" />
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

    <SourceConfigDialog v-model="srcCfgOpen" :target="srcCfgTarget" />
    <CategoryConfigDialog v-model="catCfgOpen" :target="catCfgTarget" />
    <CronConfigDialog v-model="cronCfgOpen" :target="cronCfgTarget" />
    <SourceDetailDialog v-model="detailOpen" :grp-label="detailGrpLabel" :src-name="detailSrcName" />
  </v-container>
</template>

<script setup lang="ts">
const cfgStore = useSourceConfigStore();
const catCfgStore = useCategoryConfigStore();
const cronCfgStore = useCronConfigStore();
const groupsStore = useSearchGroupsStore();

cronCfgStore.load();
cronCfgStore.loadRuns();

const { groups } = storeToRefs(groupsStore);

groupsStore.init();

// ── Local UI state ─────────────────────────────────────────────────────────────
const openPanels = ref<number[]>([0, 1, 2, 3, 4]);

// ── Per-source config dialog ───────────────────────────────────────────────────
const srcCfgOpen = ref(false);
const srcCfgTarget = ref('');

function openSrcCfg(name: string) {
  srcCfgTarget.value = name;
  srcCfgOpen.value = true;
}

// ── Per-category config dialog ─────────────────────────────────────────────────
const catCfgOpen = ref(false);
const catCfgTarget = ref('');

function openCatCfg(label: string) {
  catCfgTarget.value = label;
  catCfgOpen.value = true;
}

// ── Cron config dialog ─────────────────────────────────────────────────────────
const cronCfgOpen = ref(false);
const cronCfgTarget = ref('');

function openCronCfg(label: string) {
  cronCfgTarget.value = label;
  cronCfgOpen.value = true;
}

// getCfg ที่ให้กับ runGroup: ใช้ per-source override ถ้ามี ไม่งั้น fallback เป็น itemsPerSource ของหมวด
function getSrcCfgForGroup(grp: any) {
  const catCfg = catCfgStore.getCategoryCfg(grp.label);
  return (srcName: string) => {
    const cfg = cfgStore.getSourceCfg(srcName);
    if (!cfgStore.hasCustomCfg(srcName)) return { ...cfg, limit: catCfg.itemsPerSource };
    return cfg;
  };
}

// ── Source detail dialog ───────────────────────────────────────────────────────
const detailOpen = ref(false);
const detailGrpLabel = ref('');
const detailSrcName = ref('');

function openDetail(grp: any, srcName: string) {
  detailGrpLabel.value = grp.label;
  detailSrcName.value = srcName;
  detailOpen.value = true;
}
</script>
