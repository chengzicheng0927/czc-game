'use strict';
// 在线目录来自内存成员；真实临时SQLite/HTTP替身验证，不创建监听。
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { prepareRelease, activateRelease, sourceAssets, hash } = require('../server/releases.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { createHandler } = require('../server/handler.cjs');
const { createLiveHub } = require('../server/live-hub.cjs');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-online-api-')), source = path.join(temp, 'source'), dataDir = path.join(temp, 'data'), prefix = '/game', origin = 'https://online.test', checks = [];
let api, handler, build, now = Date.now(), alice, bob, carol, privateChild, houses = [], extra = [];
const password = 'isolated-online-test-password';
function test(name, run) { checks.push({ name, run }); }
function copy(relative) { const target = path.join(source, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, fs.readFileSync(path.join(root, relative))); }
function boot() { api = createCloudApi({ dataDir, basePath: prefix, origin, clock: () => now, liveOptions: { pollMs: 20, requireKnock: false } }); handler = createHandler({ dataDir, basePath: prefix, cloudApi: api }); }
async function request(route, { method = 'GET', body, actor, headers = {} } = {}) {
  const data = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)), req = Readable.from(data.length ? [data] : []);
  req.method = method; req.url = prefix + '/api/v1' + route;
  req.headers = { 'x-mc-protocol': '1', 'x-mc-build': build.id, ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }), ...(actor ? { cookie: actor.cookie, 'x-mc-live': actor.liveKey, 'x-csrf-token': actor.csrfToken, 'x-mc-account': actor.account.id, ...(actor.peerId ? { 'x-mc-peer': actor.peerId } : {}) } : {}), ...headers }; req.socket = { remoteAddress: '127.0.0.1' };
  const response = { status: null, headers: {}, bytes: Buffer.alloc(0) }, res = new EventEmitter();
  res.writeHead = (status, values) => { assert.equal(response.status, null); response.status = status; response.headers = Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v])); };
  res.end = value => { if (value !== undefined) response.bytes = Buffer.from(value); };
  await handler(req, res); response.body = JSON.parse(response.bytes); assert.equal(response.headers['cache-control'], 'no-store'); return response;
}
async function ok(route, options) { const result = await request(route, options); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; }
async function register(name) {
  const result = await request('/register', { method: 'POST', body: { username: name, password, displayName: 'private_account_nickname' } }); assert.equal(result.status, 200);
  const actor = { ...result.body, name, cookie: result.headers['set-cookie'].split(';')[0] }; Object.assign(actor, await ok('/live/me', { actor })); return actor;
}
async function login(actor) { const result = await request('/login', { method: 'POST', body: { username: actor.name, password } }); assert.equal(result.status, 200); actor.cookie = result.headers['set-cookie'].split(';')[0]; Object.assign(actor, result.body, await ok('/live/me', { actor })); }
async function save(actor) {
  const state = api.currentValidator().defaultSave(); state.profile.name = 'private_profile_marker'; state.house.name = 'private_house_marker'; state.profile.birthday = '03-05';
  await ok('/save', { method: 'PUT', actor, headers: { 'if-none-match': '*' }, body: { save: state, mutationId: 'online_save_' + crypto.randomUUID(), expectedEpoch: actor.serverEpoch } });
}
async function publish(actor, title, displayName) { return (await ok('/my-publication', { method: 'POST', actor, body: { title, displayName, expectedRevision: 1 } })).publication; }
async function join(actor, houseId, displayName) { const result = await ok('/live/join', { method: 'POST', actor, body: { houseId, displayName } }); actor.peerId = result.peerId; return result; }
async function leave(actor, houseId) { return ok('/live/leave', { method: 'POST', actor, body: { houseId } }); }
async function online() { return (await ok('/neighbors/online')).houses; }
function allRowsHash() { return hash(JSON.stringify(['accounts', 'sessions', 'saves', 'versions', 'mutations', 'auth_limits', 'metadata', 'publications'].map(table => [table, api.store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]))); }
function savesHash() { return hash(JSON.stringify(['accounts', 'saves', 'versions'].map(table => [table, api.store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]))); }
function assertPrivacy(values, actors) {
  const encoded = JSON.stringify(values);
  for (const actor of actors) for (const secret of [actor.account.id, actor.account.username, actor.account.displayName, actor.peerId].filter(Boolean)) assert.equal(encoded.includes(secret), false, secret);
  for (const secret of ['private_profile_marker', 'private_house_marker', 'csrfToken', 'liveKey', 'avatar', 'messages', 'accountId', 'username', 'sessionId', 'zone']) assert.equal(encoded.includes(secret), false, secret);
  for (const value of values) {
    assert.deepEqual(Object.keys(value).sort(), ['displayName', 'id', 'online', 'roomCount', 'title', 'updatedAt']); assert.deepEqual(Object.keys(value.online).sort(), ['count', 'displayNames', 'hostOnline']);
    assert.ok(value.online.count >= 1 && value.online.count <= 8); assert.equal(value.online.displayNames.length, value.online.count); assert.equal(typeof value.online.hostOnline, 'boolean');
  }
}

