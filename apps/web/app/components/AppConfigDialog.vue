<template>
  <v-dialog :model-value="modelValue" max-width="360" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center ga-1 pt-4 px-4">
        <v-icon size="small">mdi-tune-variant</v-icon>
        <span>ตั้งค่าแอป</span>
        <v-spacer />
        <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('update:modelValue', false)" />
      </v-card-title>
      <v-card-text class="px-4 pb-2">
        <v-text-field v-model.number="edit.concurrency" label="รันพร้อมกันกี่ source ต่อหมวด" type="number" min="1"
          variant="outlined" density="compact" hide-details
          hint="ใช้ร่วมกันทั้งค้นหาแบบ manual, cron, และ source check" persistent-hint />
        <p v-if="error" class="text-caption text-error mt-2 mb-0">{{ error }}</p>
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
import { DEFAULT_APP_CONFIG } from '#shared/utils/appConfig';
import type { AppConfig } from '#shared/types/appConfig';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const appCfgStore = useAppConfigStore();

const edit = reactive<AppConfig>({ ...DEFAULT_APP_CONFIG });
const error = ref('');

watch(() => props.modelValue, (open) => {
  if (!open) return;
  error.value = '';
  Object.assign(edit, appCfgStore.cfg);
}, { immediate: true });

async function save() {
  error.value = '';
  try {
    await appCfgStore.save({ ...edit });
    emit('update:modelValue', false);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ';
  }
}

async function reset() {
  Object.assign(edit, DEFAULT_APP_CONFIG);
  await save();
}
</script>
