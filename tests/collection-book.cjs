'use strict';
// 使用真实规则验证发现历史、旧档迁移和手动套装奖励；由主线程串行执行，不启动服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/avatar.js', 'js/systems/garden.js', 'js/systems/collection-book.js'];
function sandbox(saved) {
  const context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init(); G.sys.collectionBook.init();
  return { G, parse };
}
const plain = value => JSON.parse(JSON.stringify(value));
function complete(G, id) { G.store.update(state => G.sys.collectionBook.regularIds(id).forEach(itemId => { state.collection[itemId] = true; })); }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('4册分别收录402家具/12居民/12作物/60服装，9主题各38常规家具', () => {
  const { G } = sandbox(), sys = G.sys.collectionBook;
  assert.deepEqual(plain(sys.summary().map(item => [item.id, item.total])), [['furniture', 402], ['residents', 12], ['crops', 12], ['outfits', 60]]);
  assert.equal(sys.themes().length, 9); sys.themes().forEach(theme => { assert.equal(theme.total, 38); assert.equal(sys.regularIds(theme.id).length, 38); sys.regularIds(theme.id).forEach(id => { const item = G.data.furnitureById[id]; assert.ok(!item.rewardOnly && !item.festivalId && item.place !== 'yard'); }); });
  assert.equal(sys.summary().find(item => item.id === 'furniture').done, 3); assert.equal(sys.summary().find(item => item.id === 'outfits').done, 5);
});
test('读取、搜索和翻页不修改存档，每页最多24张；未获得的真名不会通过搜索泄漏', () => {
  const { G } = sandbox(), sys = G.sys.collectionBook, before = JSON.stringify(G.state);
  for (let page = 1; page <= 20; page++) { const result = sys.list({ kind: 'furniture', page }); assert.ok(result.items.length <= 24); assert.ok(result.page <= result.pages); assert.equal(result.pageSize, 24); }
  assert.equal(sys.list({ kind: 'furniture', status: 'collected' }).total, 3); assert.equal(sys.list({ kind: 'furniture', status: 'missing' }).total, 399);
  assert.equal(sys.list({ kind: 'furniture', theme: 'forest', category: 'bedroom' }).items.every(item => item.theme === 'forest' && item.category === 'bedroom'), true);
  const unknown = sys.get('furniture', 'sofa_princess'); assert.equal(unknown.name, '？？？'); assert.equal(unknown.collected, false); assert.equal(sys.list({ kind: 'furniture', query: unknown.definition.name }).total, 0);
  assert.equal(sys.get('bad', 'nope'), null); assert.equal(sys.get('furniture', '__proto__'), null); sys.summary(); sys.themes(); assert.equal(JSON.stringify(G.state), before);
});
test('旧档只由篮子里的正数收获迁移花果；种子、生长与累计收获数不推测新品种', () => {
  const { G, parse } = sandbox(), old = parse(G.store.defaultState()); delete old.collectionBook; old.garden.harvest.rose = 2; old.garden.harvest.daisy = 0; old.garden.seeds.star_fruit = 4; old.quests.stats.harvests = 999; old.inventory.sofa_forest = 1;
  old.garden.plots[0] = parse({ crop: 'tulip', plantedAt: Date.now(), durationMs: G.data.cropById.tulip.growMs, watered: [null, null, null] });
  G.store.replace(old); G.sys.collectionBook.init();
  assert.deepEqual(plain(G.state.collectionBook.crops), ['rose']); assert.equal(G.sys.collectionBook.get('crops', 'tulip').collected, false); assert.equal(G.sys.collectionBook.get('crops', 'star_fruit').collected, false); assert.equal(G.state.collection.sofa_forest, true);
  const before = JSON.stringify(G.state); G.sys.collectionBook.init(); G.sys.collectionBook.init(); assert.equal(JSON.stringify(G.state), before);
});
test('真实播种与收获事件点亮一次，卖出全部与存档往返仍保留发现', () => {
  const { G, parse } = sandbox(), sys = G.sys.collectionBook; G.store.update(state => { state.level = 6; state.wallet.coin = 2000; });
  assert.ok(G.sys.garden.buySeeds('daisy', 1).ok); assert.ok(G.sys.garden.plant(0, 'daisy').ok); assert.equal(sys.get('crops', 'daisy').collected, false);
  const matureAt = G.sys.garden.status(0).matureAt; assert.ok(G.sys.garden.harvest(0, matureAt).ok); assert.deepEqual(plain(G.state.collectionBook.crops), ['daisy']);
  G.bus.emit('garden:harvested', { crop: 'daisy', count: 1 }); assert.equal(G.state.collectionBook.crops.length, 1);
  assert.ok(G.sys.garden.sell('daisy', 1).ok); assert.equal(sys.get('crops', 'daisy').count, 0); assert.equal(sys.get('crops', 'daisy').collected, true);
  const saved = parse(G.state); G.store.replace(saved); assert.equal(sys.get('crops', 'daisy').collected, true); assert.equal(G.state.collectionBook.crops.length, 1);
});
test('空篮子的伪造收获事件、无效品种和无效数量均不能点亮图鉴', () => {
  const { G } = sandbox(), before = JSON.stringify(G.state);
  for (const event of [null, {}, { crop: 'rose', count: 1 }, { crop: 'fake', count: 1 }, { crop: '__proto__', count: 1 }, { crop: 'daisy', count: 0 }, { crop: 'daisy', count: -1 }, { crop: 'daisy', count: 1.5 }]) G.bus.emit('garden:harvested', event);
  assert.equal(JSON.stringify(G.state), before);
});
test('家具按曾拥有、居民按曾入住、衣服按所有权记录；当前数量与历史分开', () => {
  const { G } = sandbox(), sys = G.sys.collectionBook, roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
  assert.ok(G.sys.decorating.place('bed_basic', roomId, 10, 80).ok); assert.ok(G.sys.residents.invite('lily', roomId).ok); assert.equal(sys.get('furniture', 'bed_basic').count, 1); assert.equal(sys.get('residents', 'lily').collected, true);
  assert.ok(G.sys.building.demolishRoom(roomId).ok); assert.equal(sys.get('residents', 'lily').collected, true); assert.equal(sys.get('residents', 'lily').count, 0);
  G.store.update(state => { state.inventory.bed_basic = 0; }); assert.equal(sys.get('furniture', 'bed_basic').count, 0); assert.equal(sys.get('furniture', 'bed_basic').collected, true);
  assert.ok(G.sys.avatar.buy('top_berry').ok); assert.equal(sys.get('outfits', 'top_berry').collected, true); assert.equal(sys.get('outfits', 'top_berry').count, 1);
});
test('换档后读取新存档历史，不把上一份花果发现或奖励带进来', () => {
  const { G, parse } = sandbox(); G.store.update(state => { state.collectionBook.crops.push('rose'); }); const old = parse(G.state), fresh = parse(G.store.defaultState());
  G.store.replace(fresh); assert.equal(G.sys.collectionBook.get('crops', 'rose').collected, false); G.store.replace(old); assert.equal(G.sys.collectionBook.get('crops', 'rose').collected, true); assert.equal(G.state.collectionBook.crops.length, 1);
});
test('集齐只显示待领，手动领取一次500糖果与套装徽章，刷新/换档不再发币', () => {
  const { G, parse } = sandbox(), sys = G.sys.collectionBook, coin = G.state.wallet.coin;
  assert.equal(sys.claimTheme('basic').ok, false); assert.equal(sys.claimTheme('__proto__').ok, false);
  complete(G, 'basic'); assert.equal(sys.themes().find(theme => theme.id === 'basic').complete, true); sys.init(); sys.init(); assert.equal(G.state.wallet.coin, coin); assert.equal(G.state.collectionBook.themeClaims.length, 0);
  assert.equal(sys.claimTheme('basic').ok, true); assert.equal(G.state.wallet.coin, coin + 500); assert.deepEqual(plain(G.state.collectionBook.themeClaims), ['basic']);
  const before = JSON.stringify(G.state); assert.equal(sys.claimTheme('basic').ok, false); assert.equal(JSON.stringify(G.state), before);
  G.store.replace(parse(G.state)); sys.init(); assert.equal(G.state.wallet.coin, coin + 500); assert.equal(sys.themes().find(theme => theme.id === 'basic').claimed, true);
});
test('庭院、节日和特别礼物不会替代缺少的常规家具，9套可独立领取', () => {
  const { G } = sandbox(), sys = G.sys.collectionBook, regular = sys.regularIds('basic'), missing = regular[regular.length - 1];
  G.store.update(state => { G.data.furniture.filter(item => item.theme === 'basic' && item.id !== missing).forEach(item => { state.collection[item.id] = true; }); });
  const theme = sys.themes().find(item => item.id === 'basic'); assert.equal(theme.done, 37); assert.equal(theme.complete, false); assert.equal(sys.claimTheme('basic').ok, false);
  complete(G, 'basic'); complete(G, 'forest'); const coin = G.state.wallet.coin; assert.ok(sys.claimTheme('basic').ok); assert.ok(sys.claimTheme('forest').ok); assert.equal(G.state.wallet.coin, coin + 1000); assert.equal(G.state.collectionBook.themeClaims.length, 2);
});
test('钱包上限与存档容量不足时不扣领奖资格、不发糖果、不写回忆', () => {
  const { G } = sandbox(), sys = G.sys.collectionBook; complete(G, 'cloud'); G.store.update(state => { state.wallet.coin = 1000000000 - 499; });
  const capped = JSON.stringify(G.state); assert.equal(sys.claimTheme('cloud').ok, false); assert.equal(JSON.stringify(G.state), capped);
  G.store.update(state => { state.wallet.coin = 1000; }); const before = JSON.stringify(G.state), max = G.data.balance.maxSaveBytes;
  G.data.balance.maxSaveBytes = before.length + 10; try { assert.equal(sys.claimTheme('cloud').ok, false); assert.equal(JSON.stringify(G.state), before); } finally { G.data.balance.maxSaveBytes = max; }
  assert.ok(sys.claimTheme('cloud').ok);
});
test('每类获取线索有真实玩法动作，特别家具路由到朋友/成就/节日', () => {
  const { G } = sandbox(), sys = G.sys.collectionBook;
  assert.equal(sys.get('furniture', 'bed_basic').action.panel, 'shop'); assert.equal(sys.get('furniture', 'resident_lily_gift').action.residentId, 'lily'); assert.equal(sys.get('furniture', 'achievement_collector').action.category, 'collector'); assert.equal(sys.get('furniture', G.data.festivalFurniture[0].id).action.shopTab, 'festival');
  for (const kind of ['furniture', 'residents', 'crops', 'outfits']) for (const item of sys.list({ kind }).items) { assert.ok(item.hint.length > 0); assert.ok(Number.isInteger(item.level) && item.level > 0); assert.ok(item.action.panel); assert.ok(item.actionLabel); }
  assert.equal(sys.get('crops', 'star_fruit').hint.includes('夜晚'), true); assert.equal(sys.get('outfits', 'top_berry').action.outfitId, 'top_berry');
  assert.equal(sys.get('furniture', 'achievement_rainbow').action.milestoneId, 'rainbow'); assert.equal(sys.get('furniture', 'achievement_home_master').action.category, 'builder');
});
test('图鉴字段拒绝非法类型/重复/未知ID/多余键以及未集齐便伪造的套装领奖', () => {
  const { G, parse } = sandbox();
  for (const change of [state => { state.collectionBook = []; }, state => { state.collectionBook.crops = ['rose', 'rose']; }, state => { state.collectionBook.crops = ['unknown']; }, state => { state.collectionBook.themeClaims = ['unknown']; }, state => { state.collectionBook.themeClaims = ['basic', 'basic']; }, state => { state.collectionBook.themeClaims = ['basic']; }, state => { state.collectionBook.extra = true; }]) { const raw = parse(G.state); change(raw); assert.throws(() => G.store.validate(raw)); }
  complete(G, 'basic'); assert.ok(G.sys.collectionBook.claimTheme('basic').ok); assert.deepEqual(plain(G.store.validate(parse(G.state)).collectionBook), plain(G.state.collectionBook));
});
console.log('\n' + passed + ' 组收藏册规则检查通过（未执行浏览器视觉验收）。');
