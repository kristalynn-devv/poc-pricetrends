<template>
  <v-dialog v-model="logsDetailOpen" max-width="860" scrollable>
    <v-card v-if="logsDetailEntry" rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-chip :color="logsDetailEntry.httpStatus === 200 ? 'success' : 'error'" label class="mr-3">
          {{ logsDetailEntry.httpStatus }}
        </v-chip>
        Log Detail
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="logsDetailOpen = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <ScreenshotImg
          v-if="logsDetailEntry.screenshotFile"
          :src="screenshotSrc(logsDetailEntry.screenshotFile)"
          max-height="260"
          class="mb-4"
        />

        <v-table density="compact">
          <tbody>
            <tr v-for="[k, v] in detailRows" :key="k">
              <td class="text-medium-emphasis font-weight-medium" style="width:160px">{{ k }}</td>
              <td>
                <v-chip v-if="k === 'errorType' && v" size="x-small" :color="errorColor(v as string)" label>{{ v }}</v-chip>
                <span v-else-if="k === 'URL' && v" class="d-flex align-center ga-1">
                  <span style="word-break:break-all">{{ v }}</span>
                  <v-btn
                    :href="v as string"
                    target="_blank"
                    rel="noopener"
                    icon="mdi-open-in-new"
                    size="x-small"
                    variant="text"
                  />
                </span>
                <span v-else-if="k === 'screenshotFile' && v" class="d-flex align-center ga-1">
                  <span>{{ v }}</span>
                  <v-btn
                    v-if="!onEntriesPage"
                    :to="`/entries?date=${selectedDate}`"
                    icon="mdi-table-eye"
                    size="x-small"
                    variant="text"
                    title="ดูในรายการข้อมูล"
                  />
                </span>
                <span v-else :class="k === 'error' && v ? 'text-error' : ''">{{ v ?? '-' }}</span>
              </td>
            </tr>
          </tbody>
        </v-table>

        <template v-if="logsDetailEntry.screenshotFile && logsDetailEntry.httpStatus === 200 && !logsDetailEntry.error">
          <v-divider class="my-4" />
          <div class="mb-3 d-flex align-center ga-2">ข้อมูลที่ Gemini ดึงได้</div>
          <v-row v-if="logsDetailItems.length" dense>
            <v-col v-for="(item, i) in logsDetailItems" :key="i" cols="12">
              <v-card variant="tonal" color="surface-variant" rounded="lg" class="pa-3">
                <v-row dense>
                  <v-col
                    v-for="[fk, fv] in Object.entries(item).filter(([, val]) => val != null && val !== '')"
                    :key="fk"
                    cols="6"
                    sm="4"
                  >
                    <div class="font-weight-medium text-medium-emphasis">{{ fk }}</div>
                    <div>{{ fv }}</div>
                  </v-col>
                </v-row>
              </v-card>
            </v-col>
          </v-row>
          <v-card v-else-if="!logsDetailItemsLoading" variant="outlined" rounded="lg" class="pa-3 text-center text-disabled">
            ไม่มีข้อมูล
          </v-card>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const store = useLogsEntriesStore()
const route = useRoute()
const { screenshotUrl } = useApi()

const {
  selectedDate,
  logsDetailOpen,
  logsDetailEntry,
  logsDetailItems,
  logsDetailItemsLoading,
} = storeToRefs(store)

const onEntriesPage = computed(() => route.path === '/entries')

function screenshotSrc(file: string) {
  return screenshotUrl(file)
}

const detailRows = computed(() => {
  if (!logsDetailEntry.value) return []
  const e = logsDetailEntry.value
  return [
    ['เวลา', new Date(e.timestamp).toLocaleString('th-TH')],
    ['source', e.source],
    ['searchQuery', e.searchQuery],
    ['roundId', e.roundId],
    ['URL', e.url],
    ['categoryId', e.categoryId],
    ['httpStatus', e.httpStatus],
    ['screenshotFile', e.screenshotFile],
    ['durationMs', e.durationMs != null ? `${e.durationMs.toLocaleString()} ms` : null],
    ['errorType', e.errorType],
    ['error', e.error],
    ['geminiInputTokens', e.geminiInputTokens != null ? e.geminiInputTokens.toLocaleString() : null],
    ['geminiOutputTokens', e.geminiOutputTokens != null ? e.geminiOutputTokens.toLocaleString() : null],
    ['imageResolution', e.imageWidth != null ? `${e.imageWidth} × ${e.imageHeight} px` : null],
  ]
})

function errorColor(type: string | null) {
  const map: Record<string, string> = {
    timeout: 'warning',
    screenshot: 'error',
    extraction: 'orange',
    parse: 'purple',
    config: 'red',
    notfound: 'grey',
  }
  return map[type ?? ''] ?? 'error'
}
</script>
