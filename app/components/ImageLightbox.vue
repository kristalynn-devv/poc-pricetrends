<template>
  <v-dialog v-model="open" max-width="92vw" max-height="95vh" @after-enter="reset">
    <v-card>
      <v-toolbar density="compact" color="transparent" flat>
        <v-btn icon="mdi-magnify-minus-outline" size="small" @click="zoomBy(-0.25)" />
        <span class="text-caption mx-2" style="min-width:44px; text-align:center">{{ Math.round(scale * 100) }}%</span>
        <v-btn icon="mdi-magnify-plus-outline" size="small" @click="zoomBy(0.25)" />
        <v-btn icon="mdi-fit-to-screen-outline" size="small" class="ml-1" @click="reset" />
        <v-spacer />
        <v-btn icon="mdi-close" @click="open = false" />
      </v-toolbar>

      <div
        ref="stage"
        class="lightbox-stage"
        :style="{ cursor: dragging ? 'grabbing' : 'grab' }"
        @mousedown.prevent="startDrag"
        @mousemove="onDrag"
        @mouseup="endDrag"
        @mouseleave="endDrag"
        @wheel.prevent="onWheel"
        @dblclick="dblClick"
      >
        <img
          :src="src"
          class="lightbox-img"
          :style="{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.15s ease',
          }"
          draggable="false"
        />
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
defineProps<{ src: string }>()
const open = defineModel<boolean>({ default: false })

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
const stage = ref<HTMLElement>()

let lastX = 0
let lastY = 0

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function zoomBy(delta: number) {
  scale.value = Math.min(8, Math.max(0.25, scale.value + delta))
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY < 0 ? 0.15 : -0.15
  scale.value = Math.min(8, Math.max(0.25, scale.value + delta))
}

function dblClick() {
  scale.value === 1 ? (scale.value = 2) : reset()
}

function startDrag(e: MouseEvent) {
  dragging.value = true
  lastX = e.clientX
  lastY = e.clientY
}

function onDrag(e: MouseEvent) {
  if (!dragging.value) return
  tx.value += e.clientX - lastX
  ty.value += e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
}

function endDrag() {
  dragging.value = false
}
</script>

<style scoped>
.lightbox-stage {
  overflow: hidden;
  max-height: 82vh;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  user-select: none;
}
.lightbox-img {
  max-width: 100%;
  max-height: 82vh;
  transform-origin: center center;
  display: block;
  pointer-events: none;
}
</style>
