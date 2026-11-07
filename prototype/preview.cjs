'use strict';

// 仅供本机审核：复用4173与现有游戏后端，白名单开放新原型文件。
// 不进入正式发布清单；不提供目录浏览或任意文件访问。
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('../server/cli.cjs');
const cacheReset = require('./program-cache-reset.cjs');
const files = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['style.css', 'text/css; charset=utf-8'],
  ['scene.js', 'text/javascript; charset=utf-8'],
  ['characters.js', 'text/javascript; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['coverage.md', 'text/plain; charset=utf-8']
]);
async function start() {
  const server = await run(['serve', '--host', '127.0.0.1', '--port', '4173', '--data-dir', path.resolve(__dirname, '../.server-data'), '--base-path', '/']);
  const existing = server.listeners('request');
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (cacheReset.respond(req, res, { dataDir: path.resolve(__dirname, '../.server-data') })) return;
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/prototype' && !pathname.startsWith('/prototype/')) {
      for (const listener of existing) listener.call(server, req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    if (pathname === '/prototype') { res.writeHead(302, { Location: '/prototype/' }); res.end(); return; }
    const file = pathname === '/prototype/' ? 'index.html' : pathname.slice('/prototype/'.length);
    if (!files.has(file)) { res.writeHead(404); res.end('Not Found'); return; }
    try {
      const body = fs.readFileSync(path.join(__dirname, file));
      res.writeHead(200, { 'Content-Type': files.get(file), 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (_) { res.writeHead(404); res.end('Not Found'); }
  });
}
start().catch(error => { process.stderr.write('本地原型预览：' + error.message + '\n'); process.exitCode = 1; });
