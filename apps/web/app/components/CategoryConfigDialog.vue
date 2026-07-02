<template>
  <v-dialog :model-value="modelValue" max-width="360" @update:model-value="$emit('update:modelValue', $event)">
    <v-card v-if="target">
      <v-card-title class="d-flex align-center ga-1 pt-4 px-4">
        <v-icon size="small">mdi-cog-outline</v-icon>
        <span class="">{{ target }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('update:modelValue', false)" />
      </v-card-title>
      <v-card-text class="px-4 pb-2">
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
import { DEFAULT_CATEGORY_RUN_CONFIG, type CategoryRunConfig } from '~/stores/categoryConfig';

const props = defineProps<{
  modelValue: boolean;
  target: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const catCfgStore = useCategoryConfigStore();

const edit = reactive<CategoryRunConfig>({ ...DEFAULT_CATEGORY_RUN_CONFIG });

watch(() => [props.modelValue, props.target] as const, ([open, target]) => {
  if (!open || !target) return;
  Object.assign(edit, catCfgStore.getCategoryCfg(target));
}, { immediate: true });

function save() {
  catCfgStore.setCategoryCfg(props.target, { ...edit });
  emit('update:modelValue', false);
}

function reset() {
  catCfgStore.resetCategoryCfg(props.target);
  emit('update:modelValue', false);
}
</script>
