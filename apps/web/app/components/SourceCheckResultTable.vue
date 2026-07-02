<template>
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
      <tr v-for="r in results" :key="r.source">
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
</template>

<script setup lang="ts">
import type { SourceCheckResult } from '#shared/types/sourcecheck'

defineProps<{ results: SourceCheckResult[] }>()
</script>
