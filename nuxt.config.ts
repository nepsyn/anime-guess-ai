export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['@fortawesome/fontawesome-free/css/all.min.css', '~/assets/css/main.css'],
  app: {
    head: {
      title: '二次元婆罗门猜猜乐',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.ico' }],
    },
  },
  runtimeConfig: {
    public: {
      appName: '二次元婆罗门猜猜乐',
    },
  },
});
