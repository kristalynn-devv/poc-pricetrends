<template>
  <v-container class="py-8" max-width="1100">
    <v-row class="mb-4" align="center">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Backtest Sources</h1>
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
          {{ store.running ? 'กำลังรัน (ใช้เวลาหลายนาที)...' : 'รัน Backtest ทั้งหมด' }}
        </v-btn>
      </v-col>
      <v-col cols="auto" v-if="store.run">
        <span class="text-caption text-medium-emphasis">
          รันล่าสุด: {{ formatTs(store.run.timestamp) }} · ผ่าน {{ store.passCount }}/{{ store.run.results.length }}
        </span>
      </v-col>
      <v-spacer />
    </v-row>

    <v-alert v-if="store.running" type="info" variant="tonal" class="mb-4">
      กำลังรันอยู่เบื้องหลัง — เปลี่ยนหน้าได้ตามปกติ ผลจะขึ้นอัตโนมัติเมื่อรันเสร็จ
    </v-alert>

    <v-alert v-if="store.error" type="error" class="mb-4" closable>{{ store.error }}</v-alert>

    <v-card v-if="store.run" rounded="lg" variant="outlined">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Source</th>
            <th>หมวด</th>
            <th>Query</th>
            <th>สถานะ</th>
            <th>เจอสินค้า</th>
            <th>ถ่ายภาพสำเร็จ</th>
            <th>Extract สำเร็จ</th>
            <th>เวลา (s)</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in store.run.results" :key="r.source">
            <td class="font-weight-medium">{{ r.source }}</td>
            <td>{{ r.categoryId }}</td>
            <td>{{ r.query }}</td>
            <td>
              <v-chip :color="r.pass ? 'success' : 'error'" size="small" variant="tonal">
                {{ r.pass ? 'PASS' : 'FAIL' }}
              </v-chip>
            </td>
            <td>{{ r.productsFound }}</td>
            <td>{{ r.screenshotOk }}</td>
            <td>{{ r.extractOk }}</td>
            <td>{{ (r.durationMs / 1000).toFixed(1) }}</td>
            <td class="text-caption text-error">{{ r.error ?? '' }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-alert v-else-if="store.loaded && !store.running" type="info" variant="tonal">
      ยังไม่มีผล backtest — กด "รัน Backtest ทั้งหมด" เพื่อเริ่ม
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { useBacktestStore } from '~/stores/backtest'

const store = useBacktestStore()

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('th-TH')
}

onMounted(() => {
  if (!store.loaded && !store.running) store.loadLatest()
})
</script>
