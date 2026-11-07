'use strict';

// 仅供本机预览维护：程序缓存与离线壳可重建，不触碰存档、Cookie或数据库。
const { readActiveId } = require('../server/releases.cjs');
const prefix = '/__preview/';
const client = `(() => {
  'use strict';
  const button = document.getElementById('clear-program-cache');
  const status = document.getElementById('cache-reset-status');
  const open = document.getElementById('open-latest');
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = '正在清理游戏程序缓存…';
    try {
      let workers = 0;
      if (navigator.serviceWorker) {
        for (const registration of await navigator.serviceWorker.getRegistrations()) {
          const worker = registration.active || registration.waiting || registration.installing;
          const script = worker && new URL(worker.scriptURL);
          if (registration.scope === location.origin + '/' && script && script.origin === location.origin && script.pathname === '/sw.js') {
            if (await registration.unregister()) workers++;
          }
        }
      }
      const programPrefix = 'mc-offline-v1-' + encodeURIComponent('/') + '-';
      const names = window.caches ? await caches.keys() : [];
      let removed = 0;
      for (const name of names) if (name.startsWith(programPrefix) && await caches.delete(name)) removed++;
      const remaining = window.caches ? (await caches.keys()).filter(name => name.startsWith(programPrefix)).length : 0;
      if (remaining) throw new Error('仍有程序副本正在创建，请再试一次。');
      status.dataset.removed = String(removed);
      status.dataset.workers = String(workers);
      status.dataset.remaining = String(remaining);
      status.textContent = '程序缓存清理完成：删除 ' + removed + ' 份离线副本，剩余 0 份。存档、账号和照片保留。';
      button.hidden = true;
      open.hidden = false;
      open.focus();
    } catch (error) {
      status.textContent = '清理没有完成：' + error.message;
      button.disabled = false;
    }
  });
})();`;

function respond(req, res, { dataDir }) {
  const pathname = (req.url || '').split('?')[0];
  const routes = [prefix + 'clear-program-cache', prefix + 'program-cache-reset.js'];
  if (!routes.includes(pathname)) return false;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return true; }
  const html = pathname === routes[0];
  const release = html ? readActiveId(dataDir) : null;
  const body = html ? '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>清理游戏程序缓存</title><body><h1>清理游戏程序缓存</h1><p>只删除可重新下载的程序与离线副本，保留存档、账号和照片。</p><button id="clear-program-cache">清理程序缓存</button><p id="cache-reset-status" role="status">已请求浏览器清理HTTP程序缓存，等待清理离线副本。</p><a id="open-latest" hidden href="/?v=' + release.slice(2, 10) + '&amp;cacheReset=' + Date.now() + '">打开最新版本</a><script src="' + routes[1] + '"></script></body></html>' : client;
  const headers = { 'Content-Type': html ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'" };
  if (html) headers['Clear-Site-Data'] = '"cache"';
  res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

module.exports = { respond, client };
