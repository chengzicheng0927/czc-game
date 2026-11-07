'use strict';
// 主线程串行执行本文件；无页面、服务或浏览器依赖。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/deals.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/deals.js', 'js/systems/systems.js'];
function sandbox() {
  let clock = new Date(2026, 9, 28, 12).getTime(), failed = false, randomCalls = 0; const RealDate = Date, storage = new Map();
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const math = Object.create(Math); math.random = () => { randomCalls++; return .37; };
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, Math: math, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, text) { if (failed) throw new Error('QuotaExceededError'); storage.set(key, text); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game; G.store.init(); G.sys.init();
  return { G, storage, randomCalls: () => randomCalls, writeFails(value) { failed = value; }, at(date) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], 12).getTime(); } };
}
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function wealthy(G) { G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.tutorial.done = true; }); }
test('每日恰好六件不重复商品，目录只有普通金币家具并含庭院候选', () => {
  const { G } = sandbox(), status = G.sys.deals.status(); assert.equal(status.date, '2026-10-28'); assert.equal(status.count, 6); assert.equal(status.discount, 20); assert.equal(new Set(status.items.map(item => item.id)).size, 6);
  const seen = new Set();
  for (let day = 1; day <= 31; day++) for (const item of G.sys.deals.list('2026-10-' + String(day).padStart(2, '0'))) { const def = item.definition; seen.add(def.id); assert.ok(!def.rewardOnly && !def.festivalId && !def.customArt); assert.equal(def.currency, 'coin'); assert.ok(def.price > 0); }
  assert.ok([...seen].some(id => G.data.furnitureById[id].place === 'yard'));
});
test('同日重复查询与全新运行结果相同，不读Math.random也不写进度', () => {
  const first = sandbox(), before = JSON.stringify(first.G.state), calls = first.randomCalls(), ids = plain(first.G.sys.deals.list()).map(item => item.id);
  for (let i = 0; i < 4; i++) { assert.deepEqual(plain(first.G.sys.deals.list()).map(item => item.id), ids); first.G.sys.deals.status(); first.G.sys.deals.priceFor(ids[0]); }
  assert.equal(JSON.stringify(first.G.state), before); assert.equal(first.randomCalls(), calls); assert.deepEqual(plain(sandbox().G.sys.deals.list()).map(item => item.id), ids);
});
test('日期换日改变特惠，日期回看可复现；商品原始数组顺序不影响选择', () => {
  const { G, at } = sandbox(), today = plain(G.sys.deals.list()).map(item => item.id); at('2026-10-29'); const tomorrow = plain(G.sys.deals.list()).map(item => item.id); assert.notDeepEqual(tomorrow, today);
  at('2026-10-28'); assert.deepEqual(plain(G.sys.deals.list()).map(item => item.id), today); G.data.furniture.reverse(); assert.deepEqual(plain(G.sys.deals.list()).map(item => item.id), today);
});
test('升等级、领取家具、消费与导入后的余额不会改变当天六件', () => {
  const { G } = sandbox(), ids = plain(G.sys.deals.list()).map(item => item.id); wealthy(G); G.store.update(state => { state.collection[ids[0]] = true; state.inventory[ids[0]] = 4; }); assert.deepEqual(plain(G.sys.deals.list()).map(item => item.id), ids);
  const restored = sandbox(); restored.G.store.replace(vm.runInNewContext('(' + JSON.stringify(G.state) + ')')); assert.deepEqual(plain(restored.G.sys.deals.list()).map(item => item.id), ids);
});
test('八折向上取整，非特惠与爱心/专属/节日不改价，无效ID不报价', () => {
  const { G } = sandbox(), items = G.sys.deals.list(); for (const item of items) { assert.equal(item.price, Math.ceil(item.originalPrice * .8)); assert.equal(G.sys.deals.priceFor(item.id), item.price); }
  const idSet = new Set(items.map(item => item.id)); for (const def of G.data.furniture.filter(def => !idSet.has(def.id))) assert.equal(G.sys.deals.priceFor(def.id), def.price);
  assert.equal(G.sys.deals.priceFor('missing'), null); assert.equal(G.sys.deals.priceFor('__proto__'), null); assert.equal(G.sys.deals.priceFor(null), null);
  const item = items[0], original = G.data.furnitureById[item.id].price; G.data.furnitureById[item.id].price = 81; assert.equal(G.sys.deals.priceFor(item.id), 65); G.data.furnitureById[item.id].price = original;
});
test('非法日期不会抽样或误给折扣，闰日与短年份严格校验', () => {
  const { G } = sandbox(), id = G.sys.deals.list()[0].id;
  for (const value of ['', '2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-10-00', '0000-01-01', '2026-1-1', null, 0]) { assert.equal(G.sys.deals.status(value).date, null); assert.equal(G.sys.deals.list(value).length, 0); assert.equal(G.sys.deals.priceFor(id, value), G.data.furnitureById[id].price); }
  assert.equal(G.sys.deals.list('2028-02-29').length, 6); assert.equal(G.sys.deals.list('0001-01-01').length, 6);
});
test('未解锁/不足/满格状态准确，修改返回值不污染目录或价格缓存', () => {
  const { G } = sandbox(); let items = G.sys.deals.list(); for (const item of items) assert.equal(item.locked, item.definition.unlockLv > 1);
  wealthy(G); G.store.update(state => { state.wallet.coin = 0; }); items = G.sys.deals.list(); for (const item of items) { assert.equal(item.short, item.price); assert.equal(item.canBuy, false); assert.ok(item.reason.includes('还差')); }
  wealthy(G); const id = items[0].id; G.store.update(state => { state.inventory[id] = 9999; }); const full = G.sys.deals.list().find(item => item.id === id); assert.equal(full.full, true); assert.equal(full.canBuy, false);
  full.definition.price = -1; full.id = 'fake'; full.price = -1; assert.ok(G.sys.deals.list()[0].price > 0); assert.ok(G.data.furnitureById[id].price > 0);
});
test('普通购买接口实际按特惠价扣款，库存/图鉴/购买统计与持久原文同步', () => {
  const { G, storage } = sandbox(); wealthy(G); const item = G.sys.deals.list()[0], coin = G.state.wallet.coin, stock = G.state.inventory[item.id] || 0, bought = G.state.quests.stats.bought; let count = 0; G.bus.on('item:bought', () => count++);
  const result = G.sys.economy.buy(item.id); assert.ok(result.ok, result.message); assert.equal(G.state.wallet.coin, coin - item.price); assert.equal(G.state.inventory[item.id], stock + 1); assert.equal(G.state.collection[item.id], true); assert.equal(G.state.quests.stats.bought, bought + 1); assert.equal(count, 1);
  const disk = JSON.parse(storage.get(G.data.balance.saveKey)); assert.equal(disk.wallet.coin, G.state.wallet.coin); assert.equal(disk.inventory[item.id], stock + 1);
});
test('余额刚好折后价可以买，低一颗失败且未解锁不能绕过', () => {
  const { G } = sandbox(); wealthy(G); const item = G.sys.deals.list()[0]; G.store.update(state => { state.wallet.coin = item.price - 1; }); let before = JSON.stringify(G.state); assert.equal(G.sys.economy.buy(item.id).ok, false); assert.equal(JSON.stringify(G.state), before);
  G.store.update(state => { state.wallet.coin = item.price; }); assert.ok(G.sys.economy.buy(item.id).ok); assert.equal(G.state.wallet.coin, 0);
  G.store.update(state => { state.level = 1; state.garden.plots = Array(6).fill(null); state.wallet.coin = 100000; }); const locked = G.sys.deals.list().find(entry => entry.locked); assert.ok(locked); before = JSON.stringify(G.state); assert.equal(G.sys.economy.buy(locked.id).ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('真实本机拒写不扣币不发事件，恢复写入后可以重试且不丢优惠', () => {
  const { G, storage, writeFails } = sandbox(); wealthy(G); assert.ok(G.save.flush()); const item = G.sys.deals.list()[0], before = JSON.stringify(G.state), disk = storage.get(G.data.balance.saveKey); let events = 0; G.bus.on('item:bought', () => events++); writeFails(true);
  const result = G.sys.economy.buy(item.id); assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(storage.get(G.data.balance.saveKey), disk); assert.equal(events, 0);
  writeFails(false); assert.ok(G.sys.economy.buy(item.id).ok); assert.equal(G.state.wallet.coin, JSON.parse(before).wallet.coin - item.price); assert.equal(events, 1);
});
test('库存满格不能扣款，跨日后的实际购买接口使用新日期价格', () => {
  const { G, at } = sandbox(); wealthy(G); const item = G.sys.deals.list()[0]; G.store.update(state => { state.inventory[item.id] = 9999; }); const before = JSON.stringify(G.state); assert.equal(G.sys.economy.buy(item.id).ok, false); assert.equal(JSON.stringify(G.state), before);
  G.store.update(state => { state.inventory[item.id] = 0; }); at('2026-10-29'); const price = G.sys.deals.priceFor(item.id), coin = G.state.wallet.coin; assert.ok(G.sys.economy.buy(item.id).ok); assert.equal(G.state.wallet.coin, coin - price);
});
test('午夜旧报价不能静默按原价扣款，重新读取售价后才购买', () => {
  const { G, at } = sandbox(); wealthy(G); const deal = G.sys.deals.list()[0], before = JSON.stringify(G.state);
  at('2026-10-29'); const actual = G.sys.deals.priceFor(deal.id);
  if (actual !== deal.price) { const result = G.sys.economy.buy(deal.id, deal.price); assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), before); }
  assert.ok(G.sys.economy.buy(deal.id, actual).ok);
});
test('原型属性与空报价无法伪装商品刷购买数或经验', () => {
  const { G } = sandbox(); wealthy(G); const before = JSON.stringify(G.state);
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', null, {}, []]) { assert.equal(G.sys.deals.priceFor(id), null); assert.equal(G.sys.economy.buy(id).ok, false); }
  assert.equal(JSON.stringify(G.state), before);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组今日特惠与购买事务检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
