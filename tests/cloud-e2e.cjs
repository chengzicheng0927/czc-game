'use strict';
// 两个独立浏览器VM连接真正的账号HTTP处理器与临时SQLite；不监听端口，不使用真实小屋。
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { prepareRelease, activateRelease, hash: storedHash } = require('../server/releases.cjs');
const { createCloudApi, etagFor } = require('../server/cloud-api.cjs');
const { browser, canonical, hash: canonicalHash } = require('./cloud-sync.cjs');
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
    const json = JSON.parse(Buffer.from(body || '').toString()); calls.push({ route, method, status, etag: responseHeaders.etag || null, ifMatch: headers['if-match'] || null });
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
      assert.equal(a.state().building.schema, 2);
      a.G.store.update(state => { state.building = a.context.CottageBuilding.executeCommand(state.building, { type: 'wall.add', wall: { id: 'e2e_free_wall', floorId: state.building.floors[0].id, start: { x: -3, z: -2 }, end: { x: 2, z: 1 }, height: 2.8, thickness: .16, color: '#F4DDE7' } }); }, { persist: true });
      assert.ok((await a.G.cloud.bindLocal()).ok); assert.equal(saved(credentials.username).save.wallet.coin, 421); assert.equal(a.state().house.name, '游客留下的家');
      assert.deepEqual(saved(credentials.username).save.building, a.state().building);
    });
    await check('普通操作成功落盘后自动上传，独立第二设备登录并恢复完整进度', async () => {
      a.update('今天新布置的家', 511); await a.advance(1500); await settle(() => saved(credentials.username).save.wallet.coin === 511);
      b = browser(networkB, { buildId: release.id }); await b.init(); b.update('第二设备原单机', 322);
      assert.ok((await b.G.cloud.login(credentials)).ok); assert.equal(b.status().phase, 'choose'); assert.equal(b.state().wallet.coin, 322);
      assert.ok((await b.G.cloud.useCloud()).ok); assert.equal(b.state().wallet.coin, 511); assert.equal(b.state().house.name, '今天新布置的家');
      assert.deepEqual(b.state().building, a.state().building, '第二设备恢复完整的新建筑文档');
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
      assert.equal(a.state().wallet.coin, 300); assert.equal(Object.keys(a.state().house.rooms).length, 0);
      assert.equal(a.state().building.schema, 2); assert.equal(a.state().building.walls.length, 0); assert.equal(a.state().building.furniture.length, 0);
      a.update('小宝自己的家', 355); assert.ok((await a.G.cloud.syncNow()).ok);
      assert.equal(saved('alice_e2e').save.wallet.coin, 814); assert.equal(saved('bob_e2e').save.wallet.coin, 355);
      assert.ok((await a.G.cloud.logout()).ok); assert.equal(a.state().wallet.coin, 421); assert.equal(a.state().house.name, '游客留下的家');
      assert.ok((await a.G.cloud.login(credentials)).ok); assert.equal(a.state().wallet.coin, 814); assert.equal(a.status().binding, true);
    });
    await check('本机JSON与云端JSON均可导出，服务端重开仍有两个孩子的完整进度', async () => {
      const own = JSON.parse(a.G.save.exportJson()); assert.equal(own.wallet.coin, 814); assert.ok((await a.G.cloud.downloadCloud()).ok); assert.equal(JSON.parse(a.downloads.at(-1).value).wallet.coin, 814);
      await api.close(); api = createCloudApi({ dataDir, basePath, origin }); assert.equal(saved('alice_e2e').save.wallet.coin, 814); assert.equal(saved('bob_e2e').save.wallet.coin, 355);
      assert.ok((await a.G.cloud.syncNow()).ok); assert.equal(a.status().phase, 'ready');
    });
    const oldCredentials = { username: 'legacy_sqlite_e2e', password: 'only_for_legacy_local_test' };
    let oldJson, oldHash, oldEtag, oldAccountId, legacyClient, legacyNetwork;
    const oldRevision = 7;
    await check('真实旧SQLite原始JSON通过GET归一化摘要恢复，读取和自动公开不覆盖旧行或历史', async () => {
      const registration = browser(transport(), { buildId: release.id }); await registration.init();
      assert.ok((await registration.G.cloud.register(oldCredentials)).ok);
      oldAccountId = currentAccount(oldCredentials.username);
      const legacy = registration.state(); delete legacy.building; delete legacy.observatory.built;
      legacy.house.name = '升级前保存的小屋'; legacy.wallet.coin = 842;
      legacy.profile.name = 'PRIVATE_LEGACY_PROFILE'; legacy.profile.birthday = '07-12'; legacy.inventory.bed_basic = 0;
      legacy.house.floors = [{ slots: ['legacy_sqlite_room', null, null] }];
      legacy.house.rooms = { legacy_sqlite_room: { type: 'bedroom', paidPrice: 0,
        wallpaper: { pattern: 'solid', color: '#FFE3C9', color2: '#FFFFFF' }, floor: { pattern: 'wood', color: '#EED7B9' }, light: 'warm',
        items: [{ uid: 'legacy_sqlite_bed', defId: 'bed_basic', x: 24, y: 130, z: 1, flip: false, color: null, parent: null, depth: .75 }] } };
      const wish = registration.G.data.residents.find(resident => resident.id === 'lily').wishes[0];
      legacy.residents.lily = { movedIn: true, roomId: 'legacy_sqlite_room', affection: 22, happiness: 58, heartBubbles: 1,
        lastBubbleAt: new Date(2026, 9, 29, 12).getTime(), patsToday: 0, interactDate: '2026-10-29', patDate: '2026-10-29', giftDate: '',
        wish: { date: '2026-10-29', defId: wish.id, generatedAt: new Date(2026, 9, 29, 12).getTime(), baseline: 0, claimed: false }, wishLastClaimedDate: '', friendshipClaims: [], bestFriendBadge: false };
      // 直接写入升级前原始行及原始摘要，不经过新服务器写接口或迁移后的JSON。
      oldJson = canonical(legacy); oldHash = storedHash(oldJson);
      assert.ok(!Object.hasOwn(JSON.parse(oldJson), 'building'));
      assert.ok(!Object.hasOwn(JSON.parse(oldJson).observatory, 'built'));
      const updatedAt = Date.now() - 10000;
      api.store.db.prepare('INSERT INTO saves(account_id,revision,json,content_hash,updated_at) VALUES (?,?,?,?,?)').run(oldAccountId, oldRevision, oldJson, oldHash, updatedAt);
      api.store.db.prepare('INSERT INTO versions(account_id,revision,json,content_hash,updated_at) VALUES (?,?,?,?,?)').run(oldAccountId, oldRevision, oldJson, oldHash, updatedAt);
      const original = saved(oldCredentials.username);
      oldEtag = etagFor(api.store.epoch(), original);
      assert.ok((await registration.G.cloud.logout()).ok);
      legacyNetwork = transport(); legacyClient = browser(legacyNetwork, { buildId: release.id }); await legacyClient.init();
      const loggedIn = await legacyClient.G.cloud.login(oldCredentials); assert.ok(loggedIn.ok, loggedIn.message);
      assert.equal(legacyClient.status().phase, 'choose');
      const rawResponse = await legacyNetwork.fetch(origin + basePath + '/api/v1/save', { headers: { 'X-MC-Protocol': '1', 'X-MC-Build': release.id, 'X-MC-Account': oldAccountId } });
      assert.equal(rawResponse.status, 200); const body = await rawResponse.json();
      assert.equal(body.save.building.schema, 2); assert.equal(body.save.observatory.built, false);
      assert.equal(body.contentHash, canonicalHash(body.save)); assert.notEqual(body.contentHash, oldHash);
      assert.equal(body.revision, oldRevision); assert.equal(body.updatedAt, updatedAt); assert.equal(rawResponse.headers.get('etag'), oldEtag);
      const publication = await legacyClient.G.cloud.requestAccount('/my-publication'); assert.ok(publication.publication);
      const publicRow = api.store.db.prepare('SELECT * FROM publications WHERE account_id=?').get(oldAccountId), publicSnapshot = JSON.parse(publicRow.snapshot_json);
      assert.equal(publicRow.source_revision, oldRevision); assert.equal(publicRow.room_count, 1); assert.equal(publicSnapshot.building.schema, 2);
      assert.ok(!JSON.stringify(publicSnapshot).includes('PRIVATE_LEGACY_PROFILE')); assert.equal(publicSnapshot.building.migration, undefined);
      assert.ok((await legacyClient.G.cloud.downloadCloud(oldRevision)).ok);
      assert.equal(JSON.parse(legacyClient.downloads.at(-1).value).building.schema, 2);
      const restored = await legacyClient.G.cloud.useCloud(); assert.ok(restored.ok, restored.message);
      assert.equal(legacyClient.state().wallet.coin, 842); assert.equal(legacyClient.state().profile.name, 'PRIVATE_LEGACY_PROFILE');
      assert.deepEqual(legacyClient.state().building.furniture.map(item => item.id), ['legacy_sqlite_bed']);
      assert.equal(legacyClient.state().residents.lily.affection, 22); assert.equal(legacyClient.status().binding, true);
      const unchanged = saved(oldCredentials.username);
      for (const field of ['json', 'revision', 'content_hash', 'updated_at']) assert.equal(unchanged[field], original[field], field);
      const history = api.store.db.prepare('SELECT * FROM versions WHERE account_id=? AND revision=?').get(oldAccountId, oldRevision);
      assert.equal(history.json, oldJson); assert.equal(history.content_hash, oldHash);
      assert.equal(legacyNetwork.calls.filter(call => call.method === 'PUT').length, 0, '读取或恢复不应偷偷迁移数据库');
    });
    await check('玩家正常保存才使用原ETag产生新修订，旧JSON历史保留且另一设备分叉受保护', async () => {
      const other = browser(transport(), { buildId: release.id }); await other.init();
      assert.ok((await other.G.cloud.login(oldCredentials)).ok); assert.ok((await other.G.cloud.useCloud()).ok);
      other.update('另一台设备未提交的分支', 899);
      legacyClient.G.store.update(state => {
        const item = state.building.furniture.find(entry => entry.id === 'legacy_sqlite_bed');
        state.building = legacyClient.context.CottageBuilding.executeCommand(state.building, { type: 'furniture.move', id: item.id, position: { ...item.position, x: item.position.x + .25 } }, legacyClient.G.data.furnitureById);
      }, { persist: true });
      legacyClient.update('升级后继续布置', 854);
      const synchronized = await legacyClient.G.cloud.syncNow(); assert.ok(synchronized.ok, synchronized.message);
      const current = saved(oldCredentials.username);
      assert.equal(current.revision, oldRevision + 1); assert.equal(current.save.building.schema, 2); assert.equal(current.save.wallet.coin, 854);
      assert.equal(legacyNetwork.calls.filter(call => call.route === '/save' && call.method === 'PUT').at(-1).ifMatch, oldEtag);
      const oldVersion = api.store.db.prepare('SELECT * FROM versions WHERE account_id=? AND revision=?').get(oldAccountId, oldRevision);
      assert.equal(oldVersion.json, oldJson); assert.equal(oldVersion.content_hash, oldHash);
      assert.equal((await other.G.cloud.syncNow()).ok, false); assert.equal(other.status().phase, 'conflict');
      assert.equal(other.state().wallet.coin, 899); assert.equal(saved(oldCredentials.username).save.wallet.coin, 854);
      assert.ok((await legacyClient.G.cloud.downloadCloud(oldRevision)).ok);
      assert.equal(JSON.parse(legacyClient.downloads.at(-1).value).building.schema, 2);
      assert.equal(saved(oldCredentials.username).revision, oldRevision + 1);
    });
    await check('读取归一化不得掩盖数据库原文摘要损坏，也不覆盖当前进度或旧原文', async () => {
      const corruptRevision = oldRevision - 1, invalidHash = '0'.repeat(64);
      api.store.db.prepare('INSERT INTO versions(account_id,revision,json,content_hash,updated_at) VALUES (?,?,?,?,?)').run(oldAccountId, corruptRevision, oldJson, invalidHash, Date.now());
      const before = JSON.stringify(legacyClient.state()), count = legacyClient.downloads.length;
      assert.equal((await legacyClient.G.cloud.downloadCloud(corruptRevision)).ok, false);
      assert.equal(JSON.stringify(legacyClient.state()), before); assert.equal(legacyClient.downloads.length, count);
      const corrupt = api.store.db.prepare('SELECT * FROM versions WHERE account_id=? AND revision=?').get(oldAccountId, corruptRevision);
      assert.equal(corrupt.json, oldJson); assert.equal(corrupt.content_hash, invalidHash);
      assert.equal(saved(oldCredentials.username).revision, oldRevision + 1);
    });
    console.log(groups + ' 组账号/真实SQLite/双设备端到端检查通过（流式HTTP，无监听）。');
  } finally { if (api) await api.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
