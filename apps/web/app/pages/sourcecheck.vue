<template>
  <v-container class="py-8" max-width="1100">
    <v-row class="mb-4" align="center">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Source Check</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">
          ทดสอบค้นหาจริงทุก source ก่อนใช้งาน — เช็คว่ายังเจอสินค้าและถ่ายภาพได้อยู่
        </p>
      </v-col>
      <v-col cols="auto" class="d-flex ga-1">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/" size="small">กลับหน้าหลัก</v-btn>
      </v-col>
    </v-row>

    <v-row class="mb-4" align="center" dense>
      <v-col cols="auto">
        <v-btn color="primary" prepend-icon="mdi-play" :loading="store.running" @click="store.start">
          {{ store.running ? 'กำลังตรวจสอบ (ใช้เวลาหลายนาที)...' : 'ตรวจสอบ Source ทั้งหมด' }}
        </v-btn>
      </v-col>
      <v-col cols="auto" v-if="store.run">
        <span class="text-caption text-medium-emphasis">
          ตรวจล่าสุด: {{ formatTs(store.run.timestamp) }} · ผ่าน {{ store.passCount }}/{{ store.run.results.length }}
        </span>
      </v-col>
      <v-spacer />
    </v-row>

    <v-alert v-if="store.running" type="info" variant="tonal" class="mb-4">
      กำลังตรวจสอบอยู่เบื้องหลัง — เปลี่ยนหน้าได้ตามปกติ ผลจะขึ้นอัตโนมัติเมื่อตรวจเสร็จ
    </v-alert>

    <v-alert v-if="store.error" type="error" class="mb-4" closable>{{ store.error }}</v-alert>

    <v-card v-if="store.run" rounded="lg" variant="outlined" class="mb-6">
      <v-card-title class="text-subtitle-1">ผลล่าสุด</v-card-title>
      <ResultTable :results="store.run.results" />
    </v-card>

    <v-alert v-else-if="store.loaded && !store.running" type="info" variant="tonal" class="mb-6">
      ยังไม่มีผล source check — กด "ตรวจสอบ Source ทั้งหมด" เพื่อเริ่ม
    </v-alert>

    <!-- ── ประวัติย้อนหลัง ── -->
    <v-divider class="mb-6" />
    <v-row class="mb-4" align="center" dense>
      <v-col>
        <h2 class="text-h6 font-weight-bold">ประวัติย้อนหลัง</h2>
      </v-col>
      <v-col cols="12" sm="auto">
        <v-menu v-model="store.dateMenu" :close-on-content-click="false" min-width="auto">
          <template #activator="{ props }">
            <v-text-field :model-value="store.formattedDate" label="วันที่" prepend-inner-icon="mdi-calendar"
              variant="outlined" density="compact" hide-details readonly style="min-width: 180px" v-bind="props" />
          </template>
          <v-date-picker v-model="datePickerDate" hide-header />
        </v-menu>
      </v-col>
    </v-row>

    <v-alert v-if="store.historyError" type="error" class="mb-4" closable>{{ store.historyError }}</v-alert>

    <v-progress-linear v-if="store.historyLoading" indeterminate class="mb-4" />

    <template v-if="!store.historyLoading">
      <v-alert v-if="store.historyRuns.length === 0" type="info" variant="tonal">
        ไม่มีข้อมูล source check สำหรับวันที่ {{ store.formattedDate }}
      </v-alert>
      <v-card v-for="(r, i) in [...store.historyRuns].reverse()" :key="r.runId" rounded="lg" variant="outlined"
        class="mb-4">
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
          <span>{{ formatTs(r.timestamp) }}</span>
          <v-chip size="small" variant="tonal">
            ผ่าน {{ r.results.filter(x => x.pass).length }}/{{ r.results.length }}
          </v-chip>
          <v-spacer />
          <span v-if="i === 0" class="text-caption text-medium-emphasis">ล่าสุดของวันนี้</span>
        </v-card-title>
        <ResultTable :results="r.results" />
      </v-card>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { useSourceCheckStore } from '~/stores/sourcecheck'
import ResultTable from '~/components/SourceCheckResultTable.vue'

const store = useSourceCheckStore()

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('th-TH')
}

const datePickerDate = computed({
  get: () => new Date(store.selectedDate + 'T00:00:00'),
  set: (val: Date) => {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    store.selectedDate = `${y}-${m}-${d}`
    store.dateMenu = false
    store.loadHistory()
  },
})

onMounted(() => {
  if (!store.loaded && !store.running) store.loadLatest()
  store.loadHistory()
})
</script>
