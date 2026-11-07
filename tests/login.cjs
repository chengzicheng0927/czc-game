'use strict';
// 日历跳跃与真实保存拒写在同一规则环境验证；不运行服务或浏览器。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/login.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/login.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 28, 12).getTime(), storageError = false; const RealDate = Date, storage = new Map();
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (storageError) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, storage, writeFails(value) { storageError = value; }, advance(days = 1) { clock += days * 86400000; }, at(date) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], 12).getTime(); } };
}
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function through(env, day) { for (let next = 1; next <= day; next++) { if (next > 1) env.advance(); const result = env.G.sys.login.claim(); assert.ok(result.ok, result.message); } }
test('新档第一份50币，查看状态与重读不领取或写入', () => {
  const { G } = sandbox(), before = JSON.stringify(G.state), first = G.sys.login.status();
  assert.equal(first.day, 1); assert.equal(first.canClaim, true); assert.equal(first.claimed, 0); assert.equal(first.cycle, 1); assert.equal(first.completed, 0); assert.equal(first.reward.coin, 50); assert.equal(G.sys.login.latest(), null);
  for (let i = 0; i < 3; i++) { G.sys.login.status(); G.sys.login.latest(); G.sys.login.init(); }
  assert.equal(JSON.stringify(G.state), before);
});
test('奖励与日期、计数、回忆、凭据同一次保存，同日不能重复', () => {
  const { G, storage } = sandbox(), previous = G.state.wallet.coin, events = []; let changes = 0;
  G.bus.on('state:change', () => changes++); G.bus.on('login:claimed', value => events.push(value));
  const result = G.sys.login.claim(); assert.ok(result.ok, result.message); assert.equal(result.reward.day, 1); assert.equal(Object.keys(result.reward).length, 6);
  assert.equal(G.state.wallet.coin, previous + 50); assert.equal(G.state.loginRewards.claimed, 1); assert.equal(G.state.loginRewards.lastClaimDate, '2026-10-28'); assert.equal(G.state.daily.giftClaimed, true); assert.equal(G.state.daily.loginDay, 1); assert.equal(changes, 1); assert.equal(events.length, 1); assert.equal(G.state.quests.stats.bought, 0); assert.ok(G.state.memories.at(-1).text.includes('第1份'));
  const saved = JSON.parse(storage.get(G.data.balance.saveKey)); assert.deepEqual(saved.loginRewards.lastReward, plain(result.reward));
  const before = JSON.stringify(G.state); assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(G.sys.login.status().canClaim, false);
  result.reward.coin = 999; const copy = G.sys.login.latest(); copy.coin = 777; assert.equal(G.state.loginRewards.lastReward.coin, 50);
});
test('漏登一月继续第二份，不重置、不跳天、不补发', () => {
  const { G, at } = sandbox(); assert.ok(G.sys.login.claim().ok); at('2026-11-28'); const before = JSON.stringify(G.state);
  assert.equal(G.sys.login.status().day, 2); assert.equal(G.sys.login.status().canClaim, true); G.sys.login.init(); assert.equal(JSON.stringify(G.state), before);
  const coin = G.state.wallet.coin, result = G.sys.login.claim(); assert.ok(result.ok); assert.equal(result.reward.coin, 100); assert.equal(G.state.wallet.coin, coin + 100); assert.equal(G.state.loginRewards.claimed, 2);
});
test('七份严格顺序：500币、七粒种子、一件精致与一件稀有家具', () => {
  const env = sandbox(), { G } = env, before = plain(G.state); const rewards = [];
  for (let day = 1; day <= 7; day++) { if (day > 1) env.advance(); assert.equal(G.sys.login.status().day, day); const result = G.sys.login.claim(); assert.ok(result.ok, result.message); rewards.push(result.reward); }
  assert.deepEqual(rewards.map(value => value.kind), ['coin', 'coin', 'seeds', 'coin', 'furniture', 'coin', 'furniture']);
  assert.equal(G.state.wallet.coin, before.wallet.coin + 500); assert.equal(G.state.garden.seeds.daisy, before.garden.seeds.daisy + 3); assert.equal(G.state.garden.seeds.tulip, 2); assert.equal(G.state.garden.seeds.strawberry, 2);
  for (const [index, rarity] of [[4, 'fine'], [6, 'rare']]) { const id = rewards[index].itemId; assert.equal(G.data.furnitureById[id].rarity, rarity); assert.equal(G.state.inventory[id], (before.inventory[id] || 0) + 1); assert.equal(G.state.collection[id], true); }
  assert.equal(G.state.loginRewards.claimed, 7); assert.equal(G.sys.login.status().completed, 7); assert.equal(G.sys.login.status().cycle, 1); assert.equal(G.sys.login.status().canClaim, false);
});
test('第七份当天不能再领，隔日才开启第二轮第一份', () => {
  const env = sandbox(), { G } = env; through(env, 7); assert.equal(G.sys.login.claim().ok, false); env.advance();
  const status = G.sys.login.status(); assert.equal(status.day, 1); assert.equal(status.cycle, 2); assert.equal(status.completed, 0); assert.equal(status.canClaim, true);
  const result = G.sys.login.claim(); assert.ok(result.ok); assert.equal(result.reward.day, 1); assert.equal(result.reward.coin, 50); assert.equal(G.state.loginRewards.claimed, 8);
});
test('回拨日期与恢复原日都不能重复，只有更晚日期才能继续', () => {
  const { G, at } = sandbox(); assert.ok(G.sys.login.claim().ok); at('2026-10-27'); const before = JSON.stringify(G.state);
  assert.equal(G.sys.login.status().clockBehind, true); assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), before); at('2026-10-28'); assert.equal(G.sys.login.claim().ok, false);
  at('2026-10-29'); assert.ok(G.sys.login.claim().ok); assert.equal(G.state.loginRewards.claimed, 2); at('2026-10-28'); G.sys.init(); assert.equal(G.sys.login.status().clockBehind, true); assert.equal(G.sys.login.claim().ok, false); assert.equal(G.state.loginRewards.lastClaimDate, '2026-10-29');
});
test('种子包数量超限失败，不丢其它种子或领取资格，整理后能再领取', () => {
  const env = sandbox(), { G } = env; through(env, 2); env.advance(); G.store.update(state => { state.garden.seeds.tulip = 9998; });
  const before = JSON.stringify(G.state); assert.equal(G.sys.login.status().canClaim, false); assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), before);
  G.store.update(state => { state.garden.seeds.tulip = 9997; }); assert.ok(G.sys.login.claim().ok); assert.equal(G.state.garden.seeds.tulip, 9999); assert.equal(G.state.loginRewards.claimed, 3);
});
test('家具预览按日期与次数固定；满格不换奖，整理后领取同一件', () => {
  const env = sandbox(), { G } = env; through(env, 4); env.advance(); const preview = G.sys.login.status().reward;
  assert.ok(preview.itemId); for (let i = 0; i < 5; i++) assert.equal(G.sys.login.status().reward.itemId, preview.itemId);
  G.store.update(state => { state.inventory[preview.itemId] = 9999; }); const before = JSON.stringify(G.state); assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(G.sys.login.status().reward.itemId, preview.itemId);
  G.store.update(state => { state.inventory[preview.itemId] = 9998; }); const result = G.sys.login.claim(); assert.ok(result.ok); assert.equal(result.reward.itemId, preview.itemId); assert.equal(G.state.inventory[preview.itemId], 9999);
});
test('钱包上限与存档容量失败保留资格和内存，可恢复重试', () => {
  const { G } = sandbox(); G.store.update(state => { state.wallet.coin = 999999951; }); const capped = JSON.stringify(G.state); assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), capped);
  G.store.update(state => { state.wallet.coin = 999999950; }); const before = JSON.stringify(G.state), limit = G.data.balance.maxSaveBytes; G.data.balance.maxSaveBytes = 1;
  assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), before); G.data.balance.maxSaveBytes = limit; assert.ok(G.sys.login.claim().ok); assert.equal(G.state.wallet.coin, 1000000000);
});
test('实际本机拒写时不发奖、不改日期与内存，已存原文不变，重试成功', () => {
  const { G, storage, writeFails } = sandbox(); assert.ok(G.save.flush()); const before = JSON.stringify(G.state), disk = storage.get(G.data.balance.saveKey); writeFails(true);
  assert.equal(G.sys.login.claim().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(storage.get(G.data.balance.saveKey), disk); assert.equal(G.state.loginRewards.claimed, 0);
  writeFails(false); assert.ok(G.sys.login.claim().ok); assert.equal(JSON.parse(storage.get(G.data.balance.saveKey)).loginRewards.claimed, 1);
});
test('state和奖励事件同步重入都不能重复发奖', () => {
  const { G } = sandbox(); const nested = []; const off = G.bus.on('state:change', () => nested.push(G.sys.login.claim())), offReward = G.bus.on('login:claimed', () => nested.push(G.sys.login.claim()));
  assert.ok(G.sys.login.claim().ok); off(); offReward(); assert.equal(nested.length, 2); assert.ok(nested.every(result => !result.ok)); assert.equal(G.state.loginRewards.claimed, 1);
});
test('旧档无已领旗标不继承虚假访问天数，旧已领标记保留当天资格', () => {
  const { G, parse } = sandbox(), legacy = parse(G.state); delete legacy.loginRewards; legacy.daily.loginDay = 7; legacy.daily.giftClaimed = false;
  G.store.replace(legacy); assert.equal(G.sys.login.status().day, 1); assert.equal(G.sys.login.status().canClaim, true);
  legacy.daily.giftClaimed = true; G.store.replace(legacy); assert.equal(G.state.loginRewards.claimed, 1); assert.equal(G.state.loginRewards.lastClaimDate, '2026-10-28'); assert.equal(G.state.loginRewards.lastReward, null); assert.equal(G.sys.login.claim().ok, false);
  legacy.daily.lastLoginDate = ''; G.store.replace(legacy); assert.equal(G.state.loginRewards.lastClaimDate, G.utils.dateKey()); assert.equal(G.sys.login.claim().ok, false);
});
test('家具礼物池不含节日/专属/内部画框，不修改购买或摆放统计', () => {
  const env = sandbox(), { G } = env;
  for (const rarity of ['fine', 'rare']) { const pool = G.data.loginFurniturePool(rarity); assert.ok(pool.length); for (const def of pool) { assert.equal(def.rarity, rarity); assert.equal(def.currency, 'coin'); assert.ok(!def.rewardOnly && !def.festivalId && !def.customArt); } }
  through(env, 7); assert.equal(G.state.quests.stats.bought, 0); assert.equal(G.state.quests.stats.itemsPlaced, 0); assert.equal(G.state.quests.stats.photos, 0); assert.equal(G.state.quests.stats.harvests, 0);
});
test('JSON导入与刷新恢复领取凭据，查询和init不重发', async () => {
  const env = sandbox(), { G, parse } = env; through(env, 3); const saved = parse(G.state); const loaded = sandbox(saved); loaded.at(saved.loginRewards.lastClaimDate);
  const before = JSON.stringify(loaded.G.state); assert.deepEqual(plain(loaded.G.sys.login.latest()), plain(saved.loginRewards.lastReward)); assert.equal(loaded.G.sys.login.claim().ok, false); loaded.G.sys.login.init(); assert.equal(JSON.stringify(loaded.G.state), before);
  const result = await G.save.importFile({ text: async () => JSON.stringify(saved) }); assert.ok(result.ok, result.message); assert.equal(G.state.loginRewards.claimed, 3); assert.equal(G.sys.login.claim().ok, false); assert.equal(G.state.garden.seeds.tulip, 2);
});
test('严格拒绝伪造日期、计数、凭据、种子与家具稀有度', () => {
  const { G, parse } = sandbox(); assert.ok(G.sys.login.claim().ok);
  const bad = [book => { book.claimed = 99; book.lastReward = null; }, book => book.claimed = -1, book => book.claimed = 1.5, book => book.lastClaimDate = '2026-02-30', book => book.extra = true, book => book.lastReward.extra = true, book => book.lastReward.coin = 500, book => book.lastReward.kind = 'unknown', book => book.lastReward.day = 7, book => book.lastReward.seeds = { daisy: 3 }, book => book.lastReward.itemId = 'bed_basic'];
  for (const change of bad) { const raw = parse(G.state); change(raw.loginRewards); assert.throws(() => G.store.validate(raw)); }
  const env = sandbox(); through(env, 5); for (const id of ['chair_basic', 'achievement_collector', 'not_real']) { const raw = env.parse(env.G.state); raw.loginRewards.lastReward.itemId = id; assert.throws(() => env.G.store.validate(raw)); }
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组七日登录与存档事务检查通过（未执行浏览器界面验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
