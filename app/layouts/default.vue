<template>
  <v-app>
    <v-app-bar color="primary" elevation="1">
      <v-toolbar-title>
        <span class="font-weight-bold text-white">Price Extractor</span>
        <span class="text-caption ml-2" style="color: rgba(255,255,255,0.6)">POC</span>
      </v-toolbar-title>
    </v-app-bar>
    <v-main>
      <slot />
    </v-main>
  </v-app>
</template>
