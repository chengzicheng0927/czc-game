'use strict';
// 发布服务在响应时注入不可变版本清单，安装只缓存这一版的完整游戏壳。
const config = __COTTAGE_OFFLINE_CONFIG__;
const cachePrefix = 'mc-offline-v1-' + encodeURIComponent(config.basePath || '/') + '-';
const cacheName = cachePrefix + config.releaseId + '-' + config.workerVersion;
const assets = new Set(config.assets.map(value => new URL(value, self.location.origin).href));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      // 固定版本入口避免发布切换期间把新HTML与旧资源拼成不完整的离线版本。
      const response = await fetch(new URL(config.entry, self.location.origin).href, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('离线页面尚未准备好。');
      await cache.addAll(config.assets.map(value => new Request(new URL(value, self.location.origin).href, { cache: 'reload', credentials: 'omit' })));
      await cache.put(new URL(config.shell, self.location.origin).href, response.clone());
      await cache.put(new URL(config.index, self.location.origin).href, response);
    } catch (error) { await caches.delete(cacheName); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith(cachePrefix));
    // 不强行接管仍在编辑的旧页面；常规生命周期确保旧页退出后才激活。
    for (const name of names) if (name !== cacheName) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(config.basePath + '/api/')) return;
  if (request.mode === 'navigate' && (url.pathname === config.shell || url.pathname === config.index)) {
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.ok) return response; throw new Error('暂时离线'); }
      catch (_) { const cache = await caches.open(cacheName); return (await cache.match(new URL(config.shell, self.location.origin).href)) || new Response('离线副本尚未准备好，请联网后重新打开小屋。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
  } else if (assets.has(url.href)) {
    event.respondWith((async () => { const cache = await caches.open(cacheName); return (await cache.match(request)) || fetch(request); })());
  }
});
