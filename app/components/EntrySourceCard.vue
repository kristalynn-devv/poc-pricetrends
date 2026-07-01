<template>
  <v-card rounded="lg" border flat>
    <v-card-item class="">
      <v-card-title class="text-body-1 font-weight-bold">
        {{ group.source }}
      </v-card-title>

      <template #append>
        <div class="d-flex align-center ga-1">
          <v-chip v-if="group.searchQuery" size="x-small" variant="tonal" label class="d-none d-sm-flex">
            {{ formatTime(group.timestamp) }}
          </v-chip>
          <v-btn v-if="group.screenshotFile" icon="mdi-text-box-search-outline" size="small" variant="text"
            title="ดู log" @click.stop="emit('viewLog', group)" />
          <v-btn icon="mdi-open-in-new" size="small" variant="text" :href="group.url" target="_blank"
            title="เปิดลิงก์ต้นทาง" />
        </div>
      </template>
    </v-card-item>

    <v-divider />

    <v-card-text v-if="group.items.length === 0" class="text-disabled text-center py-8">
      <v-icon size="32" class="mb-2">mdi-package-variant-closed</v-icon>
      <div>ไม่มีรายการสินค้า</div>
    </v-card-text>

    <v-row v-else no-gutters align="stretch">
      <v-col v-if="group.screenshotFile" cols="12" sm="auto" class="pa-3">
        <v-sheet rounded="lg" border class="pa-2">
          <ScreenshotImg :src="screenshotSrc(group.screenshotFile)" thumbnail width="200" height="112" />
        </v-sheet>
      </v-col>
      <v-col cols="12" :sm="group.screenshotFile ? true : 12">
        <v-data-table :headers="tableHeaders(group.items, group.categoryId ?? undefined)" :items="group.items"
          density="comfortable" class="text-body-2" hide-default-footer :items-per-page="-1" hover>
          <template #[`item.price`]="{ value }">
            <span class="font-weight-bold text-primary">{{ formatPrice(value) }}</span>
          </template>
          <template #[`item.condition`]="{ value }">
            <v-chip v-if="value" size="x-small" :color="conditionColor(String(value))" variant="tonal" label>
              {{ value }}
            </v-chip>
            <span v-else class="text-disabled">-</span>
          </template>
          <template #[`item.currency`]="{ value }">
            <v-chip v-if="value" size="x-small" variant="outlined" label>{{ value }}</v-chip>
            <span v-else class="text-disabled">-</span>
          </template>
          <template v-for="col in textColumns(group.categoryId ?? undefined)" :key="col" #[`item.${col}`]="{ value }">
            <span>{{ value ?? '-' }}</span>
          </template>
        </v-data-table>
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import type { ResultEntry } from '#shared';

defineProps<{
  group: ResultEntry;
}>();

const emit = defineEmits<{
  viewLog: [group: ResultEntry];
}>();

const { screenshotUrl } = useApi();

function screenshotSrc(file: string) {
  return screenshotUrl(file);
}

const { getAllowedKeys, getFieldOrder, getFields, COMMON_FIELDS } = useCategoryFields();

function getColumnKeys(items: Record<string, unknown>[], categoryId?: string): string[] {
  if (!items.length) return [];
  const allKeys = Object.keys(items[0]);
  if (!categoryId) return allKeys;
  const allowed = getAllowedKeys(categoryId);
  const order = getFieldOrder(categoryId);
  const filtered = allKeys.filter(k => allowed.has(k));
  return [...filtered].sort((a, b) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function colLabel(key: string, categoryId?: string): string {
  if (!categoryId) return key;
  const { required, optional } = getFields(categoryId);
  const field = [...required, ...COMMON_FIELDS, ...optional].find(f => f.key === key);
  return field?.label ?? key;
}

function tableHeaders(items: Record<string, unknown>[], categoryId?: string) {
  return getColumnKeys(items, categoryId).map(key => ({
    title: colLabel(key, categoryId),
    key,
    sortable: false,
    align: key === 'price' ? 'end' as const : 'start' as const,
    minWidth: key === 'price' ? '100px' : undefined,
  }));
}

function textColumns(categoryId?: string): string[] {
  if (!categoryId) return [];
  const skip = new Set(['price', 'currency', 'condition']);
  const { required, optional } = getFields(categoryId);
  return [...required, ...COMMON_FIELDS, ...optional]
    .map(f => f.key)
    .filter(k => !skip.has(k));
}

function formatPrice(price: unknown) {
  if (price == null) return '-';
  return Number(price).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function conditionColor(c: string) {
  if (c === 'new') return 'success';
  if (c === 'used') return 'warning';
  return 'grey';
}
</script>
