'use strict';
// 公开读取不得接触主人存储；认证发布必须绑定原账号且限制调用范围。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { browser, idle, hash } = require('./cloud-sync.cjs');
const source = fs.readFileSync(path.join(__dirname, '../js/core/cloud-sync.js'), 'utf8');
const publicationId = '11111111-1111-4111-8111-111111111111';
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function isolated(options = {}) {
  const calls = [], location = new URL(options.file ? 'file:///game/index.html' : 'https://game.test/play/visit/' + publicationId);
  let storageAccess = 0;
  const context = vm.createContext({ console, URL, Date, TextEncoder, setTimeout, clearTimeout, document: { currentScript: { src: options.file ? 'file:///game/js/core/cloud-sync.js' : 'https://game.test/play/releases/r-test/js/core/cloud-sync.js' } }, location,
    Game: {}, localStorage: new Proxy({}, { get() { storageAccess++; throw new Error('参观触碰了主人存储'); } }),
    fetch: async (url, request) => { calls.push({ url, request }); return { ok: !options.error, status: options.error || 200, json: async () => options.error ? { code: 'PUBLIC_HOUSE_NOT_FOUND', message: '小屋已经撤下。' } : { houses: [], nextCursor: null } }; }
  });
  context.window = context; vm.runInContext(source, context);
  return { G: context.Game, calls, accesses: () => storageAccess };
}
function accountServer() {
  let signed = false, save = null, held = null;
  const calls = [], reply = (status, data, etag) => ({ ok: status < 400, status, headers: { get: () => etag || null }, json: async () => JSON.parse(JSON.stringify(data)) });
  const session = () => ({ authenticated: true, account: { id: 'child_one', username: 'child_one', displayName: '小小建筑师' }, csrfToken: 'test_csrf', protocol: 1, serverEpoch: 'test_epoch' });
  const server = { calls, hold: false, release: null, async fetch(url, options) {
    const route = new URL(url, 'http://game.test').pathname.replace(/^\/play\/api\/v1/, '');
    calls.push({ route, method: options.method, headers: options.headers });
    if (route === '/session') return reply(200, signed ? session() : { authenticated: false, protocol: 1, serverEpoch: 'test_epoch' });
    if (route === '/register') { signed = true; return reply(200, session()); }
    if (route === '/logout') { signed = false; return reply(200, { ok: true }); }
    if (route === '/save' && options.method === 'GET') return save ? reply(200, { save, revision: 1, serverEpoch: 'test_epoch', updatedAt: 1, contentHash: hash(save) }, '"one"') : reply(404, { code: 'NO_SAVE', serverEpoch: 'test_epoch' });
    if (route === '/save') { save = JSON.parse(options.body).save; return reply(200, { revision: 1, serverEpoch: 'test_epoch', updatedAt: 1, contentHash: hash(save) }, '"one"'); }
    if (route === '/my-publication') {
      if (server.hold) { server.hold = false; await new Promise(resolve => { held = resolve; server.release = resolve; }); }
      return reply(200, { publication: options.method === 'DELETE' ? null : { id: publicationId } });
    }
    throw new Error('unexpected route');
  } }; return server;
}
test('公开参观读取不prepare、不读写存储、不带Cookie或账号凭据', async () => {
  const b = isolated(); await b.G.cloud.requestPublic('/neighbors'); await b.G.cloud.requestPublic('/neighbors/online'); await b.G.cloud.requestPublic('/public-houses/' + publicationId);
  assert.equal(b.accesses(), 0); assert.equal(b.calls.length, 3); assert.ok(b.calls[1].url.endsWith('/api/v1/neighbors/online'));
  for (const call of b.calls) { assert.equal(call.request.credentials, 'omit'); assert.equal(call.request.method, 'GET'); assert.equal(call.request.cache, 'no-store'); assert.deepEqual(Object.keys(call.request.headers).sort(), ['X-MC-Build', 'X-MC-Protocol']); }
});
test('公开请求拒绝私有路径、跨域、危险查询与文件入口', async () => {
  const b = isolated();
  for (const route of ['/save', 'https://other.test/neighbors', '/neighbors?x=1', '/neighbors?cursor=../secret', '/neighbors/online?cursor=secret', '/neighbors/online/extra', '/public-houses/not_an_id']) await assert.rejects(b.G.cloud.requestPublic(route));
  assert.equal(b.calls.length, 0); const file = isolated({ file: true }); await assert.rejects(file.G.cloud.requestPublic('/neighbors')); await assert.rejects(file.G.cloud.requestPublic('/neighbors/online')); assert.equal(file.calls.length, 0);
});
test('公开撤下错误保留状态码，完全不启动主人同步或存储', async () => {
  const b = isolated({ error: 404 }); await assert.rejects(b.G.cloud.requestPublic('/public-houses/' + publicationId), error => error.status === 404 && error.code === 'PUBLIC_HOUSE_NOT_FOUND'); assert.equal(b.accesses(), 0);
});
test('本人发布窄接口只在登录关联后写，自动带认证头且不暴露令牌', async () => {
  const server = accountServer(), b = browser(server); await b.init();
  await assert.rejects(b.G.cloud.requestAccount('/my-publication', 'GET'));
  assert.ok((await b.G.cloud.register({ username: 'child_one', password: 'test_password' })).ok);
  assert.equal((await b.G.cloud.requestAccount('/my-publication', 'DELETE')).publication, null);
  await assert.rejects(b.G.cloud.requestAccount('/my-publication', 'POST', { title: '小屋' }));
  assert.ok((await b.G.cloud.bindLocal()).ok); const result = await b.G.cloud.requestAccount('/my-publication', 'POST', { title: '小屋', displayName: '朋友', expectedRevision: 1 });
  assert.equal(result.publication.id, publicationId); assert.equal(result.csrfToken, undefined);
  const call = server.calls.at(-1); assert.equal(call.headers['X-MC-Account'], 'child_one'); assert.equal(call.headers['X-CSRF-Token'], 'test_csrf');
  assert.equal((await b.G.cloud.requestAccount('/my-publication', 'DELETE')).publication, null); assert.equal(server.calls.at(-1).headers['Content-Type'], 'application/json');
  const count = server.calls.length; await assert.rejects(b.G.cloud.requestAccount('/save', 'PUT', {})); await assert.rejects(b.G.cloud.requestAccount('/my-publication', 'PATCH', {})); assert.equal(server.calls.length, count);
});
test('退出后迟到的本人公开资料请求作废，不影响guest或重新登录', async () => {
  const server = accountServer(), b = browser(server); await b.init(); assert.ok((await b.G.cloud.register({ username: 'child_one', password: 'test_password' })).ok);
  server.hold = true; const pending = b.G.cloud.requestAccount('/my-publication', 'GET'); await idle(); assert.equal(typeof server.release, 'function');
  assert.ok((await b.G.cloud.logout()).ok); server.release(); await assert.rejects(pending, error => error.stale === true); assert.equal(b.status().account, null); assert.equal(b.status().phase, 'guest');
});
(async () => { for (const { name, fn } of tests) { await fn(); console.log('✓ ' + name); } console.log(tests.length + ' 组邻居客户端隔离检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
