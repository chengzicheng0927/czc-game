'use strict';
// 敲门协议（内存hub，可控时钟）：同意/婉拒/不在家/过期/冷却/限流/凭证绑定/请离/清理；不启动监听、不写磁盘。
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLiveHub, LiveError } = require('../server/live-hub.cjs');
const checks = [];
function test(name, run) { checks.push({ name, run }); }
function fixture(options = {}) {
  let now = 1000000;
  const id = crypto.randomUUID(), houses = new Map([[id, { id, title: '云朵小屋', ownerId: 'host', version: 'v1', zones: ['room_1'] }]]), revoked = new Set();
  const avatar = { skin: 0, hair: 'bob', hairColor: '#8B5A3C', face: 'smile', top: 'top_cloud', bottom: 'bottom_cream', dress: null, shoes: 'shoes_mary', acc: [] };
  const actor = (accountId, sessionId = accountId + '_session') => ({ accountId, sessionId });
  const hub = createLiveHub({ clock: () => now, getHouse: key => houses.get(key), getAvatar: () => avatar, sessionValid: a => !revoked.has(a.sessionId), houseOf: account => account === 'host' ? id : null, nameFor: account => '小朋友' + account, pollMs: 20, ...options });
  return { id, houses, revoked, actor, hub, advance(ms) { now += ms; }, open() { return hub.inbox(actor('host'), 0); } };
}
const code = (fn, expected) => assert.throws(fn, error => error instanceof LiveError && error.code === expected, expected);
async function withFixture(run, options) { const f = fixture(options); try { await run(f); } finally { f.hub.close(); } }

test('屋主没开接待：敲门立即得到“不在家”，不创建请求，不透露任何别的信息', () => withFixture(async f => {
  const result = f.hub.knock(f.actor('kid'), { houseId: f.id }); assert.deepEqual(result, { requestId: null, status: 'host_away' }); assert.equal(f.hub.stats().knocks, 0);
}));

test('完整流程：开接待→敲门→屋主收到提醒→请进→凭证→加入；游客拿到的只有公开称呼和形象', () => withFixture(async f => {
  const first = await f.open(); assert.equal(first.open, true); assert.deepEqual(first.requests, []);
  const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); assert.equal(k.status, 'pending'); assert.ok(crypto.randomUUID && k.requestId);
  const box = await f.hub.inbox(f.actor('host'), first.revision); assert.equal(box.requests.length, 1);
  assert.deepEqual(Object.keys(box.requests[0]).sort(), ['at', 'avatar', 'displayName', 'id']); assert.equal(box.requests[0].displayName, '小朋友kid');
  assert.ok(!JSON.stringify(box).includes('kid_session') && !JSON.stringify(box).includes('accountId'));
  assert.deepEqual(f.hub.knockStatus(f.actor('kid'), k.requestId), { status: 'pending', houseId: f.id });
  assert.deepEqual(f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: true }), { ok: true });
  const status = f.hub.knockStatus(f.actor('kid'), k.requestId); assert.equal(status.status, 'approved'); assert.match(status.ticket, /^[a-f0-9-]{36}$/);
  const joined = f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友kid', ticket: status.ticket }); assert.equal(joined.peers.length, 1);
  assert.equal((await f.hub.inbox(f.actor('host'), box.revision, {})).requests.length, 0, '已处理的请求不再出现在提醒里');
}));

