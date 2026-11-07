'use strict';
// 两个独立浏览器VM连接真正的账号HTTP处理器与临时SQLite；不监听端口，不使用真实小屋。
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { prepareRelease, activateRelease } = require('../server/releases.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { browser } = require('./cloud-sync.cjs');
const root = path.resolve(__dirname, '..'), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cloud-e2e-'));
const origin = 'http://game.test', basePath = '/play', credentials = { username: 'alice_e2e', password: 'only_for_local_test' };
let groups = 0, api;
function transport() {
  let cookies = '', online = true;
  const calls = [];
  return { calls, online(value) { online = value; }, async fetch(url, options) {
    if (!online) throw new TypeError('offline');
    const route = new URL(url, origin).pathname.slice((basePath + '/api/v1').length), method = options.method || 'GET';
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (cookies) headers.cookie = cookies;
    if (method !== 'GET' && method !== 'HEAD') headers.origin = origin;
    const text = options.body || ''; if (text) headers['content-length'] = String(Buffer.byteLength(text));
    const request = Readable.from(text ? [Buffer.from(text)] : []); Object.assign(request, { method, headers, socket: { remoteAddress: '127.0.0.1' } });
    let status, responseHeaders, body;
    await api.handle(request, { writeHead(code, values) { status = code; responseHeaders = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); }, end(value) { body = value; } }, route);
    if (responseHeaders['set-cookie']) cookies = String(responseHeaders['set-cookie']).split(';')[0];
    const json = JSON.parse(Buffer.from(body || '').toString()); calls.push({ route, method, status });
    return { ok: status < 400, status, headers: { get: name => responseHeaders[name.toLowerCase()] || null }, json: async () => json };
  } };
}
function currentAccount(username) { return api.store.db.prepare('SELECT id FROM accounts WHERE username=?').get(username).id; }
function saved(username) { const row = api.store.db.prepare('SELECT * FROM saves WHERE account_id=?').get(currentAccount(username)); return row && { ...row, save: JSON.parse(row.json) }; }
async function settle(predicate) { for (let i = 0; i < 60; i++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); } assert.ok(predicate(), '真实API同步未按预期结束'); }
async function check(name, fn) { await fn(); groups++; console.log('✓ ' + name); }
(async () => {
  try {
    const release = prepareRelease({ sourceRoot: root, dataDir, basePath }); activateRelease({ dataDir, releaseId: release.id });
    api = createCloudApi({ dataDir, basePath, origin });
    const networkA = transport(), networkB = transport();
    let a = browser(networkA, { buildId: release.id }), b;
    await check('真实账号注册不覆盖已有游客小屋，明确绑定后完整JSON进入SQLite', async () => {
      await a.init(); a.update('游客留下的家', 421); assert.ok((await a.G.cloud.register(credentials)).ok); assert.equal(a.status().phase, 'choose'); assert.equal(saved(credentials.username), undefined);
      assert.ok((await a.G.cloud.bindLocal()).ok); assert.equal(saved(credentials.username).save.wallet.coin, 421); assert.equal(a.state().house.name, '游客留下的家');
    });
    await check('普通操作成功落盘后自动上传，独立第二设备登录并恢复完整进度', async () => {
      a.update('今天新布置的家', 511); await a.advance(1500); await settle(() => saved(credentials.username).save.wallet.coin === 511);
      b = browser(networkB, { buildId: release.id }); await b.init(); b.update('第二设备原单机', 322);
      assert.ok((await b.G.cloud.login(credentials)).ok); assert.equal(b.status().phase, 'choose'); assert.equal(b.state().wallet.coin, 322);
      assert.ok((await b.G.cloud.useCloud()).ok); assert.equal(b.state().wallet.coin, 511); assert.equal(b.state().house.name, '今天新布置的家');
    });
    await check('第二设备更新后，未分叉的第一设备自动接上新的SQLite修订', async () => {
      b.update('第二设备继续布置', 612); assert.ok((await b.G.cloud.syncNow()).ok); assert.ok((await a.G.cloud.syncNow()).ok);
      assert.equal(a.state().wallet.coin, 612); assert.equal(a.state().house.name, '第二设备继续布置');
    });
    await check('断网重开保留本机进度，重新连接发现分叉时不覆盖任一设备', async () => {
      networkA.online(false); a.update('设备甲离线新进度', 713); await a.G.cloud.syncNow(); const memory = a.memory;
      await a.event('pagehide'); a = browser(networkA, { buildId: release.id, memory }); await a.init(); assert.equal(a.state().wallet.coin, 713);
      b.update('设备乙另一份进度', 814); assert.ok((await b.G.cloud.syncNow()).ok);
      networkA.online(true); await a.event('online'); await settle(() => a.status().phase === 'conflict');
      assert.equal(a.state().wallet.coin, 713); assert.equal(saved(credentials.username).save.wallet.coin, 814);
      assert.ok((await a.G.cloud.resolveConflict('cloud')).ok); assert.equal(a.state().wallet.coin, 814);
      assert.ok(a.G.cloud.downloadBackup('recovery').ok); assert.equal(JSON.parse(a.downloads.at(-1).value).wallet.coin, 713);
    });
    await check('另一个孩子新建独立小屋，两个账号及游客进度都能再继续', async () => {
      const bob = { username: 'bob_e2e', password: 'only_for_local_test' };
      assert.ok((await a.G.cloud.register(bob)).ok); assert.equal(a.status().phase, 'choose'); assert.ok((await a.G.cloud.startNew()).ok);
      assert.equal(a.state().wallet.coin, 300); assert.equal(Object.keys(a.state().house.rooms).length, 0); a.update('小宝自己的家', 355); assert.ok((await a.G.cloud.syncNow()).ok);
      assert.equal(saved('alice_e2e').save.wallet.coin, 814); assert.equal(saved('bob_e2e').save.wallet.coin, 355);
      assert.ok((await a.G.cloud.logout()).ok); assert.equal(a.state().wallet.coin, 421); assert.equal(a.state().house.name, '游客留下的家');
      assert.ok((await a.G.cloud.login(credentials)).ok); assert.equal(a.state().wallet.coin, 814); assert.equal(a.status().binding, true);
    });
    await check('本机JSON与云端JSON均可导出，服务端重开仍有两个孩子的完整进度', async () => {
      const own = JSON.parse(a.G.save.exportJson()); assert.equal(own.wallet.coin, 814); assert.ok((await a.G.cloud.downloadCloud()).ok); assert.equal(JSON.parse(a.downloads.at(-1).value).wallet.coin, 814);
      await api.close(); api = createCloudApi({ dataDir, basePath, origin }); assert.equal(saved('alice_e2e').save.wallet.coin, 814); assert.equal(saved('bob_e2e').save.wallet.coin, 355);
      assert.ok((await a.G.cloud.syncNow()).ok); assert.equal(a.status().phase, 'ready');
    });
    console.log(groups + ' 组账号/真实SQLite/双设备端到端检查通过（流式HTTP，无监听）。');
  } finally { if (api) await api.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
