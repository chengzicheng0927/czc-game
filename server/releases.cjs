'use strict';

// 发布只复制入口明确引用的文件；私有数据和源码目录不作为 HTTP 根目录。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RELEASE_ID = /^r-[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const ASSET_PATH = /^(?:js\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js|css\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.css)$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function normalizeBasePath(value = '/') {
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*\/?$/.test(value) || value.includes('//')) throw new Error('base-path 必须是 / 或 /cottage 这样的路径，不能含查询、编码或点段。');
  return value === '/' ? '' : value.replace(/\/$/, '');
}
function dataRoot(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('需要明确的 data-dir。');
  return path.resolve(value);
}
function mimeFor(file) { return MIME[path.extname(file)]; }
function ensureDirectory(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { fs.mkdirSync(current, { mode: 0o750 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink()) throw new Error('发布目录不能是符号链接或特殊文件。');
  }
}
function readSafeFile(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i] === '.' || parts[i] === '..' || parts[i].includes('\\')) throw new Error('文件路径无效。');
    current = path.join(current, parts[i]);
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw new Error('发布文件不能是符号链接或特殊文件。');
  }
  return fs.readFileSync(current);
}
function sourceAssets(html) {
  const references = [];
  const tags = /<(script|link)\b[^>]*>/gi;
  let tag;
  while ((tag = tags.exec(html))) {
    const attrs = Object.create(null), attrPattern = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(["'])(.*?)\2/gs;
    let attr;
    while ((attr = attrPattern.exec(tag[0]))) {
      const name = attr[1].toLowerCase();
      if (Object.hasOwn(attrs, name)) throw new Error('入口资源标签含重复属性。');
      attrs[name] = { value: attr[3], offset: tag.index + attr.index + attr[0].indexOf(attr[2]) + 1 };
    }
    const isScript = tag[1].toLowerCase() === 'script';
    if (!isScript && attrs.rel?.value.toLowerCase() !== 'stylesheet') continue;
    const reference = attrs[isScript ? 'src' : 'href'];
    if (!reference) throw new Error('资源标签缺少明确的本地 src/href，不支持内联脚本。');
    const match = /^(.*?)\?v=([a-f0-9]{10})$/.exec(reference.value);
    if (!match || !ASSET_PATH.test(match[1]) || (isScript ? !match[1].endsWith('.js') : !match[1].endsWith('.css'))) throw new Error('入口只能引用带内容指纹的 js/ 或 css/ 本地资源。');
    references.push({ ...reference, path: match[1], fingerprint: match[2] });
  }
  if (!references.length) throw new Error('入口没有可发布的本地资源。');
  return references;
}
function readManifest(dataDir, releaseId) {
  if (!RELEASE_ID.test(releaseId || '')) throw new Error('release-id 无效。');
  const root = dataRoot(dataDir);
  const raw = readSafeFile(root, 'releases/' + releaseId + '/manifest.json');
  if (raw.length > 1024 * 1024) throw new Error('发布清单过大。');
  const manifest = JSON.parse(raw);
  if (!manifest || manifest.format !== 1 || manifest.id !== releaseId || !HASH.test(manifest.sourceIndexSha256 || '') || normalizeBasePath(manifest.basePath || '/') !== manifest.basePath || !Array.isArray(manifest.files) || manifest.files.length < 2 || manifest.files.length > 2000) throw new Error('发布清单格式无效。');
  const seen = new Set();
  for (const file of manifest.files) {
    if (!file || (file.path !== 'index.html' && !ASSET_PATH.test(file.path || '')) || seen.has(file.path) || !HASH.test(file.sha256 || '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 20 * 1024 * 1024) throw new Error('发布清单文件条目无效。');
    seen.add(file.path);
  }
  if (!seen.has('index.html')) throw new Error('发布清单缺少入口。');
  const identity = { format: 1, basePath: manifest.basePath, sourceIndexSha256: manifest.sourceIndexSha256, assets: manifest.files.filter(file => file.path !== 'index.html').map(file => ({ path: file.path, sha256: file.sha256, bytes: file.bytes })) };
  if ('r-' + hash(JSON.stringify(identity)) !== releaseId) throw new Error('发布清单与 release 身份不一致。');
  return manifest;
}
function readReleaseFile(dataDir, manifest, relative) {
  const entry = manifest.files.find(file => file.path === relative);
  if (!entry) return null;
  const content = readSafeFile(dataRoot(dataDir), 'releases/' + manifest.id + '/' + relative);
  if (content.length !== entry.bytes || hash(content) !== entry.sha256) throw new Error('发布文件与内容指纹不一致。');
  if (relative === 'index.html') {
    let original = content.toString('utf8');
    for (const file of manifest.files.filter(value => value.path !== 'index.html')) original = original.split(manifest.basePath + '/releases/' + manifest.id + '/' + file.path + '?v=' + file.sha256.slice(0, 10)).join(file.path + '?v=' + file.sha256.slice(0, 10));
    if (hash(Buffer.from(original)) !== manifest.sourceIndexSha256) throw new Error('发布入口与源入口身份不一致。');
  }
  return { entry, content };
}
function verifyRelease(dataDir, releaseId) {
  const manifest = readManifest(dataDir, releaseId);
  for (const file of manifest.files) readReleaseFile(dataDir, manifest, file.path);
  return manifest;
}
function prepareRelease({ sourceRoot, dataDir, basePath = '/' }) {
  const source = fs.realpathSync(path.resolve(sourceRoot)), configuredRoot = dataRoot(dataDir), prefix = normalizeBasePath(basePath);
  fs.mkdirSync(configuredRoot, { recursive: true, mode: 0o750 });
  const root = fs.realpathSync(configuredRoot);
  if (source === root || source.startsWith(root + path.sep)) throw new Error('data-dir 不能等于或包含源码根目录。');
  const sourceIndex = readSafeFile(source, 'index.html'), html = sourceIndex.toString('utf8'), refs = sourceAssets(html), assets = new Map();
  for (const ref of refs) {
    if (assets.has(ref.path)) { if (assets.get(ref.path).sha256.slice(0, 10) !== ref.fingerprint) throw new Error('重复资源引用的指纹不一致：' + ref.path); continue; }
    const content = readSafeFile(source, ref.path), sha256 = hash(content);
    if (sha256.slice(0, 10) !== ref.fingerprint) throw new Error('资源指纹未同步：' + ref.path);
    if (ref.path.endsWith('.css') && /url\s*\(|@import\b/i.test(content.toString('utf8'))) throw new Error('CSS 新增资源引用需要先扩展发布清单：' + ref.path);
    assets.set(ref.path, { content, sha256, bytes: content.length });
  }
  // 发布身份绑定入口、全部资源和挂载路径；旧 release 永远不改写。
  const identity = { format: 1, basePath: prefix, sourceIndexSha256: hash(sourceIndex), assets: [...assets].map(([assetPath, asset]) => ({ path: assetPath, sha256: asset.sha256, bytes: asset.bytes })) };
  const id = 'r-' + hash(JSON.stringify(identity));
  let publishedHtml = html;
  for (const ref of refs.slice().reverse()) {
    const replacement = prefix + '/releases/' + id + '/' + ref.path + '?v=' + ref.fingerprint;
    publishedHtml = publishedHtml.slice(0, ref.offset) + replacement + publishedHtml.slice(ref.offset + ref.value.length);
  }
  const publishedIndex = Buffer.from(publishedHtml);
  const files = [{ path: 'index.html', sha256: hash(publishedIndex), bytes: publishedIndex.length }, ...[...assets].map(([assetPath, asset]) => ({ path: assetPath, sha256: asset.sha256, bytes: asset.bytes }))];
  ensureDirectory(root, 'releases');
  const destination = path.join(root, 'releases', id);
  if (fs.existsSync(destination)) {
    const existing = verifyRelease(root, id);
    if (existing.basePath !== prefix || JSON.stringify(existing.files) !== JSON.stringify(files)) throw new Error('已有 release 内容不一致，已拒绝覆盖。');
    return existing;
  }
  const staging = fs.mkdtempSync(path.join(root, 'releases', '.prepare-'));
  const manifest = { format: 1, id, basePath: prefix, sourceIndexSha256: identity.sourceIndexSha256, createdAt: new Date().toISOString(), files };
  try {
    for (const [relative, content] of [['index.html', publishedIndex], ...[...assets].map(([assetPath, asset]) => [assetPath, asset.content])]) {
      const target = path.join(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 });
      fs.writeFileSync(target, content, { flag: 'wx', mode: 0o640 });
    }
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o640 });
    fs.renameSync(staging, destination);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  return verifyRelease(root, id);
}
function readActiveId(dataDir) {
  const value = JSON.parse(readSafeFile(dataRoot(dataDir), 'active.json'));
  if (!value || !RELEASE_ID.test(value.releaseId || '')) throw new Error('活动 release 指针无效。');
  return value.releaseId;
}
function activateRelease({ dataDir, releaseId }) {
  const root = dataRoot(dataDir), manifest = verifyRelease(root, releaseId);
  // 活动站点的挂载路径也是对外约定；遗漏参数不能把正在运行的入口切成 503。
  let previousId = null;
  try { previousId = readActiveId(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previousId !== null && readManifest(root, previousId).basePath !== manifest.basePath) throw new Error('不能在同一 data-dir 激活不同 base-path；迁移路径请使用新的 data-dir。');
  const temporary = path.join(root, '.active-' + crypto.randomUUID() + '.json');
  try {
    fs.writeFileSync(temporary, JSON.stringify({ releaseId }) + '\n', { flag: 'wx', mode: 0o640 });
    fs.renameSync(temporary, path.join(root, 'active.json'));
  } finally { fs.rmSync(temporary, { force: true }); }
  return manifest;
}
function listReleases(dataDir) {
  const root = dataRoot(dataDir);
  let active = null;
  try { active = readActiveId(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let names;
  try { names = fs.readdirSync(path.join(root, 'releases')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return names.filter(name => RELEASE_ID.test(name)).sort().map(id => {
    const manifest = readManifest(root, id);
    return { id, active: id === active, basePath: manifest.basePath || '/', createdAt: manifest.createdAt, files: manifest.files.length };
  });
}
module.exports = { RELEASE_ID, ASSET_PATH, hash, normalizeBasePath, dataRoot, mimeFor, sourceAssets, prepareRelease, readManifest, readReleaseFile, verifyRelease, readActiveId, activateRelease, listReleases };
