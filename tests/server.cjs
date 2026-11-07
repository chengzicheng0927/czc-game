'use strict';

// 全部通过直接 handler 调用和临时目录验证；不创建 HTTP 服务或任何监听端口。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareRelease, activateRelease, readActiveId, listReleases, hash, normalizeBasePath } = require('../server/releases.cjs');
const { createHandler } = require('../server/handler.cjs');
const { parseArgs } = require('../server/cli.cjs');
const project = path.resolve(__dirname, '..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marshmallow-server-'));
const source = path.join(temporary, 'source'), dataDir = path.join(temporary, 'private-data'), prefix = '/cottage';
const originalHtml = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
const assetPaths = [...originalHtml.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)\?v=[a-f0-9]+"/g)].map(match => match[1]);
const uniqueAssets = [...new Set(assetPaths)];
const checks = [];
function test(name, check) { checks.push({ name, check }); }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function copySource(target) {
  write(path.join(target, 'index.html'), originalHtml);
  for (const relative of uniqueAssets) write(path.join(target, relative), fs.readFileSync(path.join(project, relative)));
  write(path.join(target, 'docs/private.md'), 'PRIVATE-DOC-CANARY');
  write(path.join(target, 'child-save.json'), 'PRIVATE-SAVE-CANARY');
  write(path.join(target, '.impeccable/private.json'), 'PRIVATE-REVIEW-CANARY');
}
async function request(handler, url, { method = 'GET', headers = {} } = {}) {
  const response = { status: null, headers: null, body: Buffer.alloc(0), ended: false };
  await handler({ method, url, headers }, {
    writeHead(status, values) { assert.equal(response.status, null, '响应不能重复发送'); response.status = status; response.headers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)])); },
    end(value) { response.ended = true; if (value !== undefined) response.body = Buffer.from(value); }
  });
  assert.equal(response.ended, true);
  assert.ok(response.status);
  return response;
}
function assetUrl(release, relative) { return prefix + '/releases/' + release.id + '/' + relative; }
copySource(source);
let first, second, handler, firstHome, firstStyle;