test('在线接口匿名只读且受原协议/来源门禁，空目录不枚举已登录或私有账号', async () => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); for (const ref of sourceAssets(html)) copy(ref.path);
  html = html.replace(/((?:js|css)\/[^"?]+)\?v=[a-f0-9]{10}/g, (_, relative) => relative + '?v=' + hash(fs.readFileSync(path.join(source, relative))).slice(0, 10)); fs.writeFileSync(path.join(source, 'index.html'), html);
  build = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); activateRelease({ dataDir, releaseId: build.id }); boot();
  assert.deepEqual(await ok('/neighbors/online'), { houses: [] }); assert.equal((await request('/neighbors/online', { headers: { 'x-mc-protocol': '2' } })).status, 426); assert.equal((await request('/neighbors/online', { headers: { origin: 'https://foreign.test' } })).status, 403); assert.equal((await request('/neighbors/online', { method: 'POST', body: {} })).status, 405);
  alice = await register('online_private_alice'); bob = await register('online_private_bob'); carol = await register('online_private_carol'); privateChild = await register('online_not_published');
  for (const actor of [alice, bob, carol]) await save(actor);
  houses.push(await publish(alice, '小云的家', '公开屋主甲')); now++; houses.push(await publish(bob, '小雨的家', '公开屋主乙')); now++; houses.push(await publish(carol, '小花的家', '公开屋主丙'));
  const before = allRowsHash(); assert.deepEqual(await online(), []); assert.equal(allRowsHash(), before); assert.equal(api.store.db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.deepEqual(api.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => x.name), ['accounts', 'auth_limits', 'metadata', 'mutations', 'publications', 'saves', 'sessions', 'versions']);
});
test('仅已加入者的公开称呼按实际所在小屋分组，本人在线小屋仍保留且无私人身份或聊天', async () => {
  await join(alice, houses[0].id, '小云'); await join(bob, houses[0].id, '小雨'); await join(carol, houses[1].id, '小花');
  await ok('/live/chat', { method: 'POST', actor: alice, body: { houseId: houses[0].id, clientMessageId: 'online_private_chat', text: 'only_current_room_message' } });
  const before = allRowsHash(), values = await online(); assert.equal(values.length, 2); assert.equal(values[0].id, houses[0].id); assert.deepEqual(values[0].online, { count: 2, hostOnline: true, displayNames: ['小云', '小雨'] }); assert.deepEqual(values[1].online, { count: 1, hostOnline: false, displayNames: ['小花'] });
  assert.ok((await ok('/neighbors/online', { actor: alice })).houses.some(x => x.id === houses[0].id)); assertPrivacy(values, [alice, bob, carol, privateChild]); assert.equal(JSON.stringify(values).includes('only_current_room_message'), false); assert.equal(allRowsHash(), before);
  values[0].online.displayNames[0] = 'client_changed'; assert.equal((await online())[0].online.displayNames[0], '小云'); assert.equal('set-cookie' in (await request('/neighbors/online', { headers: { cookie: 'malformed' } })).headers, false);
});
test('全局有空位优先，再按屋主/人数/公开时间与ID排序，满员仍显示但不抢可加入小屋', async () => {
  api.liveHub.reset(); await join(alice, houses[0].id, '屋主甲'); await join(bob, houses[2].id, '来客乙'); await join(carol, houses[2].id, '屋主丙');
  assert.deepEqual((await online()).map(x => x.id), [houses[2].id, houses[0].id]);
  for (let i = 0; i < 6; i++) { const actor = await register('online_fill_' + i); extra.push(actor); await join(actor, houses[2].id, '小伙伴' + i); }
  let values = await online(); assert.deepEqual(values.map(x => x.id), [houses[0].id, houses[2].id]); assert.equal(values[1].online.count, 8); assert.equal(values[1].online.displayNames.length, 8);
  api.liveHub.reset(); api.store.db.prepare('UPDATE publications SET updated_at=? WHERE id IN (?,?)').run(1, houses[0].id, houses[1].id); await join(alice, houses[0].id, '甲'); await join(bob, houses[1].id, '乙');
  const expected = [houses[0].id, houses[1].id].sort().reverse(); assert.deepEqual((await online()).map(x => x.id), expected);
  api.liveHub.reset(); api.store.db.prepare('UPDATE publications SET updated_at=? WHERE id=?').run(now, houses[1].id); await join(alice, houses[0].id, '甲'); await join(bob, houses[1].id, '乙'); assert.deepEqual((await online()).map(x => x.id), [houses[1].id, houses[0].id]);
});
test('在线最早公开的小屋也在独立目录，旧24分页摘要/游标及跨页结果保持完全不变', async () => {
  api.liveHub.reset(); const snapshot = api.store.db.prepare('SELECT snapshot_json FROM publications WHERE id=?').get(houses[0].id).snapshot_json;
  for (let i = 0; i < 26; i++) {
    const accountId = crypto.randomUUID(); api.store.db.prepare('INSERT INTO accounts(id,username,display_name,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').run(accountId, 'unlisted_seed_' + i, 'private_seed_name', 'test_salt', 'test_hash', now);
    api.store.db.prepare('INSERT INTO publications(id,account_id,title,display_name,snapshot_json,source_revision,room_count,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), accountId, '公开样例' + i, '已公开昵称' + i, snapshot, 1, 0, now + 100 + i);
  }
  const first = await ok('/neighbors'); assert.equal(first.houses.length, 24); assert.ok(first.nextCursor); assert.ok(!first.houses.some(x => x.id === houses[0].id)); const rest = await ok('/neighbors?cursor=' + encodeURIComponent(first.nextCursor));
  await join(alice, houses[0].id, '最早的小屋也在线'); const before = allRowsHash(); assert.equal((await online())[0].id, houses[0].id); assert.deepEqual(await ok('/neighbors'), first); assert.deepEqual(await ok('/neighbors?cursor=' + encodeURIComponent(first.nextCursor)), rest); assert.equal(allRowsHash(), before);
  assert.equal(new Set([...first.houses, ...rest.houses].map(x => x.id)).size, 29); for (const row of [...first.houses, ...rest.houses]) assert.deepEqual(Object.keys(row).sort(), ['displayName', 'id', 'roomCount', 'title', 'updatedAt']);
});
test('本人推荐称呼只用已公开值，非法/无公开值回退通用名，读取目录和推荐名不续TTL', async () => {
  api.liveHub.reset(); assert.deepEqual((await request('/live/me')).body, { authenticated: false }); assert.equal((await ok('/live/me', { actor: privateChild })).joinDisplayName, '小小建筑师'); assert.equal((await ok('/live/me', { actor: alice })).joinDisplayName, '公开屋主甲');
  await join(alice, houses[0].id, '风铃称呼'); await join(bob, houses[0].id, '雨滴称呼'); const before = allRowsHash(); now += 10000; assert.equal((await ok('/live/me', { actor: alice })).joinDisplayName, '风铃称呼'); assert.equal((await online()).length, 1);
  now += 24999; assert.equal((await online()).length, 1); now++; assert.deepEqual(await online(), []); assert.equal((await ok('/live/me', { actor: alice })).joinDisplayName, '公开屋主甲'); assert.equal(allRowsHash(), before);
  for (const badName of ['公开\u202e称呼', '字'.repeat(25), '两\n行']) { api.store.db.prepare('UPDATE publications SET display_name=? WHERE id=?').run(badName, houses[1].id); assert.equal((await ok('/live/me', { actor: bob })).joinDisplayName, '小小建筑师'); }
  api.store.db.prepare('UPDATE publications SET display_name=? WHERE id=?').run('公开屋主乙', houses[1].id);
});
test('成员替换/请离/退出及失效会话立即从在线摘要移除，不会将旧称呼当作仍在线', async () => {
  api.liveHub.reset(); await join(alice, houses[0].id, '小云'); await join(bob, houses[0].id, '小雨'); await join(carol, houses[2].id, '小花');
  await join(bob, houses[2].id, '换屋的小雨'); let values = await online(); assert.equal(values.find(x => x.id === houses[0].id).online.count, 1); assert.ok(!JSON.stringify(values).includes('"小雨"'));
  await ok('/live/kick', { method: 'POST', actor: carol, body: { houseId: houses[2].id, peerId: bob.peerId } }); values = await online(); assert.equal(values.find(x => x.id === houses[2].id).online.count, 1); assert.ok(!JSON.stringify(values).includes('换屋的小雨'));
  await ok('/logout', { method: 'POST', actor: alice, body: {} }); assert.ok(!(await online()).some(x => x.id === houses[0].id)); assert.deepEqual(await ok('/live/me', { actor: alice }), { authenticated: false });
  api.store.db.prepare('UPDATE sessions SET expires_at=? WHERE account_id=?').run(now, carol.account.id); assert.deepEqual(await online(), []); await login(alice); await login(carol);
});
test('更新布置保留在线成员并显示新标题；撤下、服务重启和epoch清理在线目录，公开和私人进度按各自合同保留', async () => {
  api.liveHub.reset(); await join(alice, houses[0].id, '小云'); await join(bob, houses[0].id, '小雨'); const privateBefore = savesHash();
  houses[0] = await publish(alice, '更新后的云屋', '公开屋主甲'); const kept = await online(); assert.equal(kept.length, 1); assert.equal(kept[0].title, '更新后的云屋'); assert.deepEqual(kept[0].online.displayNames.slice().sort(), ['小云', '小雨']);
  await ok('/my-publication', { method: 'DELETE', actor: alice, body: {} }); assert.deepEqual(await online(), []); houses[0] = await publish(alice, '重新公开的云屋', '公开屋主甲'); api.liveHub.reset(); await join(alice, houses[0].id, '仅本次在线的称呼'); assert.equal((await online()).length, 1);
  const beforeRestart = allRowsHash(); await api.close(); boot(); assert.deepEqual(await online(), []); assert.equal((await ok('/public-houses/' + houses[0].id)).house.id, houses[0].id); assert.equal((await ok('/live/me', { actor: alice })).joinDisplayName, '公开屋主甲'); assert.equal(allRowsHash(), beforeRestart);
  await join(alice, houses[0].id, '小云'); assert.equal((await online()).length, 1); api.rotateEpoch(); assert.deepEqual(await online(), []); assert.deepEqual(await ok('/live/me', { actor: alice }), { authenticated: false }); assert.equal(savesHash(), privateBefore);
});
test('目录只导出最多64屋/256实际成员的有界摘要，容量拒绝不会泄漏或额外存储成员', async () => {
  const roomIds = Array.from({ length: 64 }, () => crypto.randomUUID()); const hub = createLiveHub({ clock: () => now, getHouse: id => roomIds.includes(id) ? { id, title: '有界公开屋', ownerId: 'absent_owner', version: '1', zones: [] } : null, getAvatar: () => ({ safe: true }), sessionValid: () => true, requireKnock: false });
  try {
    for (let i = 0; i < 256; i++) hub.join({ accountId: 'private_account_' + i, sessionId: 'private_session_' + i }, { houseId: roomIds[Math.floor(i / 4)], displayName: '公开朋友' + i });
    const values = hub.directory(); assert.equal(values.length, 64); assert.equal(values.reduce((sum, value) => sum + value.count, 0), 256); for (const row of values) assert.deepEqual(Object.keys(row).sort(), ['count', 'displayNames', 'hostOnline', 'id']); assert.ok(!JSON.stringify(values).includes('private_'));
    assert.throws(() => hub.join({ accountId: 'too_many', sessionId: 'too_many' }, { houseId: roomIds[0], displayName: '不应加入' }), error => error.status === 429); assert.equal(hub.stats().members, 256); now += 35000; assert.deepEqual(hub.directory(), []);
  } finally { hub.close(); }
});

(async () => { try { for (const check of checks) { await check.run(); console.log('✓ ' + check.name); } console.log(checks.length + ' 组在线邻居目录与快捷称呼检查通过（无监听）。'); } finally { if (api) await api.close(); fs.rmSync(temp, { recursive: true, force: true }); } })().catch(error => { console.error(error); process.exitCode = 1; });
