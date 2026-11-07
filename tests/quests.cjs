'use strict';
// 验证任务/成就的领取事务和迁移。主线程串行执行，不在此创建服务或浏览器。
const assert = require('node:assert/strict');
const { setup, village, advance, finish, legacyIds } = require('./fixtures/quest-village.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = G => JSON.stringify(G.state);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function unchanged(G, fn) { const before = snapshot(G); const result = fn(); assert.equal(result.ok, false, result.message); assert.equal(snapshot(G), before, '失败不能修改进度/财富'); }
function fulfilledDaily(G) {
  G.store.update(s => { s.quests.daily.list.forEach(entry => { const def = G.data.dailyQuests.find(q => q.id === entry.id); entry.progress = def.target; entry.done = true; }); });
}
function completeMain() { const env = setup(), built = village(env.G); advance(env.G, built); return { ...env, built }; }
function validPhoto(id = 'photo_qa') { return { id, at: new Date(2026, 9, 28, 12).getTime(), name: '规则测试小图', image: 'data:image/jpeg;base64,/9j/2Q==', width: 300, height: 180 }; }

test('未达标/后续/未知主线领取均无副作用，当前条件实时计算', () => {
  const { G } = setup(); unchanged(G, () => G.sys.quests.claim('name_home')); unchanged(G, () => G.sys.quests.claim('rainbow_party')); unchanged(G, () => G.sys.quests.claim('missing_quest'));
  G.store.update(s => { s.house.name = '云上的第一盏灯'; }); const q = G.sys.quests.list().find(q => q.id === 'name_home'); assert.ok(q.done && !q.locked);
  const before = G.state.wallet.coin, reward = q.reward.coin; assert.ok(G.sys.quests.claim(q.id).ok); assert.equal(G.state.wallet.coin, before + reward); unchanged(G, () => G.sys.quests.claim(q.id));
});

test('五章依序结束发七种不同碎片，第4章居民可达，最后两件纪念家具原子发一次', () => {
  const { G } = setup(), built = village(G); const events = []; G.bus.on('quest:claimed', event => events.push(event));
  advance(G, built, 'rainbow_party'); assert.equal(G.state.quests.main.claimed.length, 34); assert.equal(G.state.rainbowPieces.length, 6); assert.equal(G.sys.quests.ending().unlocked, false);
  assert.equal(G.state.inventory.achievement_rainbow || 0, 0); assert.equal(G.state.inventory.achievement_home_master || 0, 0);
  const coin = G.state.wallet.coin, q = G.data.mainQuests.find(q => q.id === 'rainbow_party'), expected = q.reward.coin + G.data.milestoneRewards.reduce((n, def) => n + def.reward.coin, 0);
  const result = G.sys.quests.claim('rainbow_party'); assert.ok(result.ok && result.endingUnlocked); assert.equal(result.chapterCompleted, 5); assert.equal(G.state.wallet.coin, coin + expected);
  assert.deepEqual([...G.state.rainbowPieces].sort(), ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'].sort());
  assert.deepEqual([...G.state.quests.milestoneClaims].sort(), ['rainbow', 'home_master'].sort()); assert.equal(G.state.inventory.achievement_rainbow, 1); assert.equal(G.state.inventory.achievement_home_master, 1);
  assert.equal(events.length, 35); assert.equal(events.filter(event => event.endingUnlocked).length, 1); assert.deepEqual(Array.from(G.sys.quests.chapters(), chapter => chapter.complete), [true, true, true, true, true]);
  unchanged(G, () => G.sys.quests.claim('rainbow_party'));
});

test('故事只在已解锁章节记已读，重读/结局重播不重复发奖或重复记录', () => {
  const { G } = setup(); unchanged(G, () => G.sys.quests.markStorySeen(2)); unchanged(G, () => G.sys.quests.markEndingSeen());
  assert.ok(G.sys.quests.markStorySeen(1).ok); const read = snapshot(G); assert.ok(G.sys.quests.markStorySeen(1).ok); assert.equal(snapshot(G), read);
  const full = completeMain(), F = full.G; for (const chapter of F.sys.quests.chapters()) assert.ok(F.sys.quests.markStorySeen(chapter.id).ok);
  const coin = F.state.wallet.coin; assert.ok(F.sys.quests.markEndingSeen().ok); assert.equal(F.state.wallet.coin, coin); const seen = snapshot(F); assert.ok(F.sys.quests.markEndingSeen().ok); assert.equal(snapshot(F), seen);
  const restored = setup(plain(F.state)); assert.equal(restored.G.sys.quests.ending().seen, true); assert.equal(restored.G.state.wallet.coin, coin); assert.deepEqual(Array.from(restored.G.state.quests.main.storySeen), [1, 2, 3, 4, 5]);
});

test('旧17领取凭据和历史绿/青色片跨迁移保留，插入任务补位但没有回退章节或重奖', () => {
  const { G, parse } = setup(), raw = plain(G.state); raw.house.name = '旧小屋'; raw.wallet.coin = 7654; raw.quests.main = { chapter: 4, index: 17, claimed: legacyIds.slice() }; raw.rainbowPieces = ['red', 'orange', 'yellow', 'green', 'cyan'];
  delete raw.quests.milestoneClaims; delete raw.quests.stats.bakeryOrders; delete raw.quests.stats.bakeryPlays; raw.minigames.bakery = { best: 4, playsToday: 2, date: raw.quests.daily.date };
  G.store.replace(parse(raw)); G.sys.init(); assert.equal(G.state.wallet.coin, 7654); assert.equal(G.state.quests.main.chapter, 4); assert.equal(G.state.quests.main.schema, 2); assert.deepEqual(Array.from(G.state.quests.main.claimed), legacyIds);
  assert.deepEqual(Array.from(G.state.rainbowPieces), raw.rainbowPieces); assert.equal(G.sys.quests.metric('bakeryOrders'), 4); assert.equal(G.sys.quests.metric('bakeryPlays'), 2);
  const first = G.sys.quests.list().find(q => q.type === 'main' && !q.claimed && !q.locked); assert.equal(first.id, 'garden_morning'); assert.equal(G.state.quests.main.index, G.data.mainQuests.findIndex(q => q.id === first.id));
  unchanged(G, () => G.sys.quests.claim('bamboo_friend')); const loaded = setup(plain(G.state)); assert.equal(loaded.G.state.wallet.coin, 7654); assert.deepEqual(Array.from(loaded.G.state.rainbowPieces), raw.rainbowPieces);
});

test('蛋糕任务计真实bakery session，订单累计精确一次，其它游戏与坏成绩不能冒充', () => {
  const { G } = setup(); G.store.update(s => { s.level = 30; s.wallet.coin = 10000; });
  finish(G, 'memory', 20); assert.equal(G.sys.quests.metric('bakeryPlays'), 0); assert.equal(G.sys.quests.list().find(q => q.id === 'first_cake').done, false);
  const sessionId = G.sys.minigames.begin('bakery'); unchanged(G, () => G.sys.minigames.finish('bakery', { sessionId, score: 1.5, stars: 1 }));
  const event = G.sys.minigames.finish('bakery', { sessionId, score: 3, stars: 1 }); assert.ok(event.ok); assert.equal(G.sys.quests.metric('bakeryOrders'), 3); assert.equal(G.sys.quests.metric('bakeryPlays'), 1);
  unchanged(G, () => G.sys.minigames.finish('bakery', { sessionId, score: 3, stars: 1 })); finish(G, 'bakery', 2); assert.equal(G.sys.quests.metric('bakeryOrders'), 5); assert.equal(G.sys.quests.metric('bakeryPlays'), 2);
});

test('8类40成就逐阶领取，未达标或越阶拒绝，界面派生进度不伪造成完成', () => {
  const { G } = setup(); assert.equal(G.sys.achievements.list().length, 40); assert.equal(G.sys.achievements.categories().length, 8); unchanged(G, () => G.sys.achievements.claim('builder_1')); unchanged(G, () => G.sys.achievements.claim('builder_5')); unchanged(G, () => G.sys.achievements.claim('unknown'));
  G.store.update(s => { s.quests.stats.roomCount = 12; s.quests.stats.collection = 100; }); assert.equal(G.sys.achievements.list('builder')[0].progress, 0, '现有房间数不能靠同名计数伪造'); assert.equal(G.sys.quests.metric('collection'), 3);
  const full = completeMain(), F = full.G; assert.equal(F.sys.achievements.summary().ready, 8); unchanged(F, () => F.sys.achievements.claim('collector_5'));
  for (const category of F.data.achievementCategories) for (const achievement of F.sys.achievements.list(category.id)) { const current = F.sys.achievements.list(category.id).find(q => q.id === achievement.id); assert.ok(current.done && current.available, current.id); assert.ok(F.sys.achievements.claim(current.id).ok); }
  assert.equal(F.sys.achievements.summary().done, 40); assert.equal(F.sys.achievements.summary().ready, 0); assert.ok(F.sys.achievements.categories().every(category => category.done === 5)); unchanged(F, () => F.sys.achievements.claim('photographer_5'));
  for (const category of F.data.achievementCategories) assert.equal(F.state.inventory[F.data.achievementGiftById[category.id]], 1, category.id + '限定家具');
});

test('主线与40成就JSON恢复不补发，徽章/10件奖励家具领取凭据完整', () => {
  const { G } = completeMain(); for (const category of G.data.achievementCategories) for (const q of G.sys.achievements.list(category.id)) assert.ok(G.sys.achievements.claim(q.id).ok);
  const raw = plain(G.state), coin = raw.wallet.coin, restored = setup(raw).G; assert.equal(restored.state.wallet.coin, coin); assert.equal(restored.sys.achievements.summary().done, 40);
  assert.deepEqual(plain(restored.state.quests.achievements), raw.quests.achievements); assert.deepEqual(plain(restored.state.quests.milestoneClaims), raw.quests.milestoneClaims);
  for (const id of Object.values(restored.data.achievementGiftById)) assert.equal(restored.state.inventory[id], 1, id);
  unchanged(restored, () => restored.sys.achievements.claim('builder_5')); unchanged(restored, () => restored.sys.quests.claim('rainbow_party'));
});

test('每日宝箱要先收三张任务奖励，只发一次且读取配置中的完整奖励', () => {
  const { G } = setup(); fulfilledDaily(G); assert.equal(G.sys.quests.dailyChest().available, false); unchanged(G, () => G.sys.quests.claimDailyChest());
  for (const entry of G.state.quests.daily.list) assert.ok(G.sys.quests.claim(entry.id).ok);
  const before = plain(G.state.wallet), reward = G.data.dailyChestReward; assert.ok(G.sys.quests.dailyChest().available); assert.ok(G.sys.quests.claimDailyChest().ok);
  assert.equal(G.state.wallet.coin, before.coin + reward.coin); assert.equal(G.state.wallet.heart, before.heart + reward.heart); unchanged(G, () => G.sys.quests.claimDailyChest());
  const restored = setup(plain(G.state)).G; assert.equal(restored.sys.quests.dailyChest().claimed, true); unchanged(restored, () => restored.sys.quests.claimDailyChest());
});

test('新日不追发旧宝箱，回拨日期仍锁住未来清单，空清单不构成完成', () => {
  const { G, at } = setup(); fulfilledDaily(G); for (const entry of G.state.quests.daily.list) assert.ok(G.sys.quests.claim(entry.id).ok);
  const coin = G.state.wallet.coin; at('2026-10-29'); G.sys.init(); assert.equal(G.state.wallet.coin, coin); assert.equal(G.sys.quests.dailyChest().done, 0); assert.equal(G.sys.quests.dailyChest().claimed, false); unchanged(G, () => G.sys.quests.claimDailyChest());
  at('2026-10-28'); G.sys.init(); assert.equal(G.state.quests.daily.date, '2026-10-29'); assert.ok(G.sys.quests.list().filter(q => q.type === 'daily').every(q => q.locked)); unchanged(G, () => G.sys.quests.claimDailyChest());
  at('2026-10-29'); G.store.update(s => { s.quests.daily.list = []; }); assert.equal(G.sys.quests.dailyChest().available, false); unchanged(G, () => G.sys.quests.claimDailyChest());
});

test('金币或奖励家具满时领奖失败保持全部事务，腾位后仍能领一次', () => {
  const { G } = setup(); G.store.update(s => { s.house.name = '满满的糖果罐'; s.wallet.coin = 1000000000; }); unchanged(G, () => G.sys.quests.claim('name_home'));
  const full = completeMain(), F = full.G; for (let tier = 1; tier < 5; tier++) assert.ok(F.sys.achievements.claim('builder_' + tier).ok);
  F.store.update(s => { s.inventory.achievement_builder = 9999; }); unchanged(F, () => F.sys.achievements.claim('builder_5')); F.store.update(s => { s.inventory.achievement_builder = 0; }); assert.ok(F.sys.achievements.claim('builder_5').ok); assert.equal(F.state.inventory.achievement_builder, 1);
});

test('未知/伪造/越阶成就、重复色片、重复任务、假结局和坏照片导入均拒绝保留原档', () => {
  const { G, parse } = setup(), baseline = plain(G.state), before = snapshot(G);
  const mutations = [
    s => { s.quests.achievements.unknown = true; }, s => { s.quests.achievements.builder_1 = false; }, s => { s.quests.achievements.builder_1 = { claimed: true, reward: 999 }; }, s => { s.quests.achievements.builder_5 = true; },
    s => { s.rainbowPieces = ['red', 'red']; }, s => { s.quests.main.storySeen = [1, 1]; }, s => { s.quests.main.storySeen = [2]; }, s => { s.quests.main.endingSeen = true; }, s => { s.quests.main.index = 3; },
    s => { s.quests.milestoneClaims = ['rainbow']; }, s => { s.quests.milestoneClaims = ['unknown']; }, s => { s.quests.daily.list[1] = plain(s.quests.daily.list[0]); }, s => { s.quests.daily.chestClaimed = true; },
    s => { s.album = [{ ...validPhoto(), image: 'data:image/svg+xml;base64,PHN2Zy8+' }]; s.quests.stats.photos = 1; },
    s => { s.album = [validPhoto(), validPhoto()]; s.quests.stats.photos = 2; }, s => { s.album = [{ ...validPhoto(), width: 601 }]; s.quests.stats.photos = 1; }, s => { s.album = [{ ...validPhoto(), reward: 100 }]; s.quests.stats.photos = 1; },
    s => { s.album = [validPhoto()]; s.quests.stats.photos = 0; }, s => { s.album = [{ ...validPhoto(), at: -1 }]; s.quests.stats.photos = 1; }
  ];
  for (const mutate of mutations) { const raw = plain(baseline); mutate(raw); assert.throws(() => G.store.replace(parse(raw))); assert.equal(snapshot(G), before); }
});

console.log('\n' + passed + ' 组主线/成就/每日宝箱事务检查通过（无服务或浏览器；规则夹具不代表自然游玩节奏）。');
