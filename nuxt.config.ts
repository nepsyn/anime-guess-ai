export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['@fortawesome/fontawesome-free/css/all.min.css', '~/assets/css/main.css'],
  runtimeConfig: {
    aiProvider: process.env.AI_PROVIDER || 'gpt',
    public: {
      appName: 'AI 猜动画名',
    },
  },
});
