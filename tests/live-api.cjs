'use strict';
// 真实临时SQLite、流式HTTP替身与内存长轮询；不启动任何监听。
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { prepareRelease, activateRelease, sourceAssets, hash } = require('../server/releases.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { createHandler } = require('../server/handler.cjs');
const root = path.resolve(__dirname, '..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-live-api-')), source = path.join(temporary, 'source'), dataDir = path.join(temporary, 'data'), origin = 'https://live.test', prefix = '/cottage', checks = [];
let api, handler, build, host, guest, third, house, otherHouse, hostPeer, guestPeer, thirdPeer, baseline, now = Date.now();
function test(name, run) { checks.push({ name, run }); }
function copy(relative) { const to = path.join(source, relative); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, fs.readFileSync(path.join(root, relative))); }
function request(route, { method = 'GET', body, actor, headers = {}, streamChange } = {}) {
  const bytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)); let req;
  const input = streamChange ? (async function* () { yield bytes.subarray(0, 7); streamChange(req); yield bytes.subarray(7); })() : bytes.length ? [bytes] : [];
  req = Readable.from(input); req.method = method; req.url = prefix + '/api/v1' + route;
  req.headers = { 'x-mc-protocol': '1', 'x-mc-build': build.id, ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }), ...(actor ? { cookie: actor.cookie, 'x-mc-live': actor.liveKey, 'x-csrf-token': actor.csrfToken, ...(actor.peerId ? { 'x-mc-peer': actor.peerId } : {}) } : {}), ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const state = { status: null, headers: {}, bytes: Buffer.alloc(0) }, res = new EventEmitter();
  res.writeHead = (status, values) => { assert.equal(state.status, null); state.status = status; state.headers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); };
  res.end = value => { if (value !== undefined) state.bytes = Buffer.from(value); };
  const done = handler(req, res).then(() => { assert.equal(state.headers['cache-control'], 'no-store'); state.body = JSON.parse(state.bytes); return state; });
  return done;
}
async function register(username) {
  const result = await request('/register', { method: 'POST', body: { username, password: 'isolated-live-test-password', displayName: '不公开的账号昵称' } }); assert.equal(result.status, 200);
  const actor = { ...result.body, cookie: result.headers['set-cookie'].split(';')[0] }, me = await request('/live/me', { actor }); assert.equal(me.status, 200); Object.assign(actor, me.body); return actor;
}
async function save(actor) {
  const state = api.currentValidator().defaultSave(); state.profile.name = 'secret_profile_name'; state.profile.birthday = '03-05'; state.wallet.coin = 9786; state.house.name = 'secret_private_house';
  state.house.rooms.room_live = { type: 'bedroom', wallpaper: { pattern: 'solid', color: '#FFF1C1', color2: '#BDECD6' }, floor: { pattern: 'wood', color: '#D5B08C' }, light: 'warm', items: [], paidPrice: 70 }; state.house.floors[0].slots[0] = 'room_live';
  const saved = await request('/save', { method: 'PUT', actor, body: { save: api.currentValidator().validate(state).save, mutationId: 'initial_' + crypto.randomUUID(), expectedEpoch: actor.serverEpoch }, headers: { 'x-mc-account': actor.account.id, 'if-none-match': '*' } }); assert.equal(saved.status, 200); return saved.body;
}
async function publish(actor, title) { const result = await request('/my-publication', { method: 'POST', actor, headers: { 'x-mc-account': actor.account.id }, body: { title, displayName: '公开小主人', expectedRevision: 1 } }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.publication; }
async function join(actor, id = house.id, displayName = '小小访客') { const result = await request('/live/join', { method: 'POST', actor, body: { houseId: id, displayName } }); assert.equal(result.status, 200, JSON.stringify(result.body)); actor.peerId = result.body.peerId; return result.body; }
function privateHash() { return hash(JSON.stringify(['accounts', 'saves', 'versions', 'mutations', 'metadata'].map(table => [table, api.store.db.prepare('SELECT * FROM ' + table + (table === 'metadata' ? " WHERE key NOT LIKE 'private:%'" : '') + ' ORDER BY rowid').all()]))); }
async function current(actor, id = house.id) { const result = await request('/live/poll?houseId=' + id + '&after=0', { actor }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; }
async function waitUntilPoll() { for (let i = 0; i < 30 && api.liveHub.stats().waiting === 0; i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(api.liveHub.stats().waiting > 0); }

test('实时接口共用原协议/来源门禁，认证探测不暴露账号且不增加数据库schema', async () => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); for (const ref of sourceAssets(html)) copy(ref.path);
  html = html.replace(/((?:js|css)\/[^"?]+)\?v=[a-f0-9]{10}/g, (_, relative) => relative + '?v=' + hash(fs.readFileSync(path.join(source, relative))).slice(0, 10)); fs.writeFileSync(path.join(source, 'index.html'), html);
  build = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); activateRelease({ dataDir, releaseId: build.id });
  api = createCloudApi({ dataDir, basePath: prefix, origin, clock: () => now, liveOptions: { pollMs: 1000, requireKnock: false } }); handler = createHandler({ dataDir, basePath: prefix, cloudApi: api });
  assert.deepEqual((await request('/live/me')).body, { authenticated: false }); assert.equal((await request('/live/me', { headers: { 'x-mc-protocol': '2' } })).status, 426); assert.equal((await request('/live/me', { headers: { origin: 'https://foreign.test' } })).status, 403);
  host = await register('live_private_host'); guest = await register('live_private_guest'); third = await register('live_private_third');
  const me = await request('/live/me', { actor: guest }); assert.deepEqual(Object.keys(me.body).sort(), ['authenticated', 'csrfToken', 'joinDisplayName', 'liveKey']); assert.equal(me.body.joinDisplayName, '小小建筑师'); assert.equal(me.body.liveKey.length, 64); assert.ok(!JSON.stringify(me.body).includes(guest.account.id));
  assert.equal((await request('/live/me', { method: 'POST', actor: guest, body: {} })).status, 405); assert.equal((await request('/live/unknown', { actor: guest })).status, 404);
  await save(host); await save(third); house = await publish(host, '云朵相聚'); otherHouse = await publish(third, '薄荷相聚'); baseline = privateHash();
  assert.deepEqual(api.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => x.name), ['accounts', 'auth_limits', 'metadata', 'mutations', 'publications', 'saves', 'sessions', 'versions']);
});
test('加入需当前Cookie/liveKey/CSRF，未有私档的孩子使用可信默认形象', async () => {
  const body = { houseId: house.id, displayName: '小小访客' }; assert.equal((await request('/live/join', { method: 'POST', body })).status, 401);
  assert.equal((await request('/live/join', { method: 'POST', actor: guest, body, headers: { 'x-mc-live': host.liveKey } })).status, 401); assert.equal((await request('/live/join', { method: 'POST', actor: guest, body, headers: { 'x-csrf-token': '0'.repeat(64) } })).status, 403);
  assert.equal((await request('/live/join', { method: 'POST', actor: guest, body, headers: { origin: 'https://foreign.test' } })).status, 403);
  assert.equal((await request('/live/join', { method: 'POST', actor: guest, body: { ...body, sender: host.account.id } })).status, 400);
  const h = await join(host, house.id, '小主人'), g = await join(guest); hostPeer = h.peerId; guestPeer = g.peerId; assert.equal(g.peers.length, 2); assert.deepEqual(g.messages, []);
  const encoded = JSON.stringify(g); for (const secret of [host.account.id, guest.account.id, 'live_private_', '不公开的账号昵称', 'secret_profile_name', 'secret_private_house', '03-05', '9786', 'token_hash']) assert.equal(encoded.includes(secret), false, secret);
  for (const peer of g.peers) { assert.equal('owned' in peer.avatar, false); assert.equal('outfits' in peer.avatar, false); } assert.equal(api.store.db.prepare('SELECT count(*) n FROM saves WHERE account_id=?').get(guest.account.id).n, 0);
});
test('同屋长轮询立即收到行走，跨屋或冒充peer无法读取/控制；私档不变', async () => {
  const before = await current(host), wait = request('/live/poll?houseId=' + house.id + '&after=' + before.revision, { actor: host }); await waitUntilPoll();
  const move = await request('/live/move', { method: 'POST', actor: guest, body: { houseId: house.id, seq: 1, zone: 'room_live', x: 0.8, y: 0.6 } }); assert.equal(move.status, 200);
  const response = await wait; assert.equal(response.status, 200); assert.equal(response.body.peers.find(p => p.id === guestPeer).x, 0.8);
  assert.equal((await request('/live/poll?houseId=' + otherHouse.id + '&after=0', { actor: guest })).status, 409);
  assert.equal((await request('/live/move', { method: 'POST', actor: guest, headers: { 'x-mc-peer': hostPeer }, body: { houseId: house.id, seq: 2, zone: 'yard', x: 0.1, y: 0.1 } })).status, 409);
  assert.equal((await request('/live/move', { method: 'POST', actor: guest, body: { houseId: house.id, seq: 2, zone: 'not_public_room', x: 0.1, y: 0.1 } })).status, 422);
  assert.equal((await request('/live/poll?houseId=' + house.id + '&after=0&after=1', { actor: guest })).status, 422); assert.equal(privateHash(), baseline);
});
test('聊天只由当前成员发送，短纯文字幂等，后来加入的孩子看不到旧话', async () => {
  const body = { houseId: house.id, clientMessageId: 'hello_live_001', text: '<b>一起玩吧</b>' }; const before = await current(host), wait = request('/live/poll?houseId=' + house.id + '&after=' + before.revision, { actor: host }); await waitUntilPoll();
  assert.equal((await request('/live/chat', { method: 'POST', actor: guest, body })).status, 200); const packet = (await wait).body; assert.equal(packet.messages.length, 1); assert.equal(packet.messages[0].peerId, guestPeer); assert.equal(packet.messages[0].text, body.text);
  const revision = packet.revision; assert.equal((await request('/live/chat', { method: 'POST', actor: guest, body })).status, 200); assert.equal((await current(host)).revision, revision);
  assert.equal((await request('/live/chat', { method: 'POST', actor: guest, body: { ...body, text: '不同正文' } })).status, 409); assert.equal((await request('/live/chat', { method: 'POST', actor: guest, body: { ...body, clientMessageId: 'bad_line_002', text: '不能\n换行' } })).status, 422);
  assert.equal((await request('/live/chat', { method: 'POST', actor: guest, body: { ...body, clientMessageId: 'forged_sender', sender: hostPeer } })).status, 400);
  const t = await join(third, house.id, '后来小伙伴'); thirdPeer = t.peerId; assert.deepEqual(t.messages, []); assert.deepEqual((await current(third)).messages, []); assert.equal(privateHash(), baseline);
});
test('body在途切换Cookie及所有凭据仍被原请求身份栅栏拒绝', async () => {
  const before = await current(host); const changed = await request('/live/move', { method: 'POST', actor: guest, body: { houseId: house.id, seq: 2, zone: 'yard', x: 0.2, y: 0.2 }, streamChange(req) { req.headers.cookie = host.cookie; req.headers['x-mc-live'] = host.liveKey; req.headers['x-csrf-token'] = host.csrfToken; } });
  assert.equal(changed.status, 401); assert.equal(changed.body.code, 'LIVE_SESSION_CHANGED'); const after = await current(host); assert.equal(after.revision, before.revision); assert.equal(after.peers.find(p => p.id === guestPeer).x, 0.8);
  const oldPeer = guest.peerId, next = await join(guest); guestPeer = next.peerId; assert.notEqual(oldPeer, guestPeer);
  assert.equal((await request('/live/leave', { method: 'POST', actor: guest, headers: { 'x-mc-peer': oldPeer }, body: { houseId: house.id } })).status, 409); assert.ok((await current(guest)).peers.some(p => p.id === guestPeer));
});
test('仅屋主可请离，等待立即结束且本房间禁止重进；别屋仍可正常加入', async () => {
  assert.equal((await request('/live/kick', { method: 'POST', actor: guest, body: { houseId: house.id, peerId: hostPeer } })).status, 403);
  const before = await current(guest), wait = request('/live/poll?houseId=' + house.id + '&after=' + before.revision, { actor: guest }); await waitUntilPoll();
  assert.equal((await request('/live/kick', { method: 'POST', actor: host, body: { houseId: house.id, peerId: guestPeer } })).status, 200); assert.equal((await wait).status, 409);
  assert.equal((await request('/live/join', { method: 'POST', actor: guest, body: { houseId: house.id, displayName: '再来一次' } })).status, 403);
  await join(guest, otherHouse.id); assert.equal((await current(guest, otherHouse.id)).peers.length, 1); assert.equal(privateHash(), baseline);
});
test('退出登录立即释放长轮询，旧Cookie和串门凭据不能继续读写', async () => {
  const before = await current(guest, otherHouse.id), wait = request('/live/poll?houseId=' + otherHouse.id + '&after=' + before.revision, { actor: guest }); await waitUntilPoll();
  assert.equal((await request('/logout', { method: 'POST', actor: guest, headers: { 'x-mc-account': guest.account.id }, body: {} })).status, 200); assert.equal((await wait).status, 401);
  assert.deepEqual((await request('/live/me', { actor: guest })).body, { authenticated: false }); assert.equal((await request('/live/chat', { method: 'POST', actor: guest, body: { houseId: otherHouse.id, clientMessageId: 'logged_out_msg', text: '退出后不发' } })).status, 401); assert.equal(privateHash(), baseline);
});
test('更新公开布置唤醒等待并带出新版本、成员保留；撤下结束等待；私有修订保留', async () => {
  let before = await current(host), wait = request('/live/poll?houseId=' + house.id + '&after=' + before.revision, { actor: host }); await waitUntilPoll(); const membersBefore = api.liveHub.stats().members;
  const updated = await publish(host, '更新后的聚会'); assert.equal(updated.id, house.id); const woken = await wait; assert.equal(woken.status, 200); assert.match(woken.body.houseVersion, /^[a-f0-9]{64}$/); assert.notEqual(woken.body.houseVersion, before.houseVersion); assert.equal(api.liveHub.stats().members, membersBefore);
  before = await current(host); wait = request('/live/poll?houseId=' + house.id + '&after=' + before.revision, { actor: host }); await waitUntilPoll();
  const withdrawn = await request('/my-publication', { method: 'DELETE', actor: host, headers: { 'x-mc-account': host.account.id }, body: {} }); assert.equal(withdrawn.status, 200); assert.equal((await wait).status, 404); assert.equal(api.liveHub.stats().members, 0);
  assert.equal((await request('/live/join', { method: 'POST', actor: host, body: { houseId: house.id, displayName: '小主人' } })).status, 404); assert.equal(privateHash(), baseline);
});
test('屋主保存新布置时公开小屋自动跟随，访客不被踢且收到新版本；只改私有数据不打扰访客', async () => {
  const login = await request('/login', { method: 'POST', body: { username: 'live_private_guest', password: 'isolated-live-test-password' } }); assert.equal(login.status, 200); guest = { ...login.body, cookie: login.headers['set-cookie'].split(';')[0] }; Object.assign(guest, (await request('/live/me', { actor: guest })).body);
  const state = api.currentValidator().defaultSave(); state.house.name = '自动跟随屋';
  state.house.rooms.room_live = { type: 'bedroom', wallpaper: { pattern: 'solid', color: '#FFF1C1', color2: '#BDECD6' }, floor: { pattern: 'wood', color: '#D5B08C' }, light: 'warm', items: [], paidPrice: 70 }; state.house.floors[0].slots[0] = 'room_live';
  const headers = actor => ({ 'x-mc-account': actor.account.id });
  async function put(next, etag) { const result = await request('/save', { method: 'PUT', actor: guest, headers: { ...headers(guest), ...(etag ? { 'if-match': etag } : { 'if-none-match': '*' }) }, body: { save: api.currentValidator().validate(next).save, mutationId: 'follow_' + crypto.randomUUID(), expectedEpoch: guest.serverEpoch } }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result; }
  let saved = await put(state); const mine = await request('/my-publication', { actor: guest, headers: headers(guest) }); assert.equal(mine.status, 200); assert.ok(mine.body.publication, '默认公开应已生成公开小屋'); const id = mine.body.publication.id;
  await join(third, id); await request('/live/chat', { method: 'POST', actor: third, body: { houseId: id, clientMessageId: 'follow_chat_one', text: '我在这里' } });
  let before = await current(third, id), wait = request('/live/poll?houseId=' + id + '&after=' + before.revision, { actor: third }); await waitUntilPoll();
  const membersBefore = api.liveHub.stats().members;
  const next = structuredClone(state); next.wallet.coin += 11; now += 1000; saved = await put(next, saved.headers.etag);
  assert.equal(await Promise.race([wait.then(() => 'woken'), new Promise(resolve => setTimeout(() => resolve('quiet'), 20))]), 'quiet'); assert.equal(api.liveHub.stats().waiting, 1);
  const layout = structuredClone(next); layout.house.rooms.room_live.wallpaper.color = '#FFD6E8'; now += 1000; saved = await put(layout, saved.headers.etag);
  const woken = await wait; assert.equal(woken.status, 200, JSON.stringify(woken.body)); assert.notEqual(woken.body.houseVersion, before.houseVersion); assert.equal(api.liveHub.stats().members, membersBefore);
  const after = await current(third, id); assert.equal(after.houseVersion, woken.body.houseVersion); assert.ok(after.messages.some(message => message.text === '我在这里'), '聊天记录应随房间保留');
  const detail = await request('/public-houses/' + id); assert.equal(detail.body.snapshot.house.rooms.room_live.wallpaper.color, '#FFD6E8');
  assert.equal((await request('/live/leave', { method: 'POST', actor: third, body: { houseId: id } })).status, 200);
});
test('epoch轮换移除在线和消息，服务关闭在数据库关闭前释放等待', async () => {
  await join(third, otherHouse.id); let before = await current(third, otherHouse.id), wait = request('/live/poll?houseId=' + otherHouse.id + '&after=' + before.revision, { actor: third }); await waitUntilPoll();
  api.rotateEpoch(); assert.equal((await wait).status, 409); assert.equal(api.liveHub.stats().members, 0); assert.deepEqual((await request('/live/me', { actor: third })).body, { authenticated: false });
  const fresh = await request('/login', { method: 'POST', body: { username: 'live_private_host', password: 'isolated-live-test-password' } }); assert.equal(fresh.status, 200); host = { ...fresh.body, cookie: fresh.headers['set-cookie'].split(';')[0] }; Object.assign(host, (await request('/live/me', { actor: host })).body); house = await publish(host, '服务关闭测试'); await join(host);
  before = await current(host); wait = request('/live/poll?houseId=' + house.id + '&after=' + before.revision, { actor: host }); await waitUntilPoll(); await api.close(); assert.equal((await wait).status, 503); assert.equal(api.liveHub.stats().waiting, 0); api = null;
});

(async () => { let passed = 0; try { for (const check of checks) { await check.run(); passed++; process.stdout.write('✓ ' + check.name + '\n'); } process.stdout.write('live-api: ' + passed + ' 组通过（真实临时SQLite，无监听）\n'); } finally { if (api) await api.close(); fs.rmSync(temporary, { recursive: true, force: true }); } })().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
