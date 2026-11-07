'use strict';
// 使用真实规则验证发现历史、旧档迁移和手动套装奖励；由主线程串行执行，不启动服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/avatar.js', 'js/systems/garden.js', 'js/systems/collection-book.js'];
function sandbox(saved) {
  const context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  spaces.register(G, context.CottageBuilding); G.store.init(saved ? parse(saved) : undefined); G.sys.init(); G.sys.collectionBook.init();
  return { G, parse };
}
const plain = value => JSON.parse(JSON.stringify(value));
function complete(G, id) { G.store.update(state => G.sys.collectionBook.regularIds(id).forEach(itemId => { state.collection[itemId] = true; })); }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('旧档只由篮子里的正数收获迁移花果；种子、生长与累计收获数不推测新品种', () => {
  const { G, parse } = sandbox(), old = parse(G.store.defaultState()); delete old.collectionBook; old.garden.harvest.rose = 2; old.garden.harvest.daisy = 0; old.garden.seeds.star_fruit = 4; old.quests.stats.harvests = 999; old.inventory.sofa_forest = 1;
  old.garden.plots[0] = parse({ crop: 'tulip', plantedAt: Date.now(), durationMs: G.data.cropById.tulip.growMs, watered: [null, null, null] });
  G.store.replace(old); G.sys.collectionBook.init();
  assert.deepEqual(plain(G.state.collectionBook.crops), ['rose']); assert.equal(G.sys.collectionBook.get('crops', 'tulip').collected, false); assert.equal(G.sys.collectionBook.get('crops', 'star_fruit').collected, false); assert.equal(G.state.collection.sofa_forest, true);
  const before = JSON.stringify(G.state); G.sys.collectionBook.init(); G.sys.collectionBook.init(); assert.equal(JSON.stringify(G.state), before);
});
test('空篮子的伪造收获事件、无效品种和无效数量均不能点亮图鉴', () => {
  const { G } = sandbox(), before = JSON.stringify(G.state);
  for (const event of [null, {}, { crop: 'rose', count: 1 }, { crop: 'fake', count: 1 }, { crop: '__proto__', count: 1 }, { crop: 'daisy', count: 0 }, { crop: 'daisy', count: -1 }, { crop: 'daisy', count: 1.5 }]) G.bus.emit('garden:harvested', event);
  assert.equal(JSON.stringify(G.state), before);
});
test('换档后读取新存档历史，不把上一份花果发现或奖励带进来', () => {
  const { G, parse } = sandbox(); G.store.update(state => { state.collectionBook.crops.push('rose'); }); const old = parse(G.state), fresh = parse(G.store.defaultState());
  G.store.replace(fresh); assert.equal(G.sys.collectionBook.get('crops', 'rose').collected, false); G.store.replace(old); assert.equal(G.sys.collectionBook.get('crops', 'rose').collected, true); assert.equal(G.state.collectionBook.crops.length, 1);
});
test('图鉴字段拒绝非法类型/重复/未知ID/多余键以及未集齐便伪造的套装领奖', () => {
  const { G, parse } = sandbox();
  for (const change of [state => { state.collectionBook = []; }, state => { state.collectionBook.crops = ['rose', 'rose']; }, state => { state.collectionBook.crops = ['unknown']; }, state => { state.collectionBook.themeClaims = ['unknown']; }, state => { state.collectionBook.themeClaims = ['basic', 'basic']; }, state => { state.collectionBook.themeClaims = ['basic']; }, state => { state.collectionBook.extra = true; }]) { const raw = parse(G.state); change(raw); assert.throws(() => G.store.validate(raw)); }
  complete(G, 'basic'); assert.ok(G.sys.collectionBook.claimTheme('basic').ok); assert.deepEqual(plain(G.store.validate(parse(G.state)).collectionBook), plain(G.state.collectionBook));
});
console.log('\n' + passed + ' 组保留内容边界检查通过。');
