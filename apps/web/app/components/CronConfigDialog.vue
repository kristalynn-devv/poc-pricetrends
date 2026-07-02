<template>
  <v-dialog :model-value="modelValue" max-width="440" @update:model-value="$emit('update:modelValue', $event)">
    <v-card v-if="target">
      <v-card-title class="d-flex align-center ga-1 pt-4 px-4">
        <v-icon size="small">mdi-clock-outline</v-icon>
        <span>{{ target }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('update:modelValue', false)" />
      </v-card-title>
      <v-card-text class="px-4 pb-2">
        <v-switch v-model="edit.enabled" label="เปิดใช้งาน cron" color="primary" density="compact"
          hide-details class="mb-2" />

        <v-text-field v-model="edit.cronExpression" label="Cron expression (นาที ชม. วัน เดือน วันในสัปดาห์)"
          variant="outlined" density="compact" hide-details class="mb-1" placeholder="0 8 * * *" />
        <div class="d-flex flex-wrap ga-1 mb-3">
          <v-chip v-for="p in cronPresets" :key="p.expr" size="x-small" variant="tonal"
            @click="edit.cronExpression = p.expr">{{ p.label }}</v-chip>
        </div>

        <div class="d-flex align-center ga-2 mb-2">
          <v-text-field v-model="newQuery" label="เพิ่ม query" variant="outlined" density="compact" hide-details
            style="flex:1" @keyup.enter="addQuery" />
          <v-btn size="small" variant="tonal" color="secondary" @click="addQuery">เพิ่ม</v-btn>
        </div>
        <div v-if="edit.queries.length > 0" class="d-flex flex-wrap ga-1 mb-3">
          <v-chip v-for="(q, qi) in edit.queries" :key="q" size="small" closable
            @click:close="edit.queries.splice(qi, 1)">{{ q }}</v-chip>
        </div>
        <p v-else class="text-caption text-medium-emphasis mb-3">ยังไม่มี query — cron จะไม่ทำงานจนกว่าจะเพิ่ม</p>

        <v-row dense>
          <v-col cols="6">
            <v-text-field v-model.number="edit.maxSources" label="จำนวน source" type="number" min="1"
              variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="6">
            <v-combobox v-model="edit.itemsPerSource" :items="[1, 3, 5, 10]" label="จำนวนชิ้น/source"
              variant="outlined" density="compact" hide-details :return-object="false" type="number" />
          </v-col>
        </v-row>

        <template v-if="cronRunsForTarget.length > 0">
          <v-divider class="my-3" />
          <p class="text-caption text-medium-emphasis mb-1">ประวัติการรันล่าสุด</p>
          <div class="d-flex flex-column ga-1" style="max-height:140px; overflow:auto">
            <div v-for="r in cronRunsForTarget" :key="r.runId" class="text-caption d-flex align-center ga-1">
              <v-icon :color="r.error ? 'error' : 'success'" size="12">{{ r.error ? 'mdi-alert-circle' :
                'mdi-check-circle' }}</v-icon>
              <span>{{ new Date(r.timestamp).toLocaleString('th-TH') }}</span>
              <span class="text-medium-emphasis">· {{ r.sourceCount }} source</span>
            </div>
          </div>
        </template>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn color="primary" size="small" class="text-none" @click="save">ตกลง</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { DEFAULT_CRON_CONFIG } from '#shared/utils/cronConfig';
import type { CronCategoryConfig } from '#shared/types/cronConfig';

const props = defineProps<{
  modelValue: boolean;
  target: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const cronCfgStore = useCronConfigStore();

const edit = reactive<CronCategoryConfig>({ ...DEFAULT_CRON_CONFIG, queries: [] });
const newQuery = ref('');
const cronPresets = [
  { label: 'ทุกวัน 08:00', expr: '0 8 * * *' },
  { label: 'ทุก 6 ชม.', expr: '0 */6 * * *' },
  { label: 'ทุกชั่วโมง', expr: '0 * * * *' },
  { label: 'ทุกวันจันทร์ 08:00', expr: '0 8 * * 1' },
];

const cronRunsForTarget = computed(() =>
  cronCfgStore.runs.filter(r => r.label === props.target).slice(0, 10)
);

watch(() => [props.modelValue, props.target] as const, ([open, target]) => {
  if (!open || !target) return;
  const existing = cronCfgStore.getCronCfg(target);
  Object.assign(edit, existing, { queries: [...existing.queries] });
}, { immediate: true });

function addQuery() {
  const q = newQuery.value.trim();
  if (!q || edit.queries.includes(q)) return;
  edit.queries.push(q);
  newQuery.value = '';
}

async function save() {
  await cronCfgStore.setCronCfg(props.target, { ...edit, queries: [...edit.queries] });
  emit('update:modelValue', false);
}
</script>
