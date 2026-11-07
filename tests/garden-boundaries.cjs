'use strict';
// 使用真实存档和花园模块验证经济边界、浇水时间线与离线恢复。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/garden.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 27, 12, 0, 0).getTime();
  const RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game;
  const parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  spaces.register(G, context.CottageBuilding); G.store.init(saved ? parse(saved) : undefined);
  G.sys.garden.init();
  return { G, clock: () => clock, at: timestamp => { clock = timestamp; }, level: number => G.store.update(s => { s.level = number; }), parse };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('未成熟不能收获，出售按数量计价且不能超卖，收获篮满时作物留在地里', () => {
  const { G, level, clock, at } = sandbox(); level(6); const start = clock(); G.sys.garden.plant(0, 'daisy'); assert.equal(G.sys.garden.harvest(0).ok, false);
  at(start + 60000); G.store.update(s => { s.garden.harvest.daisy = 9999; }); assert.equal(G.sys.garden.harvest(0).ok, false); assert.ok(G.state.garden.plots[0]);
  const before = G.state.wallet.coin; assert.ok(G.sys.garden.sell('daisy', 3).ok); assert.equal(G.state.wallet.coin, before + 36); assert.equal(G.state.garden.harvest.daisy, 9996); assert.ok(G.sys.garden.harvest(0).ok);
  for (const count of [-1, 0, 0.5, 9999]) { const snapshot = JSON.stringify(G.state); assert.equal(G.sys.garden.sell('daisy', count).ok, false); assert.equal(JSON.stringify(G.state), snapshot); }
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
console.log('\n' + passed + ' 组保留内容边界检查通过。');
