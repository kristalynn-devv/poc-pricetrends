export default defineNuxtConfig({
  ssr: false,
  future: { compatibilityVersion: 4 },
  modules: ['vuetify-nuxt-module', '@nuxtjs/google-fonts'],
  css: ['@mdi/font/css/materialdesignicons.css', '~/assets/css/global.css'],
  googleFonts: {
    families: {
      'Noto Sans Thai': { wght: '100..900' },
      'Noto Sans': { wght: '100..900', ital: '100..900' },
    },
    display: 'swap',
    preconnect: true,
  },
  vuetify: {
    moduleOptions: { importComposables: true },
    vuetifyOptions: {
      icons: { defaultSet: 'mdi' },
      theme: {
        defaultTheme: 'light',
        themes: {
          light: {
            colors: {
              primary: '#1565C0',
              'primary-darken-1': '#0D47A1',
              secondary: '#1E88E5',
              success: '#2E7D32',
              error: '#C62828',
              info: '#42A5F5',
            },
          },
        },
      },
    },
  },
  runtimeConfig: {
    geminiApiKey: '',
  },
  devServer: { port: 3000 },
});
