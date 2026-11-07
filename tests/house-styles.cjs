'use strict';
// 风格报价、原子购买与旧档恢复；真实store/save，串行运行，不接触浏览器存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/house-styles.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/data/deals.js', 'js/data/login.js', 'js/data/crafting.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/exterior.js', 'js/systems/house-styles.js'];
const spaces = require('./fixtures/free-spaces.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function setup(saved) {
  let rejectWrites = false, writes = 0;
  const storage = new Map(), downloads = [], context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (rejectWrites) throw new Error('QuotaExceededError'); writes++; storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  spaces.register(G, context.CottageBuilding); G.store.init(saved ? parse(saved) : undefined); G.utils.download = (name, value) => downloads.push({ name, value });
  return { G, parse, storage, downloads, writes: () => writes, writeFails(value) { rejectWrites = value; } };
}
function ready(G, level = 12) { G.store.update(state => { state.level = level; state.wallet.coin = 5000; state.wallet.heart = 500; }); }
function apply(G, id) { const status = G.sys.houseStyles.preview(id); return G.sys.houseStyles.apply(id, status.quote); }
function unchanged(G, operation) { const before = JSON.stringify(G.state), result = operation(); assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), before); return result; }
const tests = []; function test(name, run) { tests.push({ name, run }); }

