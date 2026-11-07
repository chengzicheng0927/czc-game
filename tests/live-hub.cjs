'use strict';
// 直接测试内存房间，不启动监听、不写磁盘。
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLiveHub, LiveError } = require('../server/live-hub.cjs');
const checks = [];
function test(name, run) { checks.push({ name, run }); }
function fixture(options = {}) {
  let now = 100000;
  const first = crypto.randomUUID(), second = crypto.randomUUID(), houses = new Map([[first, { id: first, title: '云朵小屋', ownerId: 'host', version: 'v1', zones: ['bedroom_1'] }], [second, { id: second, title: '薄荷小屋', ownerId: 'other_host', version: 'v2', zones: [] }]]), revoked = new Set();
  const avatar = { skin: 'peach', hair: 'short', hairColor: '#5F4550', face: 'smile', top: 'basic_top', bottom: 'basic_bottom', dress: '', shoes: 'basic_shoes', acc: [] };
  const actor = (accountId, sessionId = accountId + '_session') => ({ accountId, sessionId });
  const hub = createLiveHub({ clock: () => now, getHouse: id => houses.get(id), getAvatar: () => avatar, sessionValid: a => !revoked.has(a.sessionId), pollMs: 20, requireKnock: false, ...options });
  return { first, second, houses, revoked, avatar, actor, hub, advance(ms) { now += ms; }, join(accountId, id = first, name = '小伙伴') { const a = actor(accountId); return { actor: a, joined: hub.join(a, { houseId: id, displayName: name }) }; } };
}
function expectCode(fn, code) { assert.throws(fn, error => error instanceof LiveError && error.code === code); }
function rejected(promise, code) { return assert.rejects(promise, error => error instanceof LiveError && error.code === code); }
async function withFixture(run, options) { const f = fixture(options); try { await run(f); } finally { f.hub.close(); } }

