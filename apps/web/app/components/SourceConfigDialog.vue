<template>
  <v-dialog :model-value="modelValue" max-width="400" @update:model-value="$emit('update:modelValue', $event)">
    <v-card v-if="target">
      <v-card-title class="d-flex align-center ga-1 pt-4 px-4">
        <v-icon size="small">mdi-tune</v-icon>
        <span class="">{{ target }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('update:modelValue', false)" />
      </v-card-title>
      <v-card-text class="px-4 pb-2">
        <v-row dense class="mb-2">
          <v-col cols="5">
            <v-text-field v-model.number="edit.viewportWidth" label="Width (px)" type="number"
              variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="2" class="d-flex align-center justify-center">
            <span class=" text-medium-emphasis">×</span>
          </v-col>
          <v-col cols="5">
            <v-text-field v-model.number="edit.viewportHeight" label="Height (px)" type="number"
              variant="outlined" density="compact" hide-details />
          </v-col>
        </v-row>
        <v-row dense align="center" class="mb-2">
          <v-col cols="6">
            <v-text-field v-model.number="edit.quality" label="Quality (1–100)" type="number" variant="outlined"
              density="compact" hide-details />
          </v-col>
          <v-col cols="6">
            <v-text-field v-model.number="edit.cropHeight" label="Crop height (px)" type="number"
              variant="outlined" density="compact" hide-details clearable placeholder="ไม่ตัด" />
          </v-col>
        </v-row>
        <v-divider class="mb-3" />
        <v-row dense>
          <v-col cols="6">
            <v-combobox v-model="edit.limit" :items="[1, 3, 5, 10]" label="จำนวนชิ้น/คำค้น" variant="outlined"
              density="compact" hide-details :return-object="false" type="number" />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn variant="text" size="small" class="text-none" @click="reset">Reset</v-btn>
        <v-spacer />
        <v-btn color="primary" size="small" class="text-none" @click="save">ตกลง</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { SOURCE_CFG_DEFAULTS, type SourceCfg } from '~/stores/globalConfig';

const props = defineProps<{
  modelValue: boolean;
  target: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const cfgStore = useSourceConfigStore();

const edit = reactive<SourceCfg>({ ...SOURCE_CFG_DEFAULTS, clip: { ...SOURCE_CFG_DEFAULTS.clip } });

watch(() => [props.modelValue, props.target] as const, ([open, target]) => {
  if (!open || !target) return;
  const existing = cfgStore.getSourceCfg(target);
  Object.assign(edit, existing);
  Object.assign(edit.clip, existing.clip);
}, { immediate: true });

function save() {
  cfgStore.setSourceCfg(props.target, { ...edit, clip: { ...edit.clip } });
  emit('update:modelValue', false);
}

function reset() {
  cfgStore.resetSourceCfg(props.target);
  emit('update:modelValue', false);
}
</script>