test('六套可混搭配方复用现有31款部件，三套免费且轮廓/配色可区分', () => {
  const { G } = setup(), styles = G.data.houseStyles;
  assert.equal(styles.length, 6); assert.equal(new Set(styles.map(style => style.id)).size, 6);
  const signatures = new Set();
  for (const style of styles) {
    for (const category of ['roof', 'wall', 'window', 'door', 'chimney']) assert.equal(G.data.exteriorById[style.exterior[category]].category, category);
    for (const key of ['roofColor', 'wallColor']) assert.match(style.exterior[key], /^#[0-9A-F]{6}$/);
    signatures.add(JSON.stringify(style.exterior));
  }
  assert.equal(signatures.size, 6); assert.equal(G.sys.houseStyles.list().filter(style => style.unlockLv === 1 && style.cost.coin === 0 && style.cost.heart === 0).length, 3);
});
test('试穿与清单是纯查询，返回副本不改变实际外观或配方', () => {
  const { G } = setup(), before = JSON.stringify(G.state), style = G.sys.houseStyles.preview('mint_cloud');
  assert.ok(style.ok); assert.equal(style.locked, true); assert.equal(style.canApply, false); assert.equal(style.cost.coin, 415); assert.equal(style.unlockLv, 5);
  style.exterior.roof = 'roof_triangle'; style.exterior.owned.roof_cloud = true; style.parts[0].price = 0; style.cost.coin = 0;
  assert.equal(G.sys.houseStyles.preview('mint_cloud').exterior.roof, 'roof_cloud'); assert.equal(G.sys.houseStyles.preview('mint_cloud').cost.coin, 415); assert.equal(JSON.stringify(G.state), before);
  for (const id of ['unknown', '__proto__', 'constructor', 'toString', null, {}, ['sea_salt']]) { assert.equal(G.sys.houseStyles.preview(id).ok, false); unchanged(G, () => G.sys.houseStyles.apply(id, 'quote')); }
});
test('三套免费风格在Lv1逐套主动应用，不扣币/爱心，保存实际部件与颜色', () => {
  const { G, storage } = setup(), wallet = plain(G.state.wallet), stats = plain(G.state.quests), memories = G.state.memories.length;
  for (const id of ['strawberry_cream', 'sea_salt', 'peach_honey']) {
    const status = G.sys.houseStyles.preview(id); assert.ok(status.canApply); assert.ok(G.sys.houseStyles.apply(id, status.quote).ok);
    assert.equal(G.sys.houseStyles.current(), id); assert.deepEqual(plain(G.state.wallet), wallet); assert.deepEqual(plain(G.state.quests), stats);
    assert.deepEqual(JSON.parse(storage.get(G.data.balance.saveKey)).house.exterior, plain(G.state.house.exterior));
  }
  assert.equal(G.state.memories.length, memories + 3); assert.equal(G.state.house.exterior.chimney, 'normal');
});
test('缺件价逐项合计，原子购买/换上只扣一次且只记录一次回忆', () => {
  const { G, writes } = setup(); ready(G); const before = plain(G.state), count = writes(), bought = [], changes = [];
  G.bus.on('exterior:bought', value => bought.push(value)); G.bus.on('exterior:changed', value => changes.push(value));
  const quote = G.sys.houseStyles.preview('mint_cloud'); assert.equal(quote.missing.length, 4); assert.equal(quote.cost.coin, 415);
  const result = G.sys.houseStyles.apply('mint_cloud', quote.quote); assert.ok(result.ok); assert.equal(writes(), count + 1); assert.equal(G.state.wallet.coin, before.wallet.coin - 415); assert.equal(G.state.wallet.heart, before.wallet.heart);
  for (const part of quote.parts) { assert.equal(G.state.house.exterior.owned[part.id], true); assert.equal(G.state.house.exterior[part.category], part.id); }
  assert.equal(G.state.memories.length, before.memories.length + 1); assert.equal(bought.length, 4); assert.equal(changes.length, 1);
  unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', quote.quote));
  const repeated = G.sys.houseStyles.preview('mint_cloud'), after = JSON.stringify(G.state), repeatedWrites = writes();
  assert.equal(G.sys.houseStyles.apply('mint_cloud', repeated.quote).unchanged, true); assert.equal(JSON.stringify(G.state), after); assert.equal(writes(), repeatedWrites); assert.equal(bought.length, 4);
});
test('已购部件跨风格复用，只购买尚缺部分，未装备的拥有权也保留', () => {
  const { G } = setup(); ready(G); assert.ok(G.sys.exterior.buy('roof_round').ok); assert.ok(apply(G, 'mint_cloud').ok);
  const quote = G.sys.houseStyles.preview('forest_cookie'); assert.equal(quote.cost.coin, 315); assert.equal(quote.parts.find(part => part.id === 'win_round').owned, true);
  const wallet = G.state.wallet.coin; assert.ok(G.sys.houseStyles.apply('forest_cookie', quote.quote).ok); assert.equal(G.state.wallet.coin, wallet - 315); assert.equal(G.state.house.exterior.owned.roof_round, true); assert.equal(G.state.house.exterior.owned.roof_cloud, true);
});
test('爱心风格保留真实等级与双货币，拥有部件也不能绕过装备等级', () => {
  const { G } = setup(); ready(G, 6); const locked = G.sys.houseStyles.preview('blueberry_night'); assert.equal(locked.unlockLv, 12); assert.equal(locked.cost.heart, 145); assert.equal(locked.cost.coin, 0);
  unchanged(G, () => G.sys.houseStyles.apply('blueberry_night', locked.quote));
  G.store.update(state => { state.level = 12; state.wallet.heart = 144; }); const short = G.sys.houseStyles.preview('blueberry_night'); assert.equal(short.canAfford, false); assert.match(short.reason, /1 颗爱心/); unchanged(G, () => G.sys.houseStyles.apply('blueberry_night', short.quote));
  G.store.update(state => { state.wallet.heart = 145; }); const coin = G.state.wallet.coin; assert.ok(apply(G, 'blueberry_night').ok); assert.equal(G.state.wallet.heart, 0); assert.equal(G.state.wallet.coin, coin);
  G.store.update(state => { state.level = 1; }); unchanged(G, () => apply(G, 'blueberry_night'));
});
test('缺少/非法/旧报价均拒绝，单件搭配或相关拥有权变化不能被旧预览覆盖', () => {
  const { G } = setup(); ready(G); const quote = G.sys.houseStyles.preview('mint_cloud');
  for (const invalid of [undefined, null, {}, [], 1, '', quote.quote + ' ']) unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', invalid));
  assert.ok(G.sys.exterior.color('roof', '#AABBCC').ok); unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', quote.quote));
  const fresh = G.sys.houseStyles.preview('mint_cloud'); assert.ok(G.sys.exterior.buy('win_round').ok); unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', fresh.quote));
  assert.ok(apply(G, 'mint_cloud').ok);
});
test('确认时余额不足再次校验，不允许负数钱包或半套购买', () => {
  const { G } = setup(); ready(G); const quote = G.sys.houseStyles.preview('mint_cloud'); G.store.update(state => { state.wallet.coin = 414; });
  unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', quote.quote)); assert.equal(G.state.house.exterior.owned.roof_cloud, undefined); assert.equal(G.state.house.exterior.owned.wall_bamboo, undefined);
});
test('真实localStorage拒写和容量失败均保留钱包/外观/回忆/磁盘，不发完成事件', () => {
  const env = setup(), { G } = env; ready(G); assert.ok(G.save.flush()); const before = JSON.stringify(G.state), disk = env.storage.get(G.data.balance.saveKey), runtime = JSON.stringify(G.runtime); let events = 0;
  G.bus.on('exterior:bought', () => events++); G.bus.on('exterior:changed', () => events++); const quote = G.sys.houseStyles.preview('mint_cloud');
  env.writeFails(true); unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', quote.quote)); env.writeFails(false);
  const max = G.data.balance.maxSaveBytes; G.data.balance.maxSaveBytes = 1; try { unchanged(G, () => G.sys.houseStyles.apply('mint_cloud', quote.quote)); } finally { G.data.balance.maxSaveBytes = max; }
  assert.equal(JSON.stringify(G.state), before); assert.equal(env.storage.get(G.data.balance.saveKey), disk); assert.equal(JSON.stringify(G.runtime), runtime); assert.equal(events, 0); assert.ok(G.sys.houseStyles.apply('mint_cloud', quote.quote).ok);
});
test('同步保存和完成事件重入不能重复扣币、追加回忆或换第二套风格', () => {
  const { G } = setup(); ready(G); const before = plain(G.state), nested = []; let armed = true;
  G.bus.on('state:change', () => { if (armed) { armed = false; nested.push(apply(G, 'forest_cookie')); } }); G.bus.on('exterior:changed', () => nested.push(apply(G, 'forest_cookie')));
  assert.ok(apply(G, 'mint_cloud').ok); assert.equal(nested.length, 2); assert.ok(nested.every(result => !result.ok)); assert.equal(G.state.wallet.coin, before.wallet.coin - 415); assert.equal(G.state.memories.length, before.memories.length + 1); assert.equal(G.sys.houseStyles.current(), 'mint_cloud');
});
test('换风格不改变房间/住户/家具/庭院/任务/经验，只保留外观事实而不加新字段', () => {
  const { G } = setup(); ready(G); const bedroom = spaces.buildSpace(G, 0, 0, 'bedroom'); assert.ok(bedroom.ok); assert.ok(spaces.placeItem(G, 'bed_basic', bedroom.roomId, 35, 80).ok); assert.ok(G.sys.residents.invite('lily', bedroom.roomId).ok);
  const before = plain(G.state); assert.ok(apply(G, 'forest_cookie').ok); const after = plain(G.state);
  for (const state of [before, after]) { delete state.house.exterior; delete state.wallet; delete state.memories; }
  assert.deepEqual(after, before); assert.deepEqual(Object.keys(G.state.house.exterior).sort(), ['roof', 'wall', 'window', 'door', 'chimney', 'roofColor', 'wallColor', 'owned'].sort());
});
test('单独换色/换部件后显示自由搭配，不依赖可能过时的风格ID', () => {
  const { G } = setup(); ready(G); assert.ok(apply(G, 'mint_cloud').ok); assert.equal(G.sys.houseStyles.current(), 'mint_cloud');
  assert.ok(G.sys.exterior.color('roof', '#9ABBCD').ok); assert.equal(G.sys.houseStyles.current(), null); assert.ok(G.sys.exterior.equip('roof', 'roof_triangle').ok); assert.equal(G.sys.houseStyles.current(), null); assert.ok(G.data.validateExterior(G.state.house.exterior));
});
test('JSON导出/实际导入与刷新恢复真实拥有权/配色，旧档无需新增字段', async () => {
  const env = setup(), { G } = env; ready(G); assert.ok(apply(G, 'blueberry_night').ok); const saved = plain(G.state), json = G.save.exportJson();
  assert.equal(setup(saved).G.sys.houseStyles.current(), 'blueberry_night'); assert.ok(apply(G, 'sea_salt').ok);
  const result = await G.save.importFile({ text: async () => json }); assert.ok(result.ok, result.message); assert.equal(G.sys.houseStyles.current(), 'blueberry_night'); assert.deepEqual(plain(G.state.house.exterior), saved.house.exterior);
  const old = plain(G.store.defaultState()); delete old.house.exterior.owned; const reopened = setup(old); assert.equal(reopened.G.sys.houseStyles.current(), null); assert.equal(reopened.G.sys.houseStyles.preview('sea_salt').cost.coin, 0); assert.ok(apply(reopened.G, 'sea_salt').ok);
});
test('回忆容量达到上限仍只保留最近记录，已选配色大小写按同一风格识别', () => {
  const { G } = setup(); G.store.update(state => { state.memories = Array.from({ length: G.data.balance.maxMemories }, (_, index) => ({ at: index, text: '旧回忆' + index })); });
  assert.ok(apply(G, 'sea_salt').ok); assert.equal(G.state.memories.length, G.data.balance.maxMemories); assert.match(G.state.memories.at(-1).text, /海盐蓝/);
  G.store.update(state => { state.house.exterior.roofColor = state.house.exterior.roofColor.toLowerCase(); state.house.exterior.wallColor = state.house.exterior.wallColor.toLowerCase(); }); assert.equal(G.sys.houseStyles.current(), 'sea_salt');
});

(async () => { for (const { name, run } of tests) { await run(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组整套小屋风格规则验证通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
