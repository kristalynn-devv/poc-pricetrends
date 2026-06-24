<template>
  <div :style="thumbnail ? 'display:contents' : 'width:100%'">
    <!-- thumbnail -->
    <template v-if="thumbnail">
      <v-img
        v-if="imgSrc"
        :src="imgSrc"
        :width="width"
        :height="height"
        cover
        position="top center"
        class="rounded cursor-pointer"
        @click="open = true"
      />
      <span v-else class="text-medium-emphasis text-caption">—</span>
    </template>

    <!-- preview -->
    <v-img
      v-else-if="imgSrc"
      :src="imgSrc"
      :max-height="maxHeight"
      contain
      position="top center"
      class="bg-grey-lighten-4 rounded cursor-pointer"
      @click="open = true"
    />

    <ImageLightbox v-if="imgSrc" v-model="open" :src="imgSrc" />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  src: string | null | undefined
  thumbnail?: boolean
  width?: number | string
  height?: number | string
  maxHeight?: number | string
}>(), {
  thumbnail: false,
  width: 100,
  height: 70,
  maxHeight: 360,
})

const open = ref(false)
const imgSrc = computed(() => {
  if (!props.src) return ''
  if (props.src.startsWith('data:') || props.src.startsWith('/') || props.src.startsWith('http')) return props.src
  return `data:image/jpeg;base64,${props.src}`
})
</script>
