'use strict';
// 敲门HTTP接口：真实临时SQLite + 流式HTTP替身，不启动监听。覆盖认证/CSRF/来源门禁、不在家、请进/婉拒、凭证入场、参数校验。
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { prepareRelease, activateRelease, sourceAssets, hash } = require('../server/releases.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { createHandler } = require('../server/handler.cjs');
const root = path.resolve(__dirname, '..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-knock-api-')), source = path.join(temporary, 'source'), dataDir = path.join(temporary, 'data'), origin = 'https://knock.test', prefix = '/cottage', checks = [];
let api, handler, build, host, guest, stranger, house, now = Date.now();
function test(name, run) { checks.push({ name, run }); }
function copy(relative) { const to = path.join(source, relative); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, fs.readFileSync(path.join(root, relative))); }
function request(route, { method = 'GET', body, actor, headers = {} } = {}) {
  const bytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)), req = Readable.from(bytes.length ? [bytes] : []);
  req.method = method; req.url = prefix + '/api/v1' + route;
  req.headers = { 'x-mc-protocol': '1', 'x-mc-build': build.id, ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }), ...(actor ? { cookie: actor.cookie, 'x-mc-live': actor.liveKey, 'x-csrf-token': actor.csrfToken } : {}), ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const state = { status: null, headers: {}, bytes: Buffer.alloc(0) }, res = new EventEmitter();
  res.writeHead = (status, values) => { state.status = status; state.headers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); };
  res.end = value => { if (value !== undefined) state.bytes = Buffer.from(value); };
  return handler(req, res).then(() => { assert.equal(state.headers['cache-control'], 'no-store'); state.body = JSON.parse(state.bytes); return state; });
}
async function register(username) {
  const result = await request('/register', { method: 'POST', body: { username, password: 'isolated-knock-test-password', displayName: '不公开的账号昵称' } }); assert.equal(result.status, 200);
  const actor = { ...result.body, cookie: result.headers['set-cookie'].split(';')[0] }, me = await request('/live/me', { actor }); Object.assign(actor, me.body); return actor;
}
async function save(actor) {
  const state = api.currentValidator().defaultSave(); state.house.rooms.room_live = { type: 'bedroom', wallpaper: { pattern: 'solid', color: '#FFF1C1', color2: '#BDECD6' }, floor: { pattern: 'wood', color: '#D5B08C' }, light: 'warm', items: [], paidPrice: 70 }; state.house.floors[0].slots[0] = 'room_live';
  const saved = await request('/save', { method: 'PUT', actor, body: { save: api.currentValidator().validate(state).save, mutationId: 'initial_' + crypto.randomUUID(), expectedEpoch: actor.serverEpoch }, headers: { 'x-mc-account': actor.account.id, 'if-none-match': '*' } }); assert.equal(saved.status, 200);
}
async function publish(actor, title) { const result = await request('/my-publication', { method: 'POST', actor, headers: { 'x-mc-account': actor.account.id }, body: { title, displayName: '公开小主人', expectedRevision: 1 } }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.publication; }
const knock = (actor, id = house.id) => request('/live/knock', { method: 'POST', actor, body: { houseId: id } });
const inbox = (actor, after = 0, open) => request('/live/inbox?after=' + after + (open === undefined ? '' : '&open=' + open), { actor });

test('敲门接口沿用原协议/来源/CSRF/liveKey门禁，且不增加数据库表', async () => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); for (const ref of sourceAssets(html)) copy(ref.path);
  html = html.replace(/((?:js|css)\/[^"?]+)\?v=[a-f0-9]{10}/g, (_, relative) => relative + '?v=' + hash(fs.readFileSync(path.join(source, relative))).slice(0, 10)); fs.writeFileSync(path.join(source, 'index.html'), html);
  build = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); activateRelease({ dataDir, releaseId: build.id });
  api = createCloudApi({ dataDir, basePath: prefix, origin, clock: () => now, liveOptions: { pollMs: 50, knocksPerMinute: 20 } }); handler = createHandler({ dataDir, basePath: prefix, cloudApi: api });
  host = await register('knock_host'); guest = await register('knock_guest'); stranger = await register('knock_stranger'); await save(host); house = await publish(host, '敲门小屋');
  assert.equal((await request('/live/knock', { method: 'POST', body: { houseId: house.id } })).status, 401);
  assert.equal((await request('/live/knock', { method: 'POST', actor: guest, body: { houseId: house.id }, headers: { 'x-mc-live': host.liveKey } })).status, 401);
  assert.equal((await request('/live/knock', { method: 'POST', actor: guest, body: { houseId: house.id }, headers: { 'x-csrf-token': '0'.repeat(64) } })).status, 403);
  assert.equal((await request('/live/knock', { method: 'POST', actor: guest, body: { houseId: house.id }, headers: { origin: 'https://foreign.test' } })).status, 403);
  assert.equal((await request('/live/knock', { method: 'POST', actor: guest, body: { houseId: house.id, sender: 'x' } })).status, 400);
  assert.equal((await request('/live/knock', { actor: guest })).status, 405); assert.equal((await request('/live/inbox', { method: 'POST', actor: host, body: {} })).status, 405);
  assert.deepEqual(api.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => x.name), ['accounts', 'auth_limits', 'metadata', 'mutations', 'publications', 'saves', 'sessions', 'versions']);
});
test('屋主还没开接待时敲门=不在家；没有公开小屋的人读不了提醒', async () => {
  const result = await knock(guest); assert.equal(result.status, 200); assert.deepEqual(result.body, { requestId: null, status: 'host_away' });
  assert.equal((await inbox(stranger)).status, 403); assert.equal((await inbox(stranger)).body.code, 'LIVE_NO_HOUSE');
});
test('屋主开接待→访客敲门→屋主看到称呼与形象→请进→访客拿到凭证并加入；没有凭证不能加入', async () => {
  const opened = await inbox(host); assert.equal(opened.status, 200); assert.deepEqual(opened.body.requests, []);
  assert.equal((await request('/live/join', { method: 'POST', actor: guest, body: { houseId: house.id, displayName: '小小访客' } })).body.code, 'LIVE_KNOCK_REQUIRED');
  const k = await knock(guest); assert.equal(k.body.status, 'pending'); assert.match(k.body.requestId, /^[a-f0-9-]{36}$/);
  const seen = await inbox(host, opened.body.revision); assert.equal(seen.body.requests.length, 1); assert.equal(seen.body.requests[0].displayName, '小小建筑师');
  const text = JSON.stringify(seen.body); for (const secret of [guest.account.id, 'knock_guest', '不公开的账号昵称', 'token_hash']) assert.equal(text.includes(secret), false, secret);
  assert.equal((await request('/live/knock/status?requestId=' + k.body.requestId, { actor: stranger })).status, 404);
  assert.equal((await request('/live/knock/answer', { method: 'POST', actor: guest, body: { requestId: k.body.requestId, accept: true } })).status, 403);
  assert.equal((await request('/live/knock/answer', { method: 'POST', actor: host, body: { requestId: k.body.requestId, accept: true } })).status, 200);
  const status = await request('/live/knock/status?requestId=' + k.body.requestId, { actor: guest }); assert.equal(status.body.status, 'approved'); assert.ok(status.body.ticket);
  const joined = await request('/live/join', { method: 'POST', actor: guest, body: { houseId: house.id, displayName: '小小访客', ticket: status.body.ticket } }); assert.equal(joined.status, 200, JSON.stringify(joined.body)); assert.equal(joined.body.peers.length, 1);
  assert.equal((await request('/live/join', { method: 'POST', actor: stranger, body: { houseId: house.id, displayName: '路人', ticket: status.body.ticket } })).body.code, 'LIVE_KNOCK_REQUIRED');
  const hostJoin = await request('/live/join', { method: 'POST', actor: host, body: { houseId: house.id, displayName: '小主人' } }); assert.equal(hostJoin.status, 200); assert.equal(hostJoin.body.peers.length, 2);
});
test('婉拒后访客只看到“不方便”，随即进入冷却；参数与游标非法被拒绝', async () => {
  const k = await knock(stranger); await inbox(host, 0); assert.equal((await request('/live/knock/answer', { method: 'POST', actor: host, body: { requestId: k.body.requestId, accept: false } })).status, 200);
  const status = await request('/live/knock/status?requestId=' + k.body.requestId, { actor: stranger }); assert.equal(status.body.status, 'declined'); assert.equal(status.body.ticket, undefined);
  const again = await knock(stranger); assert.equal(again.status, 429); assert.equal(again.body.code, 'LIVE_KNOCK_COOLDOWN'); assert.ok(again.headers['retry-after']);
  for (const query of ['', '?after=-1', '?after=x', '?after=0&after=1', '?after=0&open=2', '?after=0&extra=1']) assert.equal((await request('/live/inbox' + query, { actor: host })).status, 422, query);
  for (const query of ['', '?requestId=a&requestId=b', '?other=1']) assert.equal((await request('/live/knock/status' + query, { actor: guest })).status, 422, query);
  assert.equal((await knock(host)).status, 409); assert.equal((await request('/live/knock', { method: 'POST', actor: guest, body: { houseId: 'bad' } })).status, 422);
});
test('关闭接待后访客再敲门=不在家；停止轮询超时后同样不在家', async () => {
  assert.equal((await inbox(host, 0, 0)).body.open, false); const quiet = await knock(await register('knock_late')); assert.equal(quiet.body.status, 'host_away');
  await inbox(host, 0); now += 30000; const stale = await knock(await register('knock_late2')); assert.equal(stale.body.status, 'host_away');
});

(async () => { let passed = 0; try { for (const check of checks) { await check.run(); passed++; process.stdout.write('✓ ' + check.name + '\n'); } process.stdout.write('knock-api: ' + passed + ' 组通过（真实临时SQLite，无监听）\n'); } finally { if (api) await api.close(); fs.rmSync(temporary, { recursive: true, force: true }); } })().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