test('没有凭证、凭证属于别人、别的小屋、过期，都不能加入；屋主自己不需要', () => withFixture(async f => {
  code(() => f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友' }), 'LIVE_KNOCK_REQUIRED');
  code(() => f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友', ticket: crypto.randomUUID() }), 'LIVE_KNOCK_REQUIRED');
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: true });
  const { ticket } = f.hub.knockStatus(f.actor('kid'), k.requestId);
  code(() => f.hub.join(f.actor('other'), { houseId: f.id, displayName: '别人', ticket }), 'LIVE_KNOCK_REQUIRED');
  const first = f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友', ticket }); f.hub.leave(f.actor('kid'), first.peerId, { houseId: f.id });
  assert.equal(f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友', ticket }).peers.length, 1, '限时内同一账号可以重连');
  f.advance(5 * 60 * 1000 + 1); f.hub.sweep(); code(() => f.hub.join(f.actor('kid2'), { houseId: f.id, displayName: '小朋友', ticket }), 'LIVE_KNOCK_REQUIRED');
  const hostJoin = f.hub.join(f.actor('host'), { houseId: f.id, displayName: '小主人' }); assert.equal(hostJoin.peers.find(p => p.id === hostJoin.peerId).isHost, true);
}));

test('婉拒：访客只看到“不方便”，同一小屋冷却，冷却内敲门被拒绝；冷却过后可再敲', () => withFixture(async f => {
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: false });
  const status = f.hub.knockStatus(f.actor('kid'), k.requestId); assert.equal(status.status, 'declined'); assert.equal(status.ticket, undefined); assert.ok(status.retryAfter > 0);
  code(() => f.hub.knock(f.actor('kid'), { houseId: f.id }), 'LIVE_KNOCK_COOLDOWN');
  code(() => f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友' }), 'LIVE_KNOCK_REQUIRED');
  f.advance(10 * 60 * 1000 + 1000); await f.open(); assert.equal(f.hub.knock(f.actor('kid'), { houseId: f.id }).status, 'pending');
}));

test('屋主关闭接待或离线超时：等待中的请求变成“不在家”，之后敲门同样不在家', () => withFixture(async f => {
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id });
  assert.equal((await f.hub.inbox(f.actor('host'), 0, { open: false })).open, false);
  assert.equal(f.hub.knockStatus(f.actor('kid'), k.requestId).status, 'host_away'); assert.equal(f.hub.knock(f.actor('kid2'), { houseId: f.id }).status, 'host_away');
  await f.open(); const k2 = f.hub.knock(f.actor('kid3'), { houseId: f.id }); f.advance(26000); assert.equal(f.hub.knockStatus(f.actor('kid3'), k2.requestId).status, 'host_away');
}));

test('请求2分钟无人回应即过期；过期后不能再被同意', () => withFixture(async f => {
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); f.advance(121000);
  code(() => f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: true }), 'LIVE_KNOCK_GONE'); assert.equal(f.hub.knockStatus(f.actor('kid'), k.requestId).status, 'expired');
}));

test('同一访客同屋只保留一条待处理；每屋最多3条；每账号每分钟最多3次', () => withFixture(async f => {
  await f.open(); const a = f.hub.knock(f.actor('a'), { houseId: f.id }), again = f.hub.knock(f.actor('a'), { houseId: f.id }); assert.equal(a.requestId, again.requestId);
  f.hub.knock(f.actor('b'), { houseId: f.id }); f.hub.knock(f.actor('c'), { houseId: f.id }); code(() => f.hub.knock(f.actor('d'), { houseId: f.id }), 'LIVE_KNOCK_BUSY');
}));
test('敲门限流：一分钟内第4次被拒；不能给自己的小屋敲门；非屋主不能读提醒或回答', () => withFixture(async f => {
  const other = [1, 2, 3, 4].map(() => crypto.randomUUID()); for (const key of other) f.houses.set(key, { id: key, title: '别家', ownerId: 'x' + key, version: 'v', zones: [] });
  for (const key of other.slice(0, 3)) f.hub.knock(f.actor('kid'), { houseId: key }); code(() => f.hub.knock(f.actor('kid'), { houseId: other[3] }), 'LIVE_RATE_LIMIT');
  code(() => f.hub.knock(f.actor('host'), { houseId: f.id }), 'LIVE_OWN_HOUSE'); code(() => f.hub.inbox(f.actor('kid'), 0), 'LIVE_NO_HOUSE'); code(() => f.hub.answer(f.actor('kid'), { requestId: crypto.randomUUID(), accept: true }), 'LIVE_NO_HOUSE');
  code(() => f.hub.knock(f.actor('kid5'), { houseId: 'bad' }), 'LIVE_INVALID_HOUSE'); code(() => f.hub.knock(f.actor('kid5'), { houseId: f.id, extra: 1 }), 'LIVE_INVALID_REQUEST');
}));

test('访客只能读自己的敲门结果；别人的请求读不到', () => withFixture(async f => {
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id });
  code(() => f.hub.knockStatus(f.actor('spy'), k.requestId), 'LIVE_KNOCK_GONE'); code(() => f.hub.knockStatus(f.actor('kid'), 'nope'), 'LIVE_KNOCK_GONE');
}));

