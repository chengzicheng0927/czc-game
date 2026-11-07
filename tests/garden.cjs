'use strict';
// 使用真实存档和花园模块验证经济边界、浇水时间线与离线恢复。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/garden.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 27, 12, 0, 0).getTime();
  const RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game;
  const parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined);
  G.sys.garden.init();
  return { G, clock: () => clock, at: timestamp => { clock = timestamp; }, level: number => G.store.update(s => { s.level = number; }), parse };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('12 种作物价格与 1—90 分钟真实生长时间符合需求', () => {
  const { G } = sandbox(), expected = [[5, 1, 12], [10, 3, 25], [15, 5, 35], [15, 5, 35], [20, 8, 50], [25, 10, 65], [30, 15, 80], [30, 15, 80], [35, 20, 95], [60, 30, 160], [100, 60, 300], [120, 90, 360]];
  assert.equal(G.data.crops.length, 12); assert.equal(new Set(G.data.crops.map(c => c.id)).size, 12);
  G.data.crops.forEach((crop, i) => { assert.deepEqual([crop.seedPrice, crop.growMinutes, crop.sellPrice], expected[i]); assert.equal(crop.growMs, crop.growMinutes * 60000); });
});
test('Lv.6 开花园，初始六格，Lv.14 扩展九格；越界和重复播种不扣种子', () => {
  const { G, level } = sandbox(); assert.equal(G.sys.garden.plant(0, 'daisy').ok, false); assert.equal(G.sys.garden.capacity(), 6);
  level(6); assert.equal(G.sys.garden.plant(-1, 'daisy').ok, false); assert.equal(G.sys.garden.plant(6, 'daisy').ok, false); assert.equal(G.sys.garden.plant(0, 'missing').ok, false);
  assert.ok(G.sys.garden.plant(0, 'daisy').ok); const count = G.state.garden.seeds.daisy;
  assert.equal(G.sys.garden.plant(0, 'daisy').ok, false); assert.equal(G.state.garden.seeds.daisy, count);
  level(14); G.sys.garden.init(); assert.equal(G.sys.garden.capacity(), 9); assert.equal(G.state.garden.plots.length, 9); assert.ok(G.sys.garden.plant(8, 'daisy').ok);
});
test('三个生长阶段每段仅浇水一次，缩短当前剩余时间 30% 而不重复叠加', () => {
  const { G, level, clock, at } = sandbox(); level(6); const start = clock(); G.sys.garden.plant(0, 'daisy');
  assert.equal(G.sys.garden.status(0).stage, 0); at(start + 15000); assert.ok(G.sys.garden.water(0).ok);
  assert.equal(G.sys.garden.timeline(G.state.garden.plots[0]).stages[0].endAt, start + 18500);
  const watered = JSON.stringify(G.state); assert.equal(G.sys.garden.water(0).ok, false); assert.equal(JSON.stringify(G.state), watered);
  at(start + 20000); assert.equal(G.sys.garden.status(0).stage, 1); assert.ok(G.sys.garden.water(0).ok);
  assert.equal(G.sys.garden.timeline(G.state.garden.plots[0]).stages[1].endAt, start + 32950);
  at(start + 40000); assert.equal(G.sys.garden.status(0).stage, 2); assert.ok(G.sys.garden.water(0).ok);
  assert.equal(G.sys.garden.status(0).matureAt, start + 49065);
  at(start + 49064); assert.equal(G.sys.garden.status(0).mature, false); at(start + 49065); assert.equal(G.sys.garden.status(0).mature, true); assert.equal(G.sys.garden.water(0).ok, false);
});
test('不浇水仍离线成熟，JSON 恢复后可收获且只能收一次，经验 +3、任务和回忆增长', () => {
  const original = sandbox(); original.level(6); const G = original.G, start = original.clock(); assert.ok(G.sys.garden.plant(0, 'daisy').ok);
  const saved = JSON.parse(JSON.stringify(G.state)), next = sandbox(saved); next.at(start + 24 * 60 * 60 * 1000);
  assert.ok(next.G.sys.garden.status(0).mature); const beforeExp = next.G.state.exp, beforeStats = next.G.state.quests.stats.harvests;
  assert.ok(next.G.sys.garden.harvest(0).ok); assert.equal(next.G.state.garden.harvest.daisy, 1); assert.equal(next.G.state.exp, beforeExp + 3); assert.equal(next.G.state.quests.stats.harvests, beforeStats + 1); assert.ok(next.G.state.memories.some(m => m.text.includes('收获一份小雏菊')));
  const snapshot = JSON.stringify(next.G.state); assert.equal(next.G.sys.garden.harvest(0).ok, false); assert.equal(JSON.stringify(next.G.state), snapshot);
});
test('购买种子真实扣款，非法数量、余额不足与库存上限均不改变存档', () => {
  const { G, level } = sandbox(); level(6); assert.ok(G.sys.garden.buySeeds('daisy', 3).ok); assert.equal(G.state.wallet.coin, 285); assert.equal(G.state.garden.seeds.daisy, 6);
  for (const count of [-1, 0, 0.5, NaN, Infinity, '1', 10000]) { const snapshot = JSON.stringify(G.state); assert.equal(G.sys.garden.buySeeds('daisy', count).ok, false); assert.equal(JSON.stringify(G.state), snapshot); }
  const before = JSON.stringify(G.state); assert.equal(G.sys.garden.buySeeds('star_fruit', 3).ok, false); assert.equal(JSON.stringify(G.state), before);
  G.store.update(s => { s.garden.seeds.daisy = 9999; }); assert.equal(G.sys.garden.buySeeds('daisy', 1).ok, false);
});
test('未成熟不能收获，出售按数量计价且不能超卖，收获篮满时作物留在地里', () => {
  const { G, level, clock, at } = sandbox(); level(6); const start = clock(); G.sys.garden.plant(0, 'daisy'); assert.equal(G.sys.garden.harvest(0).ok, false);
  at(start + 60000); G.store.update(s => { s.garden.harvest.daisy = 9999; }); assert.equal(G.sys.garden.harvest(0).ok, false); assert.ok(G.state.garden.plots[0]);
  const before = G.state.wallet.coin; assert.ok(G.sys.garden.sell('daisy', 3).ok); assert.equal(G.state.wallet.coin, before + 36); assert.equal(G.state.garden.harvest.daisy, 9996); assert.ok(G.sys.garden.harvest(0).ok);
  for (const count of [-1, 0, 0.5, 9999]) { const snapshot = JSON.stringify(G.state); assert.equal(G.sys.garden.sell('daisy', count).ok, false); assert.equal(JSON.stringify(G.state), snapshot); }
});
test('星星果只按真实夜间时段播种，切换画面昼夜不能绕过', () => {
  const { G, level, clock, at } = sandbox(); level(6); const noon = clock(); assert.ok(G.sys.garden.buySeeds('star_fruit', 1).ok);
  G.store.update(s => { s.settings.dayMode = 'night'; }); assert.equal(G.sys.garden.plant(0, 'star_fruit').ok, false); assert.equal(G.state.garden.seeds.star_fruit, 1);
  at(noon + 6 * 60 * 60 * 1000); const dusk = JSON.stringify(G.state); const refused = G.sys.garden.plant(0, 'star_fruit'); assert.equal(refused.ok, false); assert.match(refused.message, /20:00/); assert.equal(JSON.stringify(G.state), dusk);
  assert.equal(G.sys.garden.isNight(new Date(2026, 9, 27, 19, 59, 59).getTime()), false);
  at(noon + 8 * 60 * 60 * 1000); assert.ok(G.sys.garden.plant(0, 'star_fruit').ok); assert.equal(G.state.garden.seeds.star_fruit, 0);
  assert.equal(G.sys.garden.isNight(new Date(2026, 9, 28, 5, 59, 59).getTime()), true); assert.equal(G.sys.garden.isNight(new Date(2026, 9, 28, 6, 0, 0).getTime()), false);
});
test('每日收获任务跟随真实收获次数，不因出售增加', () => {
  const { G, level, clock, at } = sandbox(); level(6);
  const daily = G.data.dailyQuests.find(q => q.metric === 'harvests');
  if (!daily) throw new Error('请接入花园每日任务');
  G.store.update(s => { if (!s.quests.daily.list.some(q => q.id === daily.id)) s.quests.daily.list = [{ id: daily.id, progress: 0, done: false, claimed: false }]; });
  const start = clock(); G.sys.garden.plant(0, 'daisy'); at(start + 60000); G.sys.garden.harvest(0);
  assert.equal(G.state.quests.daily.list.find(q => q.id === daily.id).progress, 1); G.sys.garden.sell('daisy', 1); assert.equal(G.state.quests.daily.list.find(q => q.id === daily.id).progress, 1);
});
test('温室使新播种作物生长速度 +20%，已种作物仍按存档时间线生长', () => {
  const { G, level } = sandbox(); level(14); const greenhouse = G.data.rooms.find(r => ['greenhouse', 'conservatory'].includes(r.id));
  if (!greenhouse) throw new Error('请接入温室花房');
  G.sys.garden.plant(0, 'daisy'); assert.equal(G.state.garden.plots[0].durationMs, 60000); G.store.update(s => { s.wallet.coin = 1000; });
  assert.ok(G.sys.building.buildRoom(0, 0, greenhouse.id).ok); assert.ok(G.sys.garden.hasGreenhouse()); assert.ok(G.sys.garden.plant(1, 'daisy').ok); assert.equal(G.state.garden.plots[1].durationMs, 50000); assert.equal(G.state.garden.plots[0].durationMs, 60000);
});
test('旧版空花园与单款小游戏存档安全补齐，保留既有财富、成绩与音频迁移', () => {
  const source = sandbox(), legacy = JSON.parse(JSON.stringify(source.G.state));
  legacy.wallet.coin = 1234; legacy.garden = { plots: [] }; legacy.minigames = { bakery: { best: 7, playsToday: 2, date: '2026-10-27' } }; delete legacy.settings.audioVersion; delete legacy.settings.ttsVoice; legacy.settings.music = 0.5; legacy.settings.sfx = 0; legacy.settings.tts = true;
  const { G } = sandbox(legacy); assert.equal(G.state.wallet.coin, 1234); assert.equal(G.state.garden.plots.length, 6); assert.equal(G.state.garden.seeds.daisy, 3); assert.equal(G.state.minigames.bakery.best, 7); assert.equal(G.state.minigames.bakery.playsToday, 2); assert.equal(Object.keys(G.state.minigames).length, 4); assert.equal(G.state.minigames.memory.best, 0); assert.equal(G.state.settings.music, 0.22); assert.equal(G.state.settings.sfx, 0); assert.equal(G.state.settings.tts, false);
  G.store.update(s => { s.garden.seeds = {}; }); assert.equal(Object.keys(G.state.garden.seeds).length, 0); const restored = sandbox(JSON.parse(JSON.stringify(G.state))); assert.equal(Object.keys(restored.G.state.garden.seeds).length, 0);
});
test('坏作物库存、伪造时间线和越阶段浇水被拒绝，原来的存档保持完整', () => {
  const { G, level, clock, parse } = sandbox(); level(6); const start = clock(); G.sys.garden.plant(0, 'daisy'); const snapshot = JSON.stringify(G.state);
  const variants = [
    s => { s.garden.seeds.unknown_crop = 1; }, s => { s.garden.harvest.daisy = -1; }, s => { s.garden.seeds.daisy = 0.5; }, s => { s.garden.seeds.daisy = '3'; }, s => { s.garden.harvest.daisy = 10000; },
    s => { s.garden.plots[0].crop = 'unknown_crop'; }, s => { s.garden.plots[0].durationMs = 1; }, s => { s.garden.plots[0].plantedAt = -1; }, s => { s.garden.plots[0].watered = [start, null, null, null]; },
    s => { s.garden.plots[0].watered = [start - 1, null, null]; }, s => { s.garden.plots[0].watered = [start + 20000, null, null]; }, s => { s.garden.plots[0].watered = [start + 15000, start + 18000, null]; }, s => { s.garden.plots.push(null); }
  ];
  for (const mutate of variants) { const bad = JSON.parse(snapshot); mutate(bad); assert.throws(() => G.store.replace(parse(bad))); assert.equal(JSON.stringify(G.state), snapshot); }
});
test('四款小游戏成绩要求完整记录、合法日期与非负整数，未知游戏拒绝', () => {
  const { G, parse } = sandbox(), snapshot = JSON.stringify(G.state);
  const variants = [s => { s.minigames.memory = null; }, s => { delete s.minigames.match3.best; }, s => { s.minigames.catch_stars.playsToday = -1; }, s => { s.minigames.memory.best = 0.1; }, s => { s.minigames.match3.date = '2026-02-30'; }, s => { s.minigames.unknown = { best: 0, playsToday: 0, date: '2026-10-27' }; }];
  for (const mutate of variants) { const bad = JSON.parse(snapshot); mutate(bad); assert.throws(() => G.store.replace(parse(bad))); assert.equal(JSON.stringify(G.state), snapshot); }
});
test('每日任务同日固定三项，连续四天覆盖收获任务且没有重复', () => {
  const { G } = sandbox(); let sawHarvest = false;
  for (let day = 27; day <= 30; day++) { const date = '2026-10-' + day, ids = G.data.dailyQuestsForDate(date).map(q => q.id); assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3); assert.equal(JSON.stringify(G.data.dailyQuestsForDate(date).map(q => q.id)), JSON.stringify(ids)); if (ids.includes('daily_harvest')) sawHarvest = true; }
  assert.equal(sawHarvest, true); assert.equal(G.state.quests.daily.list.length, 3);
});
test('浇水拒写不改变阶段，不发成功事件；重入被挡后可重试', () => {
  const { G, level } = sandbox(); level(6); G.sys.garden.plant(0, 'daisy');
  let events = 0, nested; G.bus.on('garden:watered', () => { events++; nested = G.sys.garden.water(1); });
  const commit = G.save.commit, before = JSON.stringify(G.state); G.save.commit = () => false;
  assert.equal(G.sys.garden.water(0).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(events, 0);
  G.save.commit = commit; assert.ok(G.sys.garden.water(0).ok); assert.equal(events, 1); assert.equal(nested.ok, false);
});
test('收获库存/经验/扩地一次提交，拒写无事件、无半份奖励', () => {
  const { G, level, clock, at } = sandbox(); level(13); G.sys.garden.plant(0, 'daisy'); at(clock() + 60000);
  G.store.update(s => { s.exp = G.sys.economy.needExp(13) - 1; });
  let events = 0, levels = 0, nested, saved;
  G.bus.on('garden:harvested', () => { events++; nested = G.sys.garden.harvest(0); });
  G.bus.on('level:up', () => levels++);
  const commit = G.save.commit, before = JSON.stringify(G.state); G.save.commit = () => false;
  assert.equal(G.sys.garden.harvest(0).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(events, 0); assert.equal(levels, 0);
  G.save.commit = state => { saved = JSON.parse(JSON.stringify(state)); return commit(state); };
  assert.ok(G.sys.garden.harvest(0).ok); assert.equal(events, 1); assert.equal(levels, 1); assert.equal(nested.ok, false);
  assert.equal(saved.level, 14); assert.equal(saved.exp, 2); assert.equal(saved.garden.plots.length, 9); assert.equal(saved.garden.plots[0], null); assert.equal(saved.garden.harvest.daisy, 1);
  assert.equal(G.state.quests.stats.harvests, 1); assert.equal(G.sys.garden.harvest(0).ok, false);
});
console.log('\n' + passed + ' 个花园规则场景全部通过。');
