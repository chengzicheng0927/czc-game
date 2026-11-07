'use strict';
// 两个同步客户端和匿名参观通过真实HTTP处理器／临时SQLite，均不监听端口。
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { prepareRelease, activateRelease } = require('../server/releases.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { browser } = require('./cloud-sync.cjs');
const root = path.resolve(__dirname, '..'), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-neighbors-e2e-')), origin = 'http://game.test', basePath = '/play';
let api, groups = 0;
function transport() {
  let cookie = '';
  const calls = [];
  return { calls, async fetch(url, options) {
    const target = new URL(url, origin), route = target.pathname.slice((basePath + '/api/v1').length), method = options.method || 'GET';
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (cookie && options.credentials !== 'omit') headers.cookie = cookie;
    if (method !== 'GET') headers.origin = origin;
    const body = options.body || ''; if (body) headers['content-length'] = String(Buffer.byteLength(body));
    const req = Readable.from(body ? [Buffer.from(body)] : []); Object.assign(req, { method, url: basePath + '/api/v1' + route + target.search, headers, socket: { remoteAddress: '127.0.0.1' } });
    let status, responseHeaders, responseBody;
    await api.handle(req, { writeHead(code, values) { status = code; responseHeaders = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); }, end(value) { responseBody = value; } }, route);
    if (responseHeaders['set-cookie'] && options.credentials !== 'omit') cookie = String(responseHeaders['set-cookie']).split(';')[0];
    const data = JSON.parse(Buffer.from(responseBody || '').toString()); calls.push({ route, method, status, hasCookie: !!headers.cookie });
    return { ok: status < 400, status, headers: { get: key => responseHeaders[key.toLowerCase()] || null }, json: async () => data };
  } };
}
async function check(name, fn) { await fn(); groups++; console.log('✓ ' + name); }
(async () => {
  try {
    const release = prepareRelease({ sourceRoot: root, dataDir, basePath }); activateRelease({ dataDir, releaseId: release.id }); api = createCloudApi({ dataDir, basePath, origin });
    const netA = transport(), netB = transport(), a = browser(netA, { buildId: release.id }), b = browser(netB, { buildId: release.id });
    let publication, snapshot;
    await a.init(); await b.init();
    await check('两个孩子绑定云档后小屋默认公开，匿名读取无需主人凭据且不含账号信息', async () => {
      for (const [client, username] of [[a, 'public_alice'], [b, 'private_bob']]) { assert.ok((await client.G.cloud.register({ username, password: 'only_for_test_neighbors' })).ok); assert.ok((await client.G.cloud.bindLocal()).ok); }
      const list = await a.G.cloud.requestPublic('/neighbors'); assert.equal(list.houses.length, 2); assert.equal(netA.calls.at(-1).hasCookie, false);
      for (const secret of ['public_alice', 'private_bob', a.status().account.id, b.status().account.id]) assert.equal(JSON.stringify(list).includes(secret), false, '公开列表泄露：' + secret);
    });
    await check('明确发布从当前已存云档生成投影，公开内容不包含私密字段或账号', async () => {
      a.G.store.update(state => { state.profile.name = 'secret_real_name'; state.profile.birthday = '02-03'; state.wallet.coin = 567890; state.memories.push({ at: Date.now(), text: 'secret_private_memory' }); }, { persist: true });
      assert.ok((await a.G.cloud.syncNow()).ok); const result = await a.G.cloud.requestAccount('/my-publication', 'POST', { title: '云朵小屋', displayName: '小云朵', expectedRevision: a.status().remote.revision }); publication = result.publication;
      const detail = await b.G.cloud.requestPublic('/public-houses/' + publication.id); snapshot = detail.snapshot; const json = JSON.stringify(detail);
      for (const secret of ['secret_real_name', '02-03', '567890', 'secret_private_memory', 'public_alice', a.status().account.id]) assert.equal(json.includes(secret), false);
      assert.equal(detail.house.title, '云朵小屋'); assert.equal(detail.snapshot.house.name, '云朵小屋'); assert.equal(netB.calls.at(-1).hasCookie, false);
    });
    await check('构造参观状态不改变主人内存、本机JSON、元数据或SQLite修订', async () => {
      const stateBefore = JSON.stringify(b.state()), memoryBefore = [...b.memory.entries()].sort(), rowBefore = api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(b.status().account.id);
      vm.runInContext(fs.readFileSync(path.join(root, 'js/core/public-house.js'), 'utf8'), b.context);
      const viewed = b.G.publicHouse.materialize(snapshot); assert.equal(viewed.house.name, '云朵小屋'); assert.equal(JSON.stringify(b.state()), stateBefore); assert.deepEqual([...b.memory.entries()].sort(), memoryBefore);
      assert.deepEqual(api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(b.status().account.id), rowBefore);
    });
    await check('云同步后公开小屋自动跟随新布置且沿用原名；主动更新才改名', async () => {
      a.G.store.update(state => { state.house.exterior.roofColor = '#BFE3FF'; }, { persist: true }); assert.ok((await a.G.cloud.syncNow()).ok);
      const followed = await b.G.cloud.requestPublic('/public-houses/' + publication.id); assert.equal(followed.snapshot.house.exterior.roofColor, '#BFE3FF'); assert.equal(followed.house.id, publication.id); assert.equal(followed.house.title, publication.title);
      const update = await a.G.cloud.requestAccount('/my-publication', 'POST', { title: '新的云朵屋', displayName: '小云朵', expectedRevision: a.status().remote.revision }); assert.equal(update.publication.id, publication.id);
      assert.equal((await b.G.cloud.requestPublic('/public-houses/' + publication.id)).snapshot.house.exterior.roofColor, '#BFE3FF');
    });
    await check('撤下后列表与原详情失效，私人小屋和后端重启均正常', async () => {
      const privateBefore = api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(a.status().account.id);
      assert.equal((await a.G.cloud.requestAccount('/my-publication', 'DELETE')).ok, true); assert.equal((await b.G.cloud.requestPublic('/neighbors')).houses.some(house => house.id === publication.id), false);
      await assert.rejects(b.G.cloud.requestPublic('/public-houses/' + publication.id), error => error.status === 404);
      assert.deepEqual(api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(a.status().account.id), privateBefore);
      await api.close(); api = createCloudApi({ dataDir, basePath, origin }); assert.equal((await a.G.cloud.requestAccount('/my-publication', 'GET')).publication, null); assert.ok((await a.G.cloud.syncNow()).ok);
    });
    console.log(groups + ' 组邻居/同步客户端/真实SQLite集成检查通过。');
  } finally { if (api) await api.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
