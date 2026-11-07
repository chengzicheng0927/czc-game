'use strict';
// 真实加工规则、完整存档与可拒写的本机存储；不创建页面、服务或计时进程。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/data/deals.js', 'js/data/login.js', 'js/data/crafting.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/garden.js', 'js/systems/crafting.js'];
const plain = value => JSON.parse(JSON.stringify(value));
function setup(saved) {
  const storage = new Map(); let rejectWrites = false, clock = new Date(2026, 9, 28, 12).getTime(); const RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (rejectWrites) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, storage, writeFails(value) { rejectWrites = value; }, advance(ms = 1000) { clock += ms; } };
}
function ready(options = {}) {
  const env = setup(), { G } = env, level = options.level || 21;
  // 等级/材料是显式规则夹具，不声称自然完成了播种和21级成长。
  G.store.update(state => { state.level = level; state.wallet.coin = 50000; for (const crop of G.data.crops) state.garden.harvest[crop.id] = 777; });
  if (options.workshop !== false) { const built = G.sys.building.buildRoom(0, 0, 'workshop'); assert.ok(built.ok, built.message); env.workshop = built.roomId; }
  return env;
}
function make(G, id, count = 1) { const preview = G.sys.crafting.status(id, count); return G.sys.crafting.craft(id, count, preview.quote); }
function unchanged(G, fn) { const before = JSON.stringify(G.state); const result = fn(); assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), before); return result; }
const tests = []; function test(name, fn) { tests.push({ name, fn }); }

