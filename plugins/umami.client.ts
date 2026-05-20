export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const websiteId = String(config.public.umami.websiteId || '').trim();
  const hostUrl = String(config.public.umami.hostUrl || '').trim();

  if (!websiteId) return;

  useScriptUmamiAnalytics({
    websiteId,
    ...(hostUrl ? { hostUrl } : {}),
    scriptOptions: {
      trigger: 'onNuxtReady',
    },
  });
});
