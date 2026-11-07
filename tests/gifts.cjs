'use strict';
// 礼盒只测试正式规则与存档事务；不启动服务、浏览器或动画循环。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/gifts.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/garden.js', 'js/systems/avatar.js', 'js/systems/collection-book.js', 'js/systems/gifts.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 28, 12).getTime(), randomCalls = 0, storageError = false; const RealDate = Date, storage = new Map();
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const math = Object.create(Math); math.random = () => { randomCalls++; return .37; };
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, Math: math, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (storageError) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, storage, writeFails(value) { storageError = value; }, randomCalls: () => randomCalls, advance(milliseconds = 1251) { clock += milliseconds; }, at(date) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], 12).getTime(); } };
}
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function complete(G) { G.store.update(state => G.data.giftPool(state.level).forEach(def => { state.collection[def.id] = true; })); }
test('目录只包含当前等级正常家具，高等级时362件含庭院，排除节日与专属', () => {
  const { G } = sandbox(), before = JSON.stringify(G.state), first = G.sys.gifts.status();
  assert.ok(first.total > 3); assert.ok(first.freeAvailable); assert.equal(first.cost, 0); assert.equal(first.remaining, first.total - 3); assert.equal(first.canOpen, true);
  assert.equal(G.data.giftPool(30).length, 362); assert.ok(G.data.giftPool(30).some(def => def.place === 'yard')); G.data.giftPool(1).forEach(def => { assert.ok(!def.rewardOnly && !def.festivalId && !def.customArt && def.unlockLv <= 1); });
  G.sys.gifts.status(); G.sys.gifts.latest(); G.sys.gifts.init(); assert.equal(JSON.stringify(G.state), before);
});
test('每日第一盒免费，奖励/库存/收藏/回忆/凭据同一次保存并发一次事件', () => {
  const { G } = sandbox(), before = plain(G.state), changes = [], events = [];
  G.bus.on('state:change', state => changes.push(plain(state))); G.bus.on('gift:opened', result => events.push(result));
  const result = G.sys.gifts.open(); assert.ok(result.ok, result.message); assert.equal(result.cost, 0); assert.equal(result.free, true); assert.equal(result.reward.paid, false); assert.equal(result.reward.kind, 'furniture');
  assert.equal(G.state.wallet.coin, before.wallet.coin); assert.equal(G.state.inventory[result.reward.itemId], (before.inventory[result.reward.itemId] || 0) + 1); assert.equal(G.state.collection[result.reward.itemId], true);
  assert.equal(G.state.giftBox.freeUsed, true); assert.equal(G.state.daily.freeBoxUsed, true); assert.equal(G.state.giftBox.opened, 1); assert.equal(G.state.giftBox.lastReward.id, result.reward.id); assert.equal(changes.length, 1); assert.equal(events.length, 1); assert.equal(Object.keys(result.reward).length, 6);
  assert.equal(G.state.quests.stats.bought, before.quests.stats.bought); assert.equal(G.state.quests.stats.itemsPlaced, before.quests.stats.itemsPlaced); assert.ok(G.state.memories.at(-1).text.includes('免费礼盒'));
});
test('当天第二盒明确扣200且继续送未收集家具，返回副本不可改写凭据', () => {
  const { G, advance } = sandbox(); assert.ok(G.sys.gifts.open().ok); const first = G.sys.gifts.latest(), coin = G.state.wallet.coin; advance();
  const second = G.sys.gifts.open(); assert.ok(second.ok); assert.equal(second.cost, 200); assert.equal(second.free, false); assert.equal(second.reward.paid, true); assert.notEqual(second.reward.itemId, first.itemId); assert.equal(G.state.wallet.coin, coin - 200); assert.equal(G.state.giftBox.opened, 2);
  const receipt = G.sys.gifts.latest(); receipt.kind = 'coin'; second.reward.itemId = 'fake'; assert.equal(G.state.giftBox.lastReward.kind, 'furniture'); assert.notEqual(G.state.giftBox.lastReward.itemId, 'fake');
});
test('余额不足不消耗开盒机会、上次结果或收藏，也不挑选新礼物', () => {
  const { G, randomCalls, advance } = sandbox(); assert.ok(G.sys.gifts.open().ok); advance(); G.store.update(state => { state.wallet.coin = 199; }); const before = JSON.stringify(G.state), calls = randomCalls();
  const status = G.sys.gifts.status(); assert.equal(status.canOpen, false); assert.ok(status.reason.includes('1')); assert.equal(G.sys.gifts.open().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(randomCalls(), calls);
});
test('全收集回退300糖果；付费时先需200，实际净增加100', () => {
  const { G, advance } = sandbox(); complete(G); const coin = G.state.wallet.coin;
  const free = G.sys.gifts.open(); assert.ok(free.ok); assert.equal(free.reward.kind, 'coin'); assert.equal(free.reward.itemId, null); assert.equal(free.reward.coin, 300); assert.equal(G.state.wallet.coin, coin + 300);
  advance(); const paid = G.sys.gifts.open(); assert.ok(paid.ok); assert.equal(paid.cost, 200); assert.equal(paid.reward.paid, true); assert.equal(G.state.wallet.coin, coin + 400);
  G.store.update(state => { state.wallet.coin = 199; }); const before = JSON.stringify(G.state); assert.equal(G.sys.gifts.open().ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('钱包上限与存档容量不足原子失败，免费资格、糖果和上次结果不变', () => {
  const { G } = sandbox(); complete(G); G.store.update(state => { state.wallet.coin = 999999900; }); const capped = JSON.stringify(G.state);
  assert.equal(G.sys.gifts.open().ok, false); assert.equal(JSON.stringify(G.state), capped); assert.equal(G.state.giftBox.freeUsed, false);
  G.store.update(state => { state.wallet.coin = 1000; }); const before = JSON.stringify(G.state), max = G.data.balance.maxSaveBytes; G.data.balance.maxSaveBytes = 1;
  try { assert.equal(G.sys.gifts.open().ok, false); assert.equal(JSON.stringify(G.state), before); } finally { G.data.balance.maxSaveBytes = max; }
  assert.ok(G.sys.gifts.open().ok); assert.equal(G.state.wallet.coin, 1300);
});
test('仅余一件时一定送该件，新解锁等级不会继续把旧等级全收当回退', () => {
  const { G, advance } = sandbox(), missing = G.data.giftPool(1).find(def => !G.state.collection[def.id]).id;
  G.store.update(state => { G.data.giftPool(state.level).forEach(def => { if (def.id !== missing) state.collection[def.id] = true; }); });
  const result = G.sys.gifts.open(); assert.ok(result.ok); assert.equal(result.reward.itemId, missing); assert.equal(G.sys.gifts.status().remaining, 0);
  advance(); G.store.update(state => { state.level = 2; }); assert.ok(G.sys.gifts.status().remaining > 0); assert.ok(G.sys.gifts.open().ok); assert.equal(G.sys.gifts.latest().kind, 'furniture');
});
test('新日期第一次恢复免费，反复看状态或init不提前写入，跨多日不补发', () => {
  const { G, at } = sandbox(); assert.ok(G.sys.gifts.open().ok); const before = JSON.stringify(G.state); at('2026-10-31'); assert.equal(G.sys.gifts.status().freeAvailable, true); G.sys.gifts.init(); assert.equal(JSON.stringify(G.state), before);
  const result = G.sys.gifts.open(); assert.ok(result.ok); assert.equal(result.cost, 0); assert.equal(G.state.giftBox.date, '2026-10-31'); assert.equal(G.state.giftBox.opened, 2); assert.equal(G.sys.gifts.status().freeAvailable, false);
});
test('回拨设备日期不能再领免费，付费仍可用且不倒退免费记录日期', () => {
  const { G, at } = sandbox(); assert.ok(G.sys.gifts.open().ok); G.store.update(state => { state.wallet.coin = 1000; }); at('2026-10-27');
  const status = G.sys.gifts.status(); assert.equal(status.clockBehind, true); assert.equal(status.freeAvailable, false); assert.equal(status.cost, 200);
  const paid = G.sys.gifts.open(); assert.ok(paid.ok); assert.equal(paid.cost, 200); assert.equal(G.state.giftBox.date, '2026-10-28'); assert.equal(G.state.giftBox.freeUsed, true); at('2026-10-28'); assert.equal(G.sys.gifts.status().freeAvailable, false); at('2026-10-29'); assert.equal(G.sys.gifts.status().freeAvailable, true);
});
test('旧daily免费使用记录迁移，通用每日刷新不能抹去未来免费记录', () => {
  const { G, parse, at } = sandbox(), old = parse(G.state); delete old.giftBox; old.daily.freeBoxUsed = true; old.daily.lastLoginDate = '2026-10-28'; G.store.replace(old); assert.equal(G.sys.gifts.status().freeAvailable, false); assert.equal(G.state.giftBox.opened, 0);
  const emptyDate = parse(old); emptyDate.daily.lastLoginDate = ''; G.store.replace(emptyDate); assert.equal(G.state.giftBox.date, G.utils.dateKey()); assert.equal(G.sys.gifts.status().freeAvailable, false); G.store.replace(old);
  at('2026-10-27'); G.sys.init(); assert.equal(G.sys.gifts.status().clockBehind, true); assert.equal(G.sys.gifts.status().freeAvailable, false); assert.equal(G.state.giftBox.date, '2026-10-28');
});
test('JSON导入与刷新恢复上次凭据，重新查看与init不扣款不重发', async () => {
  const { G, parse, storage } = sandbox(); assert.ok(G.sys.gifts.open().ok); const saved = parse(G.state), before = JSON.stringify(G.state); assert.ok(G.save.flush()); assert.ok(storage.get(G.data.balance.saveKey));
  const loaded = sandbox(saved); assert.equal(loaded.G.sys.gifts.status().freeAvailable, false); assert.deepEqual(plain(loaded.G.sys.gifts.latest()), plain(saved.giftBox.lastReward));
  for (let i = 0; i < 4; i++) { loaded.G.sys.gifts.latest(); loaded.G.sys.gifts.status(); loaded.G.sys.gifts.init(); } assert.equal(loaded.G.state.wallet.coin, saved.wallet.coin); assert.equal(loaded.G.state.giftBox.opened, 1); assert.equal(JSON.stringify(G.state), before);
  const result = await G.save.importFile({ text: async () => JSON.stringify(saved) }); assert.ok(result.ok, result.message); assert.equal(G.state.giftBox.opened, 1); assert.equal(G.sys.gifts.status().freeAvailable, false);
});
test('同步state事件内的重入不会再开一盒，写入失败后能正常重试', () => {
  const { G, advance } = sandbox(); let nested, armed = true; const off = G.bus.on('state:change', () => { if (armed) { armed = false; nested = G.sys.gifts.open(); } });
  assert.ok(G.sys.gifts.open().ok); assert.equal(nested.ok, false); assert.equal(G.state.giftBox.opened, 1); off();
  advance(); G.store.update(state => { state.wallet.coin = 1000; }); const original = G.store.update, before = JSON.stringify(G.state); G.store.update = () => { throw new Error('storage failed'); };
  assert.equal(G.sys.gifts.open().ok, false); assert.equal(JSON.stringify(G.state), before); G.store.update = original; assert.ok(G.sys.gifts.open().ok); assert.equal(G.state.giftBox.opened, 2);
});
test('礼盒严格日期/数量/凭据与普通礼物来源校验，错误导入保留原档', () => {
  const { G, parse } = sandbox(); assert.ok(G.sys.gifts.open().ok);
  for (const change of [b => b.date = '2026-02-30', b => b.freeUsed = 1, b => b.opened = -1, b => b.extra = true, b => b.lastReward.extra = true, b => b.lastReward.kind = 'unknown', b => b.lastReward.itemId = 'fake', b => b.lastReward.coin = 1, b => b.lastReward.paid = 'yes', b => b.lastReward.itemId = 'achievement_collector']) {
    const raw = parse(G.state); change(raw.giftBox); assert.throws(() => G.store.validate(raw));
  }
});
test('成功开盒短冷却挡住连点和奖励事件重入，失败不会占用冷却', () => {
  const { G, advance } = sandbox(); let nested; const off = G.bus.on('gift:opened', () => { nested = G.sys.gifts.open(); });
  assert.ok(G.sys.gifts.open().ok); off(); assert.equal(nested.ok, false); const before = JSON.stringify(G.state); assert.equal(G.sys.gifts.open().ok, false); assert.equal(JSON.stringify(G.state), before);
  advance(1250); assert.ok(G.sys.gifts.open().ok); assert.equal(G.state.giftBox.opened, 2);
});
test('本机实际拒写时不扣币不占免费与冷却，内存和已存原文一起保留', () => {
  const { G, storage, writeFails } = sandbox(); assert.ok(G.save.flush()); const before = JSON.stringify(G.state), disk = storage.get(G.data.balance.saveKey); writeFails(true);
  const result = G.sys.gifts.open(); assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(storage.get(G.data.balance.saveKey), disk); assert.equal(G.state.giftBox.freeUsed, false);
  writeFails(false); const retry = G.sys.gifts.open(); assert.ok(retry.ok, retry.message); assert.equal(G.state.giftBox.opened, 1); assert.equal(JSON.parse(storage.get(G.data.balance.saveKey)).giftBox.lastReward.id, retry.reward.id);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组礼盒规则与存档事务检查通过（未执行浏览器动画验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
