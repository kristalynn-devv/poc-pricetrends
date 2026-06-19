<template>
  <v-dialog v-model="open" max-width="90vw" max-height="90vh">
    <v-card>
      <v-toolbar density="compact" color="transparent">
        <v-spacer />
        <v-btn icon="mdi-close" @click="open = false" />
      </v-toolbar>
      <v-img :src="src" max-height="80vh" contain />
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{ src: string }>()
const open = defineModel<boolean>({ default: false })
</script>