test('五份加工状态是纯查询，默认无历史且未知配方返回可读原因', () => {
  const { G } = setup(), before = JSON.stringify(G.state), list = G.sys.crafting.list();
  assert.equal(list.length, 5); assert.deepEqual(Array.from(list, entry => entry.recipeId), ['tulip_vase', 'pumpkin_lantern', 'sakura_tree', 'strawberry_deluxe', 'blueberry_deluxe']);
  assert.ok(list.every(entry => !entry.canCraft && typeof entry.reason === 'string' && typeof entry.quote === 'string')); assert.equal(G.sys.crafting.latest(), null);
  assert.equal(G.sys.crafting.status('missing').ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('装饰Lv6、樱花前院Lv11、高级蛋糕Lv21分开开放', () => {
  const { G } = ready({ level: 6, workshop: false }); assert.ok(G.sys.crafting.status('tulip_vase').canCraft); assert.ok(G.sys.crafting.status('pumpkin_lantern').canCraft);
  assert.equal(G.sys.crafting.status('sakura_tree').canCraft, false); assert.match(G.sys.crafting.status('sakura_tree').reason, /11/); assert.equal(G.sys.crafting.status('strawberry_deluxe').unlocked, false);
  G.store.update(state => { state.level = 11; }); assert.ok(G.sys.crafting.status('sakura_tree').canCraft); assert.equal(G.sys.crafting.status('blueberry_deluxe').unlocked, false);
});
test('高级蛋糕除等级外还需真实甜品工坊，改用途后制作被阻止但历史保留', () => {
  const { G } = ready({ workshop: false }); const blocked = G.sys.crafting.status('strawberry_deluxe'); assert.ok(blocked.unlocked && !blocked.hasRoom && !blocked.canCraft); assert.match(blocked.reason, /甜品工坊/);
  unchanged(G, () => G.sys.crafting.craft('strawberry_deluxe', 1, blocked.quote)); const room = G.sys.building.buildRoom(0, 0, 'workshop'); assert.ok(room.ok); assert.ok(make(G, 'strawberry_deluxe').ok);
  assert.ok(G.sys.building.changeRoomType(room.roomId, 'living').ok); assert.equal(G.sys.crafting.status('strawberry_deluxe').canCraft, false); assert.equal(G.state.crafting.counts.strawberry_deluxe, 1); assert.doesNotThrow(() => G.store.validate(G.state));
});
test('五配方真实消耗收获、成品入包并点亮收藏，一次事件且不扣币发经验或刷订单', () => {
  const { G } = ready(), before = plain(G.state), events = []; G.bus.on('crafting:made', event => events.push(event));
  for (const recipe of G.data.craftingRecipes) {
    const result = make(G, recipe.id); assert.ok(result.ok, result.message); assert.equal(G.state.garden.harvest[recipe.cropId], before.garden.harvest[recipe.cropId] - recipe.cropCount);
    assert.equal(G.state.inventory[recipe.itemId], 1); assert.equal(G.state.collection[recipe.itemId], true); assert.equal(G.state.crafting.counts[recipe.id], 1); assert.equal(result.itemId, recipe.itemId);
  }
  assert.equal(events.length, 5); assert.equal(G.state.crafting.last.total, 5); assert.equal(G.state.memories.length, before.memories.length + 5);
  assert.deepEqual(plain(G.state.wallet), before.wallet); assert.equal(G.state.level, before.level); assert.equal(G.state.exp, before.exp); assert.deepEqual(plain(G.state.quests), before.quests); assert.deepEqual(plain(G.state.minigames), before.minigames);
});
test('批量成品与材料按数量一致计算，上限99份，一批只增加一条制作回忆', () => {
  const { G } = ready(), first = G.sys.crafting.status('tulip_vase', 3), before = G.state.memories.length;
  assert.equal(first.materials[0].need, 9); assert.equal(first.outputCount, 3); assert.equal(first.stock, 0); assert.equal(first.maxCraftable, 99);
  assert.ok(G.sys.crafting.craft('tulip_vase', 3, first.quote).ok); assert.equal(G.state.garden.harvest.tulip, 768); assert.equal(G.state.inventory.craft_tulip_vase, 3); assert.equal(G.state.crafting.counts.tulip_vase, 3); assert.equal(G.state.memories.length, before + 1);
  assert.ok(make(G, 'sakura_tree', 99).ok); assert.equal(G.state.garden.harvest.sakura, 678); assert.equal(G.state.inventory.craft_sakura_tree, 99); assert.equal(G.state.crafting.last.total, 102);
});
test('重复原预览不能再做第二批，新预览可主动继续制作，不靠时钟冷却', () => {
  const { G } = ready(), preview = G.sys.crafting.status('tulip_vase', 1); assert.ok(G.sys.crafting.craft('tulip_vase', 1, preview.quote).ok);
  unchanged(G, () => G.sys.crafting.craft('tulip_vase', 1, preview.quote)); unchanged(G, () => G.sys.crafting.craft('tulip_vase', 1));
  assert.ok(make(G, 'tulip_vase').ok); assert.equal(G.state.inventory.craft_tulip_vase, 2); assert.equal(G.state.crafting.last.total, 2);
});
test('未知和原型配方ID、非整数或越界数量全部失败且无状态变化', () => {
  const { G } = ready();
  for (const id of ['missing', '__proto__', 'constructor', 'prototype', {}, [], null, 1]) unchanged(G, () => G.sys.crafting.craft(id, 1, 'bad'));
  for (const count of [0, -1, .5, 100, NaN, Infinity, '1', null, {}, []]) { assert.equal(G.sys.crafting.status('tulip_vase', count).ok, false); unchanged(G, () => G.sys.crafting.craft('tulip_vase', count, 'bad')); }
});
test('材料不足不会拿种子或糖果代替，也不提前点亮成品', () => {
  const { G } = ready(); G.store.update(state => { state.garden.harvest.tulip = 0; state.garden.seeds.tulip = 9999; });
  const preview = G.sys.crafting.status('tulip_vase'); assert.equal(preview.canCraft, false); assert.match(preview.reason, /3.*郁金香/); assert.equal(preview.maxCraftable, 0);
  unchanged(G, () => G.sys.crafting.craft('tulip_vase', 1, preview.quote)); assert.equal(G.state.collection.craft_tulip_vase, undefined); assert.equal(G.state.garden.seeds.tulip, 9999);
});
test('背包9999容量预检且批量完整失败，恰好一格可制作', () => {
  const { G } = ready(); G.store.update(state => { state.inventory.craft_tulip_vase = 9998; });
  const tooMany = G.sys.crafting.status('tulip_vase', 3); assert.equal(tooMany.canCraft, false); assert.equal(tooMany.maxCraftable, 1); unchanged(G, () => G.sys.crafting.craft('tulip_vase', 3, tooMany.quote));
  assert.ok(make(G, 'tulip_vase').ok); assert.equal(G.state.inventory.craft_tulip_vase, 9999); const full = G.sys.crafting.status('tulip_vase'); assert.equal(full.canCraft, false); unchanged(G, () => G.sys.crafting.craft('tulip_vase', 1, full.quote));
});
test('加工历史总数到上限前最后一份可做，到上限后所有配方阻止', () => {
  const { G } = ready(); G.store.update(state => { state.crafting = { counts: { tulip_vase: 999999999 }, last: { recipeId: 'tulip_vase', count: 99, total: 999999999, at: Date.now() } }; });
  assert.ok(make(G, 'tulip_vase').ok); assert.equal(G.state.crafting.last.total, 1000000000); assert.ok(G.sys.crafting.list().every(entry => !entry.canCraft && entry.maxCraftable === 0));
  const preview = G.sys.crafting.status('sakura_tree'); unchanged(G, () => G.sys.crafting.craft('sakura_tree', 1, preview.quote));
});
test('材料、输出、等级、工坊、累计制作、档身份变化均废除旧预览', () => {
  for (const kind of ['material', 'output', 'level', 'workshop', 'counts', 'identity']) {
    const { G } = ready(), preview = G.sys.crafting.status('strawberry_deluxe');
    if (kind === 'material') G.store.update(state => { state.garden.harvest.strawberry++; });
    if (kind === 'output') G.store.update(state => { state.inventory.cake_strawberry_deluxe = 1; });
    if (kind === 'level') G.store.update(state => { state.level = 22; });
    if (kind === 'workshop') assert.ok(G.sys.building.buildRoom(0, 1, 'workshop').ok);
    if (kind === 'counts') assert.ok(make(G, 'pumpkin_lantern').ok);
    if (kind === 'identity') G.store.update(state => { state.profile.createdAt++; });
    unchanged(G, () => G.sys.crafting.craft('strawberry_deluxe', 1, preview.quote));
  }
});
test('导入内容相同的存档也废除旧预览，重看后才能制作', () => {
  const { G, parse } = ready(), preview = G.sys.crafting.status('tulip_vase'); G.store.replace(parse(G.state));
  unchanged(G, () => G.sys.crafting.craft('tulip_vase', 1, preview.quote)); assert.ok(make(G, 'tulip_vase').ok);
});
test('日常计时、音量或无关钱包更新不会让正在确认的配方无故失效', () => {
  const { G } = ready(), preview = G.sys.crafting.status('tulip_vase');
  G.store.update(state => { state.profile.playTimeSec += 30; state.settings.sfx = .1; state.settings.dayMode = 'night'; state.wallet.coin--; });
  assert.equal(G.sys.crafting.status('tulip_vase').quote, preview.quote); assert.ok(G.sys.crafting.craft('tulip_vase', 1, preview.quote).ok);
});
test('真实本机拒写不发布材料成品历史或事件，同一预览可重试', () => {
  const { G, storage, writeFails } = ready(), preview = G.sys.crafting.status('blueberry_deluxe'); assert.ok(G.save.flush());
  const stored = storage.get(G.data.balance.saveKey), before = JSON.stringify(G.state); let events = 0; G.bus.on('crafting:made', () => events++); writeFails(true);
  assert.equal(G.sys.crafting.craft('blueberry_deluxe', 1, preview.quote).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(storage.get(G.data.balance.saveKey), stored); assert.equal(events, 0);
  writeFails(false); assert.ok(G.sys.crafting.craft('blueberry_deluxe', 1, preview.quote).ok); assert.equal(events, 1); assert.equal(JSON.parse(storage.get(G.data.balance.saveKey)).inventory.cake_blueberry_deluxe, 1);
});
test('超过完整存档容量时制作原子失败，恢复容量后可重试', () => {
  const { G } = ready(), preview = G.sys.crafting.status('tulip_vase'), cap = G.data.balance.maxSaveBytes;
  try { G.data.balance.maxSaveBytes = 1; unchanged(G, () => G.sys.crafting.craft('tulip_vase', 1, preview.quote)); } finally { G.data.balance.maxSaveBytes = cap; }
  assert.ok(G.sys.crafting.craft('tulip_vase', 1, preview.quote).ok);
});
test('保存、状态通知和完成事件里的同步重入全部拒绝，只消耗一批材料', () => {
  const { G } = ready(), preview = G.sys.crafting.status('pumpkin_lantern'), results = [], commit = G.save.commit;
  G.save.commit = state => { results.push(G.sys.crafting.craft('pumpkin_lantern', 1, preview.quote)); return commit(state); };
  const offState = G.bus.on('state:change', () => results.push(G.sys.crafting.craft('pumpkin_lantern', 1, preview.quote)));
  const offMade = G.bus.on('crafting:made', () => results.push(G.sys.crafting.craft('pumpkin_lantern', 1, preview.quote)));
  assert.ok(G.sys.crafting.craft('pumpkin_lantern', 1, preview.quote).ok); offState(); offMade(); G.save.commit = commit;
  assert.equal(results.length, 3); assert.ok(results.every(result => result.ok === false)); assert.equal(G.state.garden.harvest.pumpkin, 775); assert.equal(G.state.inventory.craft_pumpkin_lantern, 1); assert.equal(G.state.crafting.last.total, 1);
});
test('JSON加载和真正导入恢复历史，latest返回副本不重发或暴露可写凭据', async () => {
  const { G, storage } = ready(); assert.ok(make(G, 'strawberry_deluxe', 3).ok); assert.ok(G.save.flush());
  const raw = JSON.parse(storage.get(G.data.balance.saveKey)), loaded = setup(raw).G; assert.equal(loaded.state.crafting.counts.strawberry_deluxe, 3); assert.equal(loaded.state.inventory.cake_strawberry_deluxe, 3);
  const before = JSON.stringify(loaded.state), latest = loaded.sys.crafting.latest(); latest.count = 99; latest.total = 999; assert.equal(JSON.stringify(loaded.state), before);
  const imported = await G.save.importFile({ text: async () => JSON.stringify(raw) }); assert.ok(imported.ok, imported.message); assert.deepEqual(plain(G.state.crafting), raw.crafting); assert.deepEqual(plain(G.state.wallet), raw.wallet);
});
test('整段缺失的旧档补空历史，部分损坏、未知ID和不一致凭据严格拒绝', () => {
  const { G, parse } = ready(), old = plain(G.state); delete old.crafting; assert.deepEqual(plain(G.store.validate(parse(old)).crafting), { counts: {}, last: null });
  const invalid = [null, {}, { counts: {} }, { last: null }, { counts: [], last: null }, { counts: { missing: 1 }, last: null }, { counts: { tulip_vase: 0 }, last: null }, { counts: {}, last: { recipeId: 'tulip_vase', count: 1, total: 1, at: 1 } }];
  for (const value of invalid) { const raw = plain(G.state); raw.crafting = value; assert.throws(() => G.store.validate(parse(raw))); }
  assert.ok(make(G, 'tulip_vase').ok);
  for (const change of [value => value.last.total++, value => value.last.count = 100, value => value.last.extra = true, value => value.last.recipeId = '__proto__', value => value.last.at = -1, value => value.counts.tulip_vase = .5, value => value.counts.pumpkin_lantern = 1000000000]) {
    const raw = plain(G.state); change(raw.crafting); assert.throws(() => G.store.validate(parse(raw)));
  }
});
test('高级配方历史需要相应等级，成品用完仍保留制作与发现记录', () => {
  const { G, parse } = ready(); assert.ok(make(G, 'blueberry_deluxe').ok); const invalid = plain(G.state); invalid.level = 20; assert.throws(() => G.store.validate(parse(invalid)));
  G.store.update(state => { state.inventory.cake_blueberry_deluxe = 0; state.garden.harvest.blueberry = 0; });
  const saved = plain(G.state), loaded = setup(saved).G; assert.equal(loaded.state.collection.cake_blueberry_deluxe, true); assert.equal(loaded.state.crafting.counts.blueberry_deluxe, 1); assert.equal(loaded.sys.crafting.latest().total, 1); assert.equal(loaded.sys.crafting.status('blueberry_deluxe').stock, 0);
});
async function run() { let passed = 0; for (const entry of tests) { await entry.fn(); passed++; console.log('✓ ' + entry.name); } console.log('\n' + passed + ' 组收获加工规则检查通过。'); }
run().catch(error => { console.error(error); process.exitCode = 1; });
