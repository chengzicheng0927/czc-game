'use strict';
const assert = require('node:assert/strict');
const { setup, village, advance } = require('./fixtures/content-concert.cjs');
let passed = 0;
const spaces = require('./fixtures/free-spaces.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function prepared() { const env = setup(), built = village(env.G); return { ...env, built }; }
function perform(G, roomId) { const result = G.sys.concert.begin(roomId); assert.ok(result.ok, result.message); assert.ok(G.sys.concert.advance(result.sessionId).ok); assert.ok(G.sys.concert.advance(result.sessionId).ok); return { id: result.sessionId, finish: () => G.sys.concert.finish(result.sessionId) }; }
test('没有音乐室或入住朋友时不能举办，未知/原型房间ID被拒绝', () => {
  const { G } = setup(); assert.equal(G.sys.concert.status().canStart, false); assert.equal(G.sys.concert.begin().ok, false);
  G.store.update(s => { s.level = 30; s.wallet.coin = 5000; });
  assert.ok(spaces.buildSpace(G, 0, 0, 'music').ok); assert.equal(G.sys.concert.begin().ok, false);
  const full = prepared().G; for (const id of ['__proto__', 'constructor', 'no_room', {}, null]) assert.equal(full.sys.concert.begin(id).ok, false);
});
test('必须完成三段再谢幕，中途关闭没有财富/任务/回忆变化', () => {
  const { G, built } = prepared(), before = JSON.stringify(G.state), start = G.sys.concert.begin(built.auxiliary.music);
  assert.equal(G.sys.concert.finish(start.sessionId).ok, false); assert.ok(G.sys.concert.advance(start.sessionId).ok); assert.equal(G.sys.concert.finish(start.sessionId).ok, false);
  G.sys.concert.cancel(start.sessionId); assert.equal(G.sys.concert.advance(start.sessionId).ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('第一次完整谢幕持久化一条回忆和举办凭据，无额外货币、经验或小游戏次数', () => {
  const { G, built } = prepared(), before = plain(G.state), events = []; G.bus.on('concert:finished', event => events.push(event));
  const result = perform(G, built.auxiliary.music).finish(); assert.ok(result.ok && result.first); assert.equal(G.state.quests.stats.concerts, 1);
  assert.equal(G.state.memories.length, Math.min(G.data.balance.maxMemories, before.memories.length + 1)); assert.equal(G.state.memories.at(-1).text.includes('小合奏'), true);
  assert.deepEqual(plain(G.state.wallet), before.wallet); assert.equal(G.state.exp, before.exp); assert.equal(G.state.quests.stats.minigamePlays, before.quests.stats.minigamePlays); assert.equal(events.length, 1);
});
test('重演和重复点击不重复凭据、回忆、货币或完成事件', () => {
  const { G, built } = prepared(), first = perform(G, built.auxiliary.music); assert.ok(first.finish().ok); const before = JSON.stringify(G.state);
  assert.equal(first.finish().ok, false); const second = perform(G, built.auxiliary.music).finish(); assert.ok(second.ok && !second.first); assert.equal(JSON.stringify(G.state), before);
});
test('保存拒写时不发布完成，可在同一场谢幕重试', () => {
  const { G, built } = prepared(), performance = perform(G, built.auxiliary.music), before = JSON.stringify(G.state), commit = G.save.commit; let events = 0;
  G.bus.on('concert:finished', () => events++); G.save.commit = () => false; assert.equal(performance.finish().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(events, 0);
  G.save.commit = commit; assert.ok(performance.finish().ok); assert.equal(events, 1);
});
test('同步保存与状态通知中的重入不能抢演出或重复谢幕', () => {
  const { G, built } = prepared(), performance = perform(G, built.auxiliary.music); const commit = G.save.commit; let rejected = 0;
  G.save.commit = state => { assert.equal(G.sys.concert.begin().ok, false); assert.equal(performance.finish().ok, false); rejected++; return commit(state); };
  const off = G.bus.on('state:change', () => { assert.equal(performance.finish().ok, false); rejected++; });
  assert.ok(performance.finish().ok); off(); assert.equal(rejected, 2); assert.equal(G.state.quests.stats.concerts, 1);
});
test('换档、音乐空间拆除或参加朋友改变后旧会话失效', () => {
  for (const mutation of ['replace', 'room', 'guests']) {
    const { G, parse, built } = prepared(), performance = perform(G, built.auxiliary.music);
    if (mutation === 'replace') G.store.replace(parse(plain(G.state)));
    if (mutation === 'room') assert.ok(spaces.removeSpace(G, built.auxiliary.music).ok);
    if (mutation === 'guests') G.store.update(s => { s.residents.lily.movedIn = false; });
    assert.equal(performance.finish().ok, false); assert.equal(G.state.quests.stats.concerts, 0);
  }
});
test('新主线需要真实音乐会凭据，旧已领取音乐会保持已领', () => {
  const { G, built } = prepared(); advance(G, built, 'island_concert');
  let quest = G.sys.quests.list().find(q => q.id === 'island_concert'); assert.equal(quest.done, false); assert.equal(G.sys.quests.claim('island_concert').ok, false);
  assert.ok(perform(G, built.auxiliary.music).finish().ok); assert.equal(G.sys.quests.list().find(q => q.id === quest.id).done, true); assert.ok(G.sys.quests.claim(quest.id).ok);
  const raw = plain(G.state); delete raw.quests.stats.concerts; const old = setup(raw).G; quest = old.sys.quests.list().find(q => q.id === 'island_concert'); assert.ok(quest.claimed && quest.done); assert.equal(old.state.quests.stats.concerts, 0); assert.equal(old.sys.quests.claim(quest.id).ok, false);
});
test('JSON恢复与MD回忆保留举办记录，缺失新字段旧档补0', () => {
  const { G, built } = prepared(); assert.ok(perform(G, built.auxiliary.music).finish().ok);
  const restored = setup(plain(G.state)).G; assert.equal(restored.sys.concert.status().completed, true); restored.utils.download = () => {}; assert.ok(restored.save.exportMemory().includes('已完整举办海风与森林的小合奏'));
  const raw = plain(G.state); delete raw.quests.stats.concerts; delete raw.residentNotices; const old = setup(raw).G; assert.equal(old.state.quests.stats.concerts, 0); assert.deepEqual(Array.from(old.state.residentNotices), []);
});
test('举办凭据与居民通知字段严格拒绝损坏输入', () => {
  const { G, parse } = setup(); for (const value of [-1, 2, .5, '1', null]) { const raw = plain(G.state); raw.quests.stats.concerts = value; assert.throws(() => G.store.validate(parse(raw))); }
  for (const value of [null, {}, ['lily', 'lily'], ['missing'], ['constructor']]) { const raw = plain(G.state); raw.residentNotices = value; assert.throws(() => G.store.validate(parse(raw))); }
});
console.log('\n' + passed + ' 组音乐会检查通过。');
