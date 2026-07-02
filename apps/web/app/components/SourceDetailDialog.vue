<template>
  <v-dialog :model-value="modelValue" fullscreen transition="dialog-bottom-transition"
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card v-if="detailRun">
      <!-- Toolbar -->
      <v-toolbar color="surface" density="compact">
        <v-btn icon="mdi-close" @click="$emit('update:modelValue', false)" />
        <v-toolbar-title>
          {{ srcName }}
          <span class="text-caption text-medium-emphasis ml-2">{{ grpLabel }}</span>
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
            <div class="terminal-box rounded-b" ref="termEl" style="height:320px">
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
          density="compact" class="" style="flex:1">
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
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  grpLabel: string;
  srcName: string;
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const groupsStore = useSearchGroupsStore();
const { groups } = storeToRefs(groupsStore);

const { getAllowedKeys, getFieldOrder } = useCategoryFields();
const { downloadJson } = useDownloadJson();
const { formatLogTime, logColor, logLevelColor } = useLogStyle();

const termEl = ref<HTMLElement>();

const detailRun = computed(() => {
  if (!props.grpLabel || !props.srcName) return null;
  const grp = groups.value.find(g => g.label === props.grpLabel);
  return grp?.runs[props.srcName] ?? null;
});

const detailExtracted = computed(() => {
  if (!detailRun.value) return [];
  const grp = groups.value.find(g => g.label === props.grpLabel);
  if (!grp) return [];
  return groupsStore.srcExtracted(grp, props.srcName);
});

const detailHeaders = computed(() => {
  if (detailExtracted.value.length === 0) return [];
  const grp = groups.value.find(g => g.label === props.grpLabel);
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

watch([() => props.modelValue, () => detailRun.value?.logs.length], async () => {
  if (!props.modelValue || !termEl.value) return;
  await nextTick();
  termEl.value.scrollTop = termEl.value.scrollHeight;
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