test('加入公开房间仅回传临时人物标识与视觉形象，不含账号或会话；出生位置分散', () => withFixture(async f => {
  const host = f.join('host'), guest = f.join('guest'); const data = guest.joined;
  assert.deepEqual(Object.keys(data).sort(), ['house', 'houseVersion', 'messages', 'peerId', 'peers', 'revision']); assert.equal(data.houseVersion, 'v1'); assert.equal(data.peers.length, 2); assert.deepEqual(data.messages, []);
  assert.equal(data.peers.find(p => p.id === host.joined.peerId).isHost, true); assert.equal(data.peers.find(p => p.id === data.peerId).isHost, false);
  assert.notEqual(data.peerId, 'guest'); assert.notEqual(data.peers[0].x, data.peers[1].x);
  for (const p of data.peers) assert.deepEqual(Object.keys(p).sort(), ['avatar', 'displayName', 'id', 'isHost', 'updatedAt', 'x', 'y', 'zone']);
  const encoded = JSON.stringify(data); assert.ok(!encoded.includes('accountId') && !encoded.includes('sessionId') && !encoded.includes('guest_session'));
  data.peers[0].avatar.acc.push('forged'); const polled = await f.hub.poll(guest.actor, f.first, data.peerId, 0); assert.deepEqual(polled.peers[0].avatar.acc, []);
}));
test('长轮询由真实移动立即唤醒；新位置有界、递增序号阻止迟到回退', () => withFixture(async f => {
  const host = f.join('host'), guest = f.join('guest'), waiting = f.hub.poll(host.actor, f.first, host.joined.peerId, guest.joined.revision);
  assert.equal(f.hub.stats().waiting, 1); f.hub.move(guest.actor, guest.joined.peerId, { houseId: f.first, seq: 2, zone: 'bedroom_1', x: 0.8, y: 0.4 });
  const state = await waiting, peer = state.peers.find(p => p.id === guest.joined.peerId); assert.equal(peer.zone, 'bedroom_1'); assert.equal(peer.x, 0.8); assert.equal(f.hub.stats().waiting, 0);
  f.hub.move(guest.actor, guest.joined.peerId, { houseId: f.first, seq: 1, zone: 'yard', x: 0, y: 0 }); const after = await f.hub.poll(host.actor, f.first, host.joined.peerId, 0); assert.equal(after.revision, state.revision); assert.equal(after.peers.find(p => p.id === guest.joined.peerId).x, 0.8);
}));
test('非法区域、坐标、发送者和移动洪泛被拒绝，普通成员不能冒充别人的peer', () => withFixture(async f => {
  const host = f.join('host'), guest = f.join('guest');
  for (const change of [{ zone: 'private_room' }, { x: -1 }, { y: Infinity }, { seq: 0 }, { sender: host.joined.peerId }]) expectCode(() => f.hub.move(guest.actor, guest.joined.peerId, { houseId: f.first, seq: 1, zone: 'yard', x: 0.5, y: 0.5, ...change }), change.sender ? 'LIVE_INVALID_REQUEST' : 'LIVE_INVALID_MOVE');
  expectCode(() => f.hub.move(guest.actor, host.joined.peerId, { houseId: f.first, seq: 1, zone: 'yard', x: 0.5, y: 0.5 }), 'LIVE_MEMBER_GONE');
  for (let seq = 1; seq <= 5; seq++) f.hub.move(guest.actor, guest.joined.peerId, { houseId: f.first, seq, zone: 'yard', x: seq / 10, y: 0.5 });
  expectCode(() => f.hub.move(guest.actor, guest.joined.peerId, { houseId: f.first, seq: 6, zone: 'yard', x: 0.6, y: 0.5 }), 'LIVE_RATE_LIMIT'); f.advance(1000); assert.deepEqual(f.hub.move(guest.actor, guest.joined.peerId, { houseId: f.first, seq: 6, zone: 'yard', x: 0.6, y: 0.5 }), { ok: true });
}));
test('聊天是短纯文字且限频，同一消息幂等且不能换正文重用', () => withFixture(async f => {
  const host = f.join('host'), peer = host.joined.peerId;
  for (const value of ['', '字'.repeat(81), '换\n行', '方向\u202e字']) expectCode(() => f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_invalid', text: value }), 'LIVE_INVALID_MESSAGE');
  f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_001', text: '<b>你好</b>' }); f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_001', text: '<b>你好</b>' });
  expectCode(() => f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_001', text: '换一句' }), 'LIVE_MESSAGE_REUSED');
  f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_002', text: '一起玩吧' }); f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_003', text: '好呀' });
  expectCode(() => f.hub.chat(host.actor, peer, { houseId: f.first, clientMessageId: 'message_004', text: '太快啦' }), 'LIVE_RATE_LIMIT'); const packet = await f.hub.poll(host.actor, f.first, peer, 0); assert.equal(packet.messages.length, 3); assert.equal(packet.messages[0].text, '<b>你好</b>');
}));
test('只展示加入后的消息，房间最多32条；聊天不能跨小屋读取', () => withFixture(async f => {
  const host = f.join('host'); f.hub.chat(host.actor, host.joined.peerId, { houseId: f.first, clientMessageId: 'before_join', text: '先前的话' });
  const guest = f.join('guest'); assert.deepEqual(guest.joined.messages, []); assert.deepEqual((await f.hub.poll(guest.actor, f.first, guest.joined.peerId, 0)).messages, []);
  for (let i = 0; i < 36; i++) { f.advance(1000); f.hub.chat(host.actor, host.joined.peerId, { houseId: f.first, clientMessageId: 'after_join_' + i, text: '第' + i + '句' }); if (i % 10 === 0) await f.hub.poll(guest.actor, f.first, guest.joined.peerId, 0); }
  const packet = await f.hub.poll(guest.actor, f.first, guest.joined.peerId, 0); assert.equal(packet.messages.length, 32); assert.equal(packet.messages[0].text, '第4句'); assert.ok(packet.messages.every((m, i, a) => i === 0 || m.seq > a[i - 1].seq));
  expectCode(() => f.hub.poll(guest.actor, f.second, guest.joined.peerId, 0), 'LIVE_MEMBER_GONE');
}));
test('一个账号同时一处，后加入替换旧peer，旧leave不能退出新页面', () => withFixture(async f => {
  const old = f.join('guest'), waiting = f.hub.poll(old.actor, f.first, old.joined.peerId, old.joined.revision), rejection = rejected(waiting, 'LIVE_MEMBER_GONE');
  const next = f.join('guest', f.second); await rejection; assert.notEqual(next.joined.peerId, old.joined.peerId);
  expectCode(() => f.hub.leave(old.actor, old.joined.peerId, { houseId: f.first }), 'LIVE_MEMBER_GONE'); assert.equal(f.hub.stats().members, 1);
  assert.deepEqual(f.hub.leave(next.actor, next.joined.peerId, { houseId: f.second }), { ok: true }); assert.deepEqual(f.hub.leave(next.actor, next.joined.peerId, { houseId: f.second }), { ok: true }); assert.equal(f.hub.stats().rooms, 0);
}));
test('仅屋主可请离别人，被请离账号在本次房间生命周期不能再进', () => withFixture(async f => {
  const host = f.join('host'), guest = f.join('guest'); expectCode(() => f.hub.kick(guest.actor, guest.joined.peerId, { houseId: f.first, peerId: host.joined.peerId }), 'LIVE_FORBIDDEN'); expectCode(() => f.hub.kick(host.actor, host.joined.peerId, { houseId: f.first, peerId: host.joined.peerId }), 'LIVE_FORBIDDEN');
  const waiting = f.hub.poll(guest.actor, f.first, guest.joined.peerId, guest.joined.revision), rejection = rejected(waiting, 'LIVE_MEMBER_GONE'); f.hub.kick(host.actor, host.joined.peerId, { houseId: f.first, peerId: guest.joined.peerId }); await rejection;
  expectCode(() => f.join('guest'), 'LIVE_FORBIDDEN'); f.hub.leave(host.actor, host.joined.peerId, { houseId: f.first }); assert.equal(f.hub.stats().rooms, 0); assert.equal(f.join('guest').joined.peers.length, 1);
}));
test('主人更新布置时房间、聊天与成员保留并通知新版本，被拆掉房间里的人回前院；撤下仍立即释放', () => withFixture(async f => {
  const guest = f.join('guest'), peer = guest.joined.peerId;
  f.hub.move(guest.actor, peer, { houseId: f.first, seq: 1, zone: 'bedroom_1', x: .5, y: .5 });
  f.hub.chat(guest.actor, peer, { houseId: f.first, clientMessageId: 'keep-chat-1', text: '布置换了也还在' });
  const before = f.hub.poll(guest.actor, f.first, peer, 0); const cursor = (await before).revision;
  const waiting = f.hub.poll(guest.actor, f.first, peer, cursor);
  Object.assign(f.houses.get(f.first), { version: 'v3', zones: [] }); f.hub.sweep();
  const packet = await waiting; assert.equal(packet.houseVersion, 'v3'); assert.equal(f.hub.stats().rooms, 1);
  const self = packet.peers.find(value => value.id === peer); assert.equal(self.zone, 'yard'); assert.ok(packet.messages.some(message => message.text === '布置换了也还在'));
  expectCode(() => f.hub.move(guest.actor, peer, { houseId: f.first, seq: 2, zone: 'bedroom_1', x: .5, y: .5 }), 'LIVE_INVALID_MOVE');
  Object.assign(f.houses.get(f.first), { version: 'v4', zones: ['bedroom_1'] }); f.hub.refreshHouse(f.first); assert.equal(f.hub.poll(guest.actor, f.first, peer, 0) instanceof Promise, true);
  assert.equal((await f.hub.poll(guest.actor, f.first, peer, 0)).houseVersion, 'v4');
  const nextWait = f.hub.poll(guest.actor, f.first, peer, (await f.hub.poll(guest.actor, f.first, peer, 0)).revision), gone = rejected(nextWait, 'LIVE_HOUSE_GONE'); f.houses.delete(f.first); f.hub.sweep(); await gone; assert.equal(f.hub.stats().members, 0);
}));
test('会话撤销、账号失效和TTL均清掉成员及等待，不自动重新加入', () => withFixture(async f => {
  const first = f.join('guest'), wait = f.hub.poll(first.actor, f.first, first.joined.peerId, first.joined.revision), gone = rejected(wait, 'LIVE_AUTH_REQUIRED'); f.revoked.add(first.actor.sessionId); f.hub.sweep(); await gone; assert.equal(f.hub.stats().members, 0);
  const second = f.join('second'); f.advance(35000); f.hub.sweep(); expectCode(() => f.hub.poll(second.actor, f.first, second.joined.peerId, 0), 'LIVE_MEMBER_GONE'); assert.equal(f.hub.stats().members, 0);
}));
test('每成员仅一条等待，替换和Abort均释放旧定时器', () => withFixture(async f => {
  const guest = f.join('guest'), first = f.hub.poll(guest.actor, f.first, guest.joined.peerId, guest.joined.revision), replaced = rejected(first, 'LIVE_POLL_REPLACED'), controller = new AbortController();
  const second = f.hub.poll(guest.actor, f.first, guest.joined.peerId, guest.joined.revision, { signal: controller.signal }), aborted = rejected(second, 'LIVE_POLL_ABORTED'); await replaced; controller.abort(); await aborted; assert.equal(f.hub.stats().waiting, 0);
  const heartbeat = await f.hub.poll(guest.actor, f.first, guest.joined.peerId, guest.joined.revision); assert.equal(heartbeat.revision, guest.joined.revision); assert.equal(f.hub.stats().waiting, 0);
}));
test('房间、人次与加入限频有界，容量失败不会赶走已有成员', () => withFixture(async f => {
  const host = f.join('host'), guest = f.join('guest'); expectCode(() => f.join('third'), 'LIVE_ROOM_FULL'); assert.equal(f.hub.stats().members, 2); expectCode(() => f.join('third', f.second), 'LIVE_CAPACITY'); assert.equal(f.hub.stats().rooms, 1);
  for (let i = 0; i < 4; i++) f.hub.join(host.actor, { houseId: f.first, displayName: '主人' }); expectCode(() => f.hub.join(host.actor, { houseId: f.first, displayName: '主人' }), 'LIVE_RATE_LIMIT'); assert.equal(f.hub.stats().members, 2); assert.ok(guest.joined.peerId);
}, { maxRooms: 1, maxMembers: 2, maxRoomMembers: 2 }));
test('close在HTTP关闭前释放全部等待；重启的新Hub没有在线或聊天', () => withFixture(async f => {
  const guest = f.join('guest'), wait = f.hub.poll(guest.actor, f.first, guest.joined.peerId, guest.joined.revision), closed = rejected(wait, 'LIVE_CLOSED'); f.hub.close(); await closed; assert.deepEqual(f.hub.stats(), { rooms: 0, members: 0, waiting: 0, joinLimits: 0, knocks: 0, tickets: 0, cooldowns: 0, hosts: 0, inboxWaiting: 0 }); expectCode(() => f.join('guest'), 'LIVE_CLOSED');
  const fresh = fixture(); try { assert.equal(fresh.hub.stats().members, 0); assert.deepEqual(fresh.join('guest').joined.messages, []); } finally { fresh.hub.close(); }
}));

(async () => { let passed = 0; for (const check of checks) { await check.run(); passed++; process.stdout.write('✓ ' + check.name + '\n'); } process.stdout.write('live-hub: ' + passed + ' 组通过（纯内存，无监听）\n'); })().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
