'use strict';
const assert = require('node:assert/strict');
const { setup, village, advance, legacyIds } = require('./fixtures/quest-village.cjs');
let passed = 0; function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('35条主线保留17个旧ID的相对顺序，五章均有可计算目标', () => {
  const { G } = setup(); assert.equal(G.data.mainQuests.length, 35); assert.equal(new Set(G.data.mainQuests.map(q => q.id)).size, 35);
  assert.deepEqual(Array.from(G.data.mainQuests.filter(q => legacyIds.includes(q.id)), q => q.id), legacyIds);
  for (const q of G.data.mainQuests) { assert.ok(q.target > 0); assert.ok(q.reward.coin > 0 && q.reward.exp > 0); assert.ok(q.chapter >= 1 && q.chapter <= 5); }
});
test('真实房间与入住API接通五章，彩虹到第4章才能入住，最后35条完成且12位分入6卧室', () => {
  const { G } = setup(), built = village(G); assert.equal(G.sys.residents.eligibility('rainbow').ok, false);
  advance(G, built, 'shy_rainbow_friend'); assert.equal(G.state.quests.main.chapter, 4); assert.ok(G.sys.residents.eligibility('rainbow').ok);
  advance(G, built); assert.equal(G.state.quests.main.chapter, 5); assert.equal(G.state.quests.main.claimed.length, 35);
  assert.equal(Object.values(G.state.residents).filter(r => r.movedIn).length, 12); assert.ok(built.bedrooms.every(room => Object.values(G.state.residents).filter(r => r.movedIn && r.roomId === room).length === 2));
  assert.equal(new Set(G.state.rainbowPieces).size, 7); assert.ok(G.sys.quests.ending().unlocked);
  const before = JSON.stringify(G.state); assert.equal(G.sys.quests.claim('acorn_collector').ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(JSON.stringify(G.store.validate(G.state)), before);
});
test('提前点击已达成的后续主线仍被锁住，失败不扣发货币', () => {
  const { G } = setup(); village(G); const before = JSON.stringify(G.state); assert.equal(G.sys.quests.claim('bamboo_friend').ok, false); assert.equal(G.sys.quests.claim('rainbow_party').ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('旧10任务完成档保留奖励，新增中间任务成为当前项，迁移和刷新不重发', () => {
  const { G, parse } = setup(), raw = JSON.parse(JSON.stringify(G.state)); raw.quests.main = { chapter: 2, index: 10, claimed: legacyIds.slice(0, 10) }; const coin = raw.wallet.coin;
  G.store.replace(parse(raw)); G.sys.init(); assert.equal(G.state.wallet.coin, coin); assert.equal(G.state.quests.main.index, G.data.mainQuests.findIndex(q => q.id === 'garden_morning'));
  const current = G.sys.quests.list().find(q => q.id === 'garden_morning'); assert.equal(current.locked, false); assert.equal(current.done, false); assert.equal(G.state.quests.main.chapter, 2);
});
console.log('\n' + passed + ' 组五章成长链检查通过（无服务或浏览器；累计历史为显式规则夹具）。');
