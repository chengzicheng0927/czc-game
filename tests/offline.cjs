'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), assert = require('node:assert/strict');
const { prepareRelease, activateRelease, readReleaseFile } = require('../server/releases.cjs');
const { offlineResponse } = require('../server/offline.cjs');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-offline-')), basePath = '/cottage';
let groups = 0;
async function check(name, fn) { await fn(); groups++; console.log('✓ ' + name); }
function worker(script, { failAsset = false } = {}) {
  const listeners = {}, stores = new Map(), calls = []; let online = true, claimed = false;
  const storage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map()); const map = stores.get(name);
      return { async put(key, value) { map.set(typeof key === 'string' ? key : key.url, value.clone()); }, async match(key) { return map.get(typeof key === 'string' ? key : key.url)?.clone(); }, async addAll(requests) { for (const request of requests) { if (failAsset) throw new Error('resource failed'); const response = await fetcher(request); map.set(request.url, response.clone()); } } };
    },
    async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); }
  };
  async function fetcher(request) {
    const url = typeof request === 'string' ? request : request.url; calls.push(url);
    if (!online) throw new Error('offline');
    return new Response(url.includes('/offline-shell/') ? '<html>pinned-release</html>' : 'public asset', { headers: { 'Content-Type': url.includes('/offline-shell/') ? 'text/html' : 'text/javascript' } });
  }
  const self = { location: { origin: 'https://cottage.test' }, clients: { async claim() { claimed = true; } }, addEventListener(name, fn) { listeners[name] = fn; } };
  vm.runInNewContext(script, { self, caches: storage, fetch: fetcher, URL, Set, Request, Response, encodeURIComponent }, { filename: 'sw.js' });
  return { stores, calls, claimed: () => claimed, online(value) { online = value; },
    async event(type) { let pending; listeners[type]({ waitUntil(value) { pending = value; } }); await pending; },
    async fetch(url, mode = 'cors', method = 'GET') { let result; listeners.fetch({ request: { url, mode, method }, respondWith(value) { result = value; } }); return result === undefined ? null : await result; }
  };
}
(async () => {
  try {
    const release = prepareRelease({ sourceRoot: root, dataDir: temp, basePath }); activateRelease({ dataDir: temp, releaseId: release.id });
    const get = route => offlineResponse({ dataDir: temp, basePath, route });
    const resource = get('/sw.js'), config = JSON.parse(get('/offline-manifest.json').body);
    await check('离线清单只含当前不可变资源，worker允许的范围限定在站点前缀', () => {
      assert.equal(resource.headers['Service-Worker-Allowed'], basePath + '/'); assert.equal(resource.headers['Cache-Control'], 'no-cache');
      assert.ok(config.assets.length > 100); assert.ok(config.assets.every(value => value.startsWith(basePath + '/releases/' + release.id + '/') && !value.includes('/api/')));
      assert.equal(config.entry, basePath + '/offline-shell/' + release.id);
      assert.equal(resource.body.includes('__COTTAGE_OFFLINE_CONFIG__'), false);
    });
    await check('固定版本入口可读且与发布副本一致，未发布/非法版本不能回退暴露源码', () => {
      const entry = get('/offline-shell/' + release.id); assert.deepEqual(entry.body, readReleaseFile(temp, release, 'index.html').content);
      assert.equal(get('/offline-shell/../index.html'), null); assert.equal(get('/api/v1/save'), null);
      assert.equal(get('/offline-shell/r-' + 'f'.repeat(64)), null);
    });
    const app = worker(resource.body);
    await check('完成安装后缓存整套公开资源和固定版页面，可离线冷启动并读取资源', async () => {
      await app.event('install'); await app.event('activate'); assert.ok(app.claimed());
      const map = [...app.stores.values()][0]; assert.equal(map.size, config.assets.length + 2);
      app.online(false); const page = await app.fetch('https://cottage.test' + config.shell, 'navigate'); assert.equal(await page.text(), '<html>pinned-release</html>');
      const asset = await app.fetch('https://cottage.test' + config.assets[0]); assert.equal(await asset.text(), 'public asset');
    });
    await check('API/账号/POST/跨域请求完全绕过缓存，不能返回离线HTML冒充存档', async () => {
      const before = app.calls.length;
      for (const request of [['https://cottage.test/cottage/api/v1/save', 'cors', 'GET'], ['https://cottage.test/cottage/api/v1/session', 'cors', 'GET'], ['https://cottage.test/cottage/', 'navigate', 'POST'], ['https://else.test/cottage/', 'navigate', 'GET']]) assert.equal(await app.fetch(...request), null);
      assert.equal(app.calls.length, before);
      for (const map of app.stores.values()) assert.ok([...map.keys()].every(url => !url.includes('/api/')));
    });
    await check('安装资源失败会丢弃不完整新副本；联网导航不覆盖固定旧版离线壳', async () => {
      const bad = worker(resource.body, { failAsset: true }); await assert.rejects(bad.event('install')); assert.equal(bad.stores.size, 0);
      app.online(true); const current = await app.fetch('https://cottage.test' + config.shell, 'navigate'); assert.equal(await current.text(), 'public asset');
      app.online(false); const fallback = await app.fetch('https://cottage.test' + config.index, 'navigate'); assert.equal(await fallback.text(), '<html>pinned-release</html>');
    });
    await check('file入口不会注册Service Worker或发送任何网络请求', () => {
      let registrations = 0;
      const context = { window: null, document: { currentScript: { src: 'file:///tmp/game/js/core/offline.js' } }, navigator: { serviceWorker: { register() { registrations++; } } }, console };
      context.window = context; context.Game = { bus: { emit() {} } };
      vm.runInNewContext(fs.readFileSync(path.join(root, 'js/core/offline.js'), 'utf8'), context); context.Game.offline.init(); assert.equal(registrations, 0); assert.equal(context.Game.offline.status().phase, 'unavailable');
    });
    console.log(groups + ' 组离线壳/缓存隔离检查通过（无监听）。');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
