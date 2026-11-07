'use strict';

const { RELEASE_ID, ASSET_PATH, hash, normalizeBasePath, dataRoot, mimeFor, readManifest, readReleaseFile, verifyRelease, readActiveId } = require('./releases.cjs');
const { offlineResponse } = require('./offline.cjs');
const commonHeaders = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
function parsedPath(url) {
  if (typeof url !== 'string' || url.length > 4096) return { error: 414 };
  const raw = url.split('?')[0];
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\#\x00-\x20\x7f]/.test(raw) || /%2f|%5c/i.test(raw)) return { error: 400 };
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch (_) { return { error: 400 }; }
  if (/[\\%#\x00-\x20\x7f]/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..')) return { error: 400 };
  return { path: decoded };
}
function matchesEtag(header, etag) {
  if (typeof header !== 'string') return false;
  return header.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}
function createHandler({ dataDir, basePath = '/', cloudApi = null }) {
  const root = dataRoot(dataDir), prefix = normalizeBasePath(basePath);
  function activeManifest() {
    const manifest = readManifest(root, readActiveId(root));
    if (manifest.basePath !== prefix) throw new Error('当前 release 的 base-path 与服务不一致。');
    return manifest;
  }
  // 可直接用请求/响应替身调用；只有 cli serve 会创建监听。
  return async function handler(req, res) {
    const method = req.method || 'GET', head = method === 'HEAD';
    function send(status, body = '', headers = {}) {
      const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
      res.writeHead(status, { ...commonHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': content.length, ...headers });
      res.end(head ? undefined : content);
    }
    function representation(body, mime, cache, status = 200) {
      const content = Buffer.isBuffer(body) ? body : Buffer.from(body), etag = '"' + hash(content) + '"';
      if (matchesEtag(req.headers?.['if-none-match'], etag)) {
        res.writeHead(304, { ...commonHeaders, 'Cache-Control': cache, ETag: etag }); res.end(); return;
      }
      send(status, content, { 'Content-Type': mime, 'Cache-Control': cache, ETag: etag });
    }
    const parsed = parsedPath(req.url);
    if (parsed.error) return send(parsed.error, parsed.error === 414 ? 'URI Too Long\n' : 'Bad Request\n');
    const requested = parsed.path;
    if (prefix && requested === prefix) return send(308, '', { Location: prefix + '/' });
    if (prefix && !requested.startsWith(prefix + '/')) return send(404, 'Not Found\n');
    const route = requested.slice(prefix.length);
    try {
      if (route === '/api/v1' || route.startsWith('/api/v1/')) {
        if (cloudApi) return await cloudApi.handle(req, res, route.slice('/api/v1'.length));
        return send(503, '{"code":"CLOUD_DISABLED","message":"账号存档未启用。"}\n', { 'Content-Type': 'application/json; charset=utf-8' });
      }
      if (method !== 'GET' && method !== 'HEAD') return send(405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
      if (route === '/healthz') {
        try {
          const manifest = activeManifest();
          verifyRelease(root, manifest.id);
          return send(200, JSON.stringify({ status: 'ok', releaseId: manifest.id }) + '\n', { 'Content-Type': 'application/json; charset=utf-8' });
        } catch (_) { return send(503, '{"status":"unavailable"}\n', { 'Content-Type': 'application/json; charset=utf-8' }); }
      }
      if (route === '/version.json') {
        const manifest = activeManifest();
        return send(200, JSON.stringify({ releaseId: manifest.id, basePath: prefix || '/', createdAt: manifest.createdAt, assetCount: manifest.files.length - 1 }) + '\n', { 'Content-Type': 'application/json; charset=utf-8' });
      }
      // 独立参观路径不会命中旧worker的主人页面导航缓存；启动分支在任何存档初始化前执行。
      if (route === '/' || route === '/index.html' || /^\/visit\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(route)) {
        const manifest = activeManifest(), file = readReleaseFile(root, manifest, 'index.html');
        return representation(file.content, mimeFor('index.html'), 'no-cache');
      }
      const offline = offlineResponse({ dataDir: root, basePath: prefix || '/', route });
      if (offline) return send(200, offline.body, offline.headers);
      const match = /^\/releases\/([^/]+)\/(.+)$/.exec(route);
      if (!match || !RELEASE_ID.test(match[1]) || !ASSET_PATH.test(match[2])) return send(404, 'Not Found\n');
      let manifest;
      try { manifest = readManifest(root, match[1]); } catch (error) { if (error.code === 'ENOENT') return send(404, 'Not Found\n'); throw error; }
      if (manifest.basePath !== prefix) return send(404, 'Not Found\n');
      const file = readReleaseFile(root, manifest, match[2]);
      if (!file) return send(404, 'Not Found\n');
      return representation(file.content, mimeFor(match[2]), 'public, max-age=31536000, immutable');
    } catch (_) {
      // 错误响应不泄露磁盘路径、源文件或私有数据。
      return send(503, 'Service Unavailable\n');
    }
  };
}
module.exports = { createHandler, parsedPath, matchesEtag };