test('屋主请离访客：凭证作废并进入冷却，不能马上重敲或重进', () => withFixture(async f => {
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: true });
  const { ticket } = f.hub.knockStatus(f.actor('kid'), k.requestId); const host = f.hub.join(f.actor('host'), { houseId: f.id, displayName: '主人' }), kid = f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友', ticket });
  f.hub.kick(f.actor('host'), host.peerId, { houseId: f.id, peerId: kid.peerId });
  code(() => f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友', ticket }), 'LIVE_FORBIDDEN'); code(() => f.hub.knock(f.actor('kid'), { houseId: f.id }), 'LIVE_KNOCK_COOLDOWN');
}));

test('访客出现在屋主此刻所在的位置旁边', () => withFixture(async f => {
  await f.open(); const host = f.hub.join(f.actor('host'), { houseId: f.id, displayName: '主人' }); f.hub.move(f.actor('host'), host.peerId, { houseId: f.id, seq: 1, zone: 'room_1', x: 0.6, y: 0.5 });
  const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: true });
  const joined = f.hub.join(f.actor('kid'), { houseId: f.id, displayName: '小朋友', ticket: f.hub.knockStatus(f.actor('kid'), k.requestId).ticket }), me = joined.peers.find(p => p.id === joined.peerId);
  assert.equal(me.zone, 'room_1'); assert.ok(Math.abs(me.x - 0.6) <= 0.2 && Math.abs(me.x - 0.6) > 0); assert.ok(me.x >= 0 && me.x <= 1 && me.y >= 0 && me.y <= 1);
}));

test('屋主页面的长轮询：新请求立即唤醒；被新请求替换或页面离开都干净结束；满员时不能再请进', () => withFixture(async f => {
  const first = await f.open(), waiting = f.hub.inbox(f.actor('host'), first.revision); assert.equal(f.hub.stats().inboxWaiting, 1);
  const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); const woke = await waiting; assert.equal(woke.requests[0].id, k.requestId); assert.equal(f.hub.stats().inboxWaiting, 0);
  const replaced = f.hub.inbox(f.actor('host'), woke.revision); const second = f.hub.inbox(f.actor('host'), woke.revision); await assert.rejects(replaced, error => error.code === 'LIVE_POLL_REPLACED');
  const controller = new AbortController(); const third = f.hub.inbox(f.actor('host'), woke.revision, { signal: controller.signal }); await assert.rejects(second, error => error.code === 'LIVE_POLL_REPLACED'); controller.abort(); await assert.rejects(third, error => error.code === 'LIVE_POLL_ABORTED');
  assert.equal(f.hub.stats().inboxWaiting, 0); code(() => f.hub.inbox(f.actor('host'), -1), 'LIVE_INVALID_CURSOR');
}), { pollMs: 5000 });

test('满员8人：敲门和同意都被拒绝', () => withFixture(async f => {
  await f.open(); const fixed = f.hub; const tickets = [];
  for (let i = 0; i < 8; i++) { const name = 'g' + i, k = fixed.knock(f.actor(name), { houseId: f.id }); fixed.answer(f.actor('host'), { requestId: k.requestId, accept: true }); fixed.join(f.actor(name), { houseId: f.id, displayName: name, ticket: fixed.knockStatus(f.actor(name), k.requestId).ticket }); f.advance(1000); await f.open(); tickets.push(name); }
  code(() => fixed.knock(f.actor('late'), { houseId: f.id }), 'LIVE_ROOM_FULL');
}), { knocksPerMinute: 20 });

test('清理：过期请求、凭证、冷却、在线状态都会被扫除；关闭后全部释放', () => withFixture(async f => {
  await f.open(); const k = f.hub.knock(f.actor('kid'), { houseId: f.id }); f.hub.answer(f.actor('host'), { requestId: k.requestId, accept: true }); assert.ok(f.hub.stats().tickets > 0);
  f.advance(6 * 60 * 1000); f.hub.sweep(); const stats = f.hub.stats(); assert.equal(stats.tickets, 0); assert.equal(stats.knocks, 0); assert.equal(stats.hosts, 0);
}));

(async () => {
  for (const check of checks) { await check.run(); console.log('✓ ' + check.name); }
  console.log(checks.length + ' 组敲门协议检查通过（内存hub，无监听）');
})().catch(error => { console.error(error); process.exit(1); });