test('准备白名单 release，保留离线入口，不复制个人数据或文档', () => {
  first = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix });
  assert.equal(fs.readFileSync(path.join(source, 'index.html'), 'utf8'), originalHtml);
  assert.deepEqual(first.files.map(file => file.path).sort(), ['index.html', ...uniqueAssets].sort());
  assert.equal(first.files.length, uniqueAssets.length + 1);
  for (const relative of ['docs/private.md', 'child-save.json', '.impeccable/private.json']) assert.equal(fs.existsSync(path.join(dataDir, 'releases', first.id, relative)), false);
  const published = fs.readFileSync(path.join(dataDir, 'releases', first.id, 'index.html'), 'utf8');
  for (const relative of uniqueAssets) assert.ok(published.includes(assetUrl(first, relative) + '?v='));
  assert.equal(fs.existsSync(path.join(dataDir, 'active.json')), false, '准备不能暗中激活');
  const repeated = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix + '/' });
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.createdAt, first.createdAt, '同内容不能改写旧 release');
});
test('未激活时返回不可用；未知路径保持404', async () => {
  const empty = createHandler({ dataDir: path.join(temporary, 'empty'), basePath: '/' });
  assert.equal((await request(empty, '/')).status, 503);
  assert.equal((await request(empty, '/healthz')).status, 503);
  assert.equal((await request(empty, '/version.json')).status, 503);
  assert.equal((await request(empty, '/docs/private.md')).status, 404);
});
test('激活后入口、健康与版本准确；路径前缀及尾斜杠可用', async () => {
  activateRelease({ dataDir, releaseId: first.id });
  handler = createHandler({ dataDir, basePath: prefix });
  firstHome = await request(handler, prefix + '/');
  assert.equal(firstHome.status, 200);
  assert.equal(firstHome.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(firstHome.headers['cache-control'], 'no-cache');
  assert.ok(firstHome.body.toString().includes(assetUrl(first, uniqueAssets[0])));
  const redirect = await request(handler, prefix);
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, prefix + '/');
  assert.equal((await request(handler, '/')).status, 404);
  assert.equal((await request(handler, prefix + '-other/')).status, 404);
  assert.deepEqual(JSON.parse((await request(handler, prefix + '/healthz')).body), { status: 'ok', releaseId: first.id });
  const version = JSON.parse((await request(handler, prefix + '/version.json')).body);
  assert.equal(version.releaseId, first.id); assert.equal(version.assetCount, uniqueAssets.length); assert.equal(version.basePath, prefix);
  const wrongMount = createHandler({ dataDir, basePath: '/' });
  assert.equal((await request(wrongMount, '/healthz')).status, 503);
});
test('全部真实游戏资源可读，类型正确且按 release 永久缓存', async () => {
  for (const relative of uniqueAssets) {
    const response = await request(handler, assetUrl(first, relative) + '?v=ignored-by-server');
    assert.equal(response.status, 200, relative);
    assert.deepEqual(response.body, fs.readFileSync(path.join(source, relative)), relative);
    assert.equal(response.headers['content-type'], relative.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['content-length'], String(response.body.length));
  }
  firstStyle = await request(handler, assetUrl(first, 'css/building.css'));
});
test('HEAD与GET表示一致，ETag重验证含弱标签和列表', async () => {
  for (const url of [prefix + '/', prefix + '/index.html', assetUrl(first, 'css/building.css'), prefix + '/healthz', prefix + '/version.json', prefix + '/missing']) {
    const get = await request(handler, url), head = await request(handler, url, { method: 'HEAD' });
    assert.equal(head.status, get.status); assert.deepEqual(head.headers, get.headers); assert.equal(head.body.length, 0);
  }
  const unchanged = await request(handler, prefix + '/', { headers: { 'if-none-match': '"other", W/' + firstHome.headers.etag } });
  assert.equal(unchanged.status, 304); assert.equal(unchanged.body.length, 0); assert.equal(unchanged.headers['cache-control'], 'no-cache');
  const cached = await request(handler, assetUrl(first, 'css/building.css'), { method: 'HEAD', headers: { 'if-none-match': firstStyle.headers.etag } });
  assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
  assert.equal((await request(handler, prefix + '/', { headers: { 'if-none-match': '"stale"' } })).status, 200);
});
test('拒绝穿越、双重编码和绝对URL，私有数据及源码无回退暴露', async () => {
  for (const url of [prefix + '/../child-save.json', prefix + '/%2e%2e/child-save.json', prefix + '/%252e%252e/child-save.json', prefix + '/%2fdocs/private.md', prefix + '/%5cdocs/private.md', prefix + '/%00', prefix + '/%xx', '//example.com/', 'https://example.com/cottage/']) {
    const response = await request(handler, url); assert.equal(response.status, 400, url); assert.equal(response.body.toString().includes(temporary), false);
  }
  for (const url of [prefix + '/docs/private.md', prefix + '/child-save.json', prefix + '/active.json', prefix + '/.server-data/active.json', prefix + '/server/cli.cjs', prefix + '/tests/server.cjs', prefix + '/js/core/save.js', prefix + '/releases/' + first.id + '/manifest.json', prefix + '/releases/' + first.id + '/index.html', prefix + '/releases/' + first.id + '/js/unknown.js']) assert.equal((await request(handler, url)).status, 404, url);
  const post = await request(handler, prefix + '/', { method: 'POST' }); assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
  assert.equal((await request(handler, '/' + 'x'.repeat(4100))).status, 414);
});
test('新内容生成新身份，旧release可访问并可显式回滚', async () => {
  const stylePath = path.join(source, 'css/building.css'), changed = Buffer.concat([fs.readFileSync(stylePath), Buffer.from('\n/* release regression */\n')]);
  write(stylePath, changed);
  write(path.join(source, 'index.html'), originalHtml.replace(/css\/building\.css\?v=[a-f0-9]{10}/, 'css/building.css?v=' + hash(changed).slice(0, 10)));
  second = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix });
  assert.notEqual(second.id, first.id);
  assert.equal(readActiveId(dataDir), first.id, '新准备版本不改变活动入口');
  activateRelease({ dataDir, releaseId: second.id });
  const current = await request(handler, prefix + '/');
  assert.notEqual(current.headers.etag, firstHome.headers.etag); assert.ok(current.body.toString().includes(second.id));
  assert.deepEqual((await request(handler, assetUrl(first, 'css/building.css'))).body, firstStyle.body);
  assert.deepEqual((await request(handler, assetUrl(second, 'css/building.css'))).body, changed);
  activateRelease({ dataDir, releaseId: first.id });
  assert.deepEqual((await request(handler, prefix + '/')).body, firstHome.body);
  assert.equal(listReleases(dataDir).length, 2); assert.equal(listReleases(dataDir).find(value => value.id === first.id).active, true);
});
test('根路径发布也可用，release身份绑定挂载位置', async () => {
  const rootRelease = prepareRelease({ sourceRoot: source, dataDir });
  assert.notEqual(rootRelease.id, second.id);
  assert.throws(() => activateRelease({ dataDir, releaseId: rootRelease.id }), /不同 base-path/);
  assert.equal(readActiveId(dataDir), first.id, '跨路径激活失败必须保留当前指针');
  assert.deepEqual((await request(handler, prefix + '/')).body, firstHome.body, '正在运行的原路径入口继续可用');
  assert.equal((await request(handler, prefix + '/healthz')).status, 200);
  const rootData = path.join(temporary, 'root-site-data');
  const isolatedRootRelease = prepareRelease({ sourceRoot: source, dataDir: rootData, basePath: '/' });
  assert.equal(isolatedRootRelease.id, rootRelease.id);
  activateRelease({ dataDir: rootData, releaseId: rootRelease.id });
  const rootHandler = createHandler({ dataDir: rootData });
  assert.equal((await request(rootHandler, '/')).status, 200);
  assert.ok((await request(rootHandler, '/')).body.toString().includes('/releases/' + rootRelease.id + '/'));
  assert.equal((await request(rootHandler, '/releases/' + second.id + '/css/building.css')).status, 404);
});
test('源指纹、外链、缺失文件及越界引用失败时不改变活动版本', () => {
  const bad = path.join(temporary, 'bad-source'); copySource(bad);
  write(path.join(bad, 'css/building.css'), 'incorrect-content');
  assert.throws(() => prepareRelease({ sourceRoot: bad, dataDir, basePath: prefix }), /指纹/);
  copySource(bad); write(path.join(bad, 'index.html'), originalHtml.replace('css/building.css?v=', 'https://example.com/css/building.css?v='));
  assert.throws(() => prepareRelease({ sourceRoot: bad, dataDir, basePath: prefix }), /本地资源/);
  copySource(bad); fs.rmSync(path.join(bad, 'js/building/app.js'));
  assert.throws(() => prepareRelease({ sourceRoot: bad, dataDir, basePath: prefix }), /ENOENT/);
  copySource(bad); write(path.join(bad, 'index.html'), originalHtml.replace('css/building.css?v=', '../private.css?v='));
  assert.throws(() => prepareRelease({ sourceRoot: bad, dataDir, basePath: prefix }), /本地资源/);
  assert.equal(readActiveId(dataDir), first.id);
  assert.throws(() => prepareRelease({ sourceRoot: source, dataDir: source, basePath: prefix }), /源码根目录/);
});
test('源文件和release符号链接不能逃逸，损坏版本不能激活或被覆写', async () => {
  const linked = path.join(temporary, 'linked-source'); copySource(linked);
  const css = path.join(linked, 'css/building.css'); fs.rmSync(css); fs.symlinkSync(path.join(project, 'css/building.css'), css);
  assert.throws(() => prepareRelease({ sourceRoot: linked, dataDir, basePath: prefix }), /符号链接/);
  const badData = path.join(temporary, 'linked-data'); fs.mkdirSync(badData); fs.symlinkSync(path.join(dataDir, 'releases'), path.join(badData, 'releases'));
  assert.throws(() => prepareRelease({ sourceRoot: source, dataDir: badData, basePath: prefix }), /符号链接/);
  const target = path.join(dataDir, 'releases', second.id, 'css/building.css');
  const saved = fs.readFileSync(target); fs.rmSync(target); fs.symlinkSync(path.join(source, 'child-save.json'), target);
  const refused = await request(handler, assetUrl(second, 'css/building.css')); assert.equal(refused.status, 503); assert.equal(refused.body.toString().includes('PRIVATE'), false);
  assert.throws(() => activateRelease({ dataDir, releaseId: second.id }), /符号链接/); assert.equal(readActiveId(dataDir), first.id);
  fs.rmSync(target); write(target, 'tampered');
  assert.throws(() => prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }), /指纹/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'tampered', '不能覆盖损坏的已有release');
  write(target, saved);
});
test('配置与CLI输入明确验证，serve缺host/port时不能进入监听', () => {
  for (const value of ['cottage', '//cottage', '/a/../b', '/a%20b', '/a?x=1', '/a#b']) assert.throws(() => normalizeBasePath(value));
  assert.equal(normalizeBasePath('/cottage/'), prefix);
  assert.throws(() => createHandler({ dataDir: '' }), /data-dir/);
  for (const argv of [['serve'], ['serve', '--port', '8080'], ['serve', '--host', '127.0.0.1'], ['serve', '--host', '127.0.0.1', '--port', '0'], ['serve', '--host', '127.0.0.1', '--port', '65536'], ['prepare', '--activate', '--activate'], ['prepare', '--data-dir'], ['list', '--host', '127.0.0.1'], ['activate', '../escape'], ['unknown']]) {
    if (argv[0] === 'activate') assert.throws(() => activateRelease({ dataDir, releaseId: argv[1] }), /无效/);
    else assert.throws(() => parseArgs(argv), argv.join(' '));
  }
  const options = parseArgs(['serve', '--host', '127.0.0.1', '--port', '8080', '--base-path', prefix]);
  assert.equal(options.options.host, '127.0.0.1'); assert.equal(options.options.port, '8080');
  assert.equal(parseArgs(['prepare', '--activate']).options.activate, true);
});

(async () => {
  let passed = 0;
  try {
    for (const { name, check } of checks) { await check(); passed++; process.stdout.write('✓ ' + name + '\n'); }
    process.stdout.write('server: ' + passed + ' 组通过（无监听）\n');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
