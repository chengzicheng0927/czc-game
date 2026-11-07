'use strict';

// 只生成公开的离线游戏壳；账号、会话和云存档从不进入缓存清单。
const fs = require('node:fs');
const path = require('node:path');
const { RELEASE_ID, hash, normalizeBasePath, readActiveId, readManifest, readReleaseFile } = require('./releases.cjs');
const template = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
function offlineResponse({ dataDir, basePath = '/', route }) {
  const prefix = normalizeBasePath(basePath);
  if (route !== '/sw.js' && route !== '/offline-manifest.json' && !route.startsWith('/offline-shell/')) return null;
  let manifest;
  if (route.startsWith('/offline-shell/')) {
    const id = route.slice('/offline-shell/'.length);
    if (!RELEASE_ID.test(id)) return null;
    try { manifest = readManifest(dataDir, id); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (manifest.basePath !== prefix) return null;
    return { body: readReleaseFile(dataDir, manifest, 'index.html').content, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } };
  }
  manifest = readManifest(dataDir, readActiveId(dataDir));
  if (manifest.basePath !== prefix) throw new Error('离线入口路径与活动版本不一致。');
  const config = { releaseId: manifest.id, workerVersion: hash(template).slice(0, 16), basePath: prefix, shell: prefix + '/', index: prefix + '/index.html', entry: prefix + '/offline-shell/' + manifest.id, assets: manifest.files.filter(file => file.path !== 'index.html').map(file => prefix + '/releases/' + manifest.id + '/' + file.path + '?v=' + file.sha256.slice(0, 10)) };
  if (route === '/offline-manifest.json') return { body: JSON.stringify(config), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } };
  return { body: template.replace('__COTTAGE_OFFLINE_CONFIG__', JSON.stringify(config)), headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': prefix + '/' } };
}
module.exports = { offlineResponse };
