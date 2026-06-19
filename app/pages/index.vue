<template>
  <v-container class="py-8" max-width="960">
    <v-row class="mb-6">
      <v-col>
        <h1 class="text-h4 font-weight-bold">Price Extractor</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">ถ่ายรูปเว็บ → AI ดึงข้อมูลสินค้า</p>
      </v-col>
    </v-row>

    <!-- URL + Category -->
    <v-card class="mb-4" rounded="lg">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="7">
            <v-text-field
              v-model="url"
              label="URL หน้าเว็บ"
              placeholder="https://..."
              prepend-inner-icon="mdi-web"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="categoryId"
              :items="categories"
              item-title="label"
              item-value="id"
              label="หมวดสินค้า"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="2" class="d-flex align-center">
            <v-btn
              color="primary"
              block
              :loading="screenshotLoading"
              :disabled="!url"
              @click="takeScreenshot"
            >
              <v-icon start>mdi-camera</v-icon>
              ถ่ายรูป
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Custom template toggle -->
    <v-card class="mb-4" rounded="lg" v-if="!useCustomTemplate">
      <v-card-text class="py-3">
        <span class="text-body-2 text-medium-emphasis mr-3">ใช้ template ตามหมวดสินค้า</span>
        <v-btn size="small" variant="tonal" @click="useCustomTemplate = true">กำหนด template เอง</v-btn>
      </v-card-text>
    </v-card>

    <v-card class="mb-4" rounded="lg" v-else>
      <v-card-title class="py-3 px-4 text-body-1">
        Template ที่ต้องการ
        <v-btn size="x-small" variant="text" class="ml-2" @click="useCustomTemplate = false">ใช้ default</v-btn>
      </v-card-title>
      <v-card-text>
        <v-row dense v-for="(row, i) in customFields" :key="i" align="center">
          <v-col cols="4">
            <v-text-field v-model="row.key" label="ชื่อ field" density="compact" variant="outlined" hide-details />
          </v-col>
          <v-col cols="6">
            <v-text-field v-model="row.desc" label="คำอธิบาย" density="compact" variant="outlined" hide-details />
          </v-col>
          <v-col cols="2">
            <v-btn icon="mdi-delete" size="small" variant="text" @click="customFields.splice(i, 1)" />
          </v-col>
        </v-row>
        <v-btn size="small" variant="tonal" class="mt-2" prepend-icon="mdi-plus" @click="customFields.push({ key: '', desc: '' })">
          เพิ่ม field
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Screenshot preview -->
    <v-card class="mb-4" rounded="lg" v-if="screenshot">
      <v-card-title class="py-3 px-4 d-flex align-center">
        <v-icon class="mr-2">mdi-image</v-icon>
        Screenshot
        <v-spacer />
        <v-btn
          color="primary"
          size="small"
          :loading="extractLoading"
          @click="extractData"
        >
          <v-icon start>mdi-robot</v-icon>
          AI ดึงข้อมูล
        </v-btn>
      </v-card-title>
      <v-divider />
      <v-img :src="`data:image/jpeg;base64,${screenshot}`" max-height="500" contain class="bg-grey-lighten-4" />
    </v-card>

    <!-- Upload fallback -->
    <v-card class="mb-4" rounded="lg" v-if="!screenshot">
      <v-card-text class="py-3 text-center">
        <p class="text-body-2 text-medium-emphasis mb-2">หรืออัปโหลดรูปเอง</p>
        <v-btn variant="tonal" prepend-icon="mdi-upload" @click="triggerUpload">เลือกไฟล์รูป</v-btn>
        <input ref="fileInput" type="file" accept="image/*" class="d-none" @change="onFileUpload" />
      </v-card-text>
    </v-card>

    <!-- Error -->
    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- Results -->
    <v-card rounded="lg" v-if="items.length > 0">
      <v-card-title class="py-3 px-4 d-flex align-center">
        <v-icon class="mr-2">mdi-table</v-icon>
        ผลลัพธ์ ({{ items.length }} รายการ)
        <v-spacer />
        <v-btn size="small" variant="tonal" prepend-icon="mdi-download" @click="downloadJson">JSON</v-btn>
      </v-card-title>
      <v-divider />
      <v-data-table
        :headers="tableHeaders"
        :items="items"
        density="compact"
        class="text-body-2"
      />
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
const url = ref('')
const categoryId = ref('103')
const screenshot = ref('')
const screenshotMime = ref('image/jpeg')
const screenshotLoading = ref(false)
const extractLoading = ref(false)
const error = ref('')
const items = ref<Record<string, unknown>[]>([])
const fileInput = ref<HTMLInputElement>()
const useCustomTemplate = ref(false)
const customFields = ref<{ key: string; desc: string }[]>([
  { key: 'title', desc: 'ชื่อสินค้า' },
  { key: 'price', desc: 'ราคา (ตัวเลขบาท) | null' },
  { key: 'condition', desc: '"new" | "used" | "unknown" | null' },
])

const categories = [
  { id: '103', label: 'นาฬิกา' },
  { id: '106', label: 'พระ/วัตถุมงคล' },
  { id: '107', label: 'สินค้าไอที' },
  { id: '108', label: 'แบรนเนม' },
  { id: '109', label: 'โน้ตบุ๊ก/แท็บเล็ต' },
  { id: '110', label: 'แว่นตา' },
  { id: '111', label: 'เครื่องมือช่าง' },
  { id: '112', label: 'สมาร์ทโฟน' },
]

const tableHeaders = computed(() => {
  if (items.value.length === 0) return []
  return Object.keys(items.value[0]).map((k) => ({ title: k, key: k, sortable: true }))
})

async function takeScreenshot() {
  screenshotLoading.value = true
  error.value = ''
  screenshot.value = ''
  try {
    const res = await $fetch<{ base64: string; mimeType: string }>('/api/screenshot', {
      method: 'POST',
      body: { url: url.value },
    })
    screenshot.value = res.base64
    screenshotMime.value = res.mimeType
  } catch (e: unknown) {
    error.value = (e as Error).message ?? 'ถ่ายรูปไม่สำเร็จ'
  } finally {
    screenshotLoading.value = false
  }
}

function triggerUpload() {
  fileInput.value?.click()
}

function onFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  screenshotMime.value = file.type
  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result as string
    screenshot.value = result.split(',')[1]
  }
  reader.readAsDataURL(file)
}

async function extractData() {
  extractLoading.value = true
  error.value = ''
  items.value = []
  try {
    const template = useCustomTemplate.value
      ? Object.fromEntries(customFields.value.filter((r) => r.key).map((r) => [r.key, r.desc]))
      : undefined

    const res = await $fetch<{ items: Record<string, unknown>[]; raw?: string }>('/api/extract', {
      method: 'POST',
      body: {
        base64: screenshot.value,
        mimeType: screenshotMime.value,
        categoryId: categoryId.value,
        template,
      },
    })
    items.value = res.items
    if (res.raw) error.value = 'AI ส่งข้อมูลมาแต่ parse JSON ไม่ได้: ' + res.raw.slice(0, 200)
  } catch (e: unknown) {
    error.value = (e as Error).message ?? 'ดึงข้อมูลไม่สำเร็จ'
  } finally {
    extractLoading.value = false
  }
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(items.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `extracted_${Date.now()}.json`
  a.click()
}
</script>
