'use strict';
// 正式规则、真实保存拒写与静态绘图检查；不启动服务、浏览器或计时器。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/garden.js', 'js/systems/avatar.js', 'js/systems/time.js', 'js/systems/observatory.js', 'js/render/observatory.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 28, 21).getTime(), storageError = false; const RealDate = Date, storage = new Map();
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (storageError) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, storage, writeFails(value) { storageError = value; }, at(date, hour = 21) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], hour).getTime(); } };
}
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function ready(G) { G.store.update(state => { state.level = 17; state.wallet.coin = 5000; state.settings.dayMode = 'night'; }); }
test('Lv17与1000糖果同时满足才可建造，查询与init不修改进度', () => {
  const { G } = sandbox(), before = JSON.stringify(G.state); assert.equal(G.sys.observatory.status().unlocked, false); assert.equal(G.sys.observatory.build().ok, false); G.sys.observatory.init(); assert.equal(JSON.stringify(G.state), before);
  ready(G); G.store.update(state => state.wallet.coin = 999); const poor = JSON.stringify(G.state); assert.equal(G.sys.observatory.build().ok, false); assert.ok(G.sys.observatory.status().reason.includes('1')); assert.equal(JSON.stringify(G.state), poor);
  G.store.update(state => state.wallet.coin = 1000); assert.equal(G.sys.observatory.status().canBuild, true); assert.ok(G.sys.observatory.build().ok); assert.equal(G.state.wallet.coin, 0); assert.equal(G.state.house.attic.type, 'observatory');
});
test('独立阁楼不占普通房间格，十二间房住满后仍能建造', () => {
  const { G } = sandbox(); G.store.update(state => { state.level = 30; state.wallet.coin = 50000; });
  for (let floor = 0; floor < 4; floor++) for (let slot = 0; slot < 3; slot++) assert.ok(G.sys.building.buildRoom(floor, slot, 'bedroom').ok);
  const rooms = JSON.stringify(G.state.house.rooms), floors = JSON.stringify(G.state.house.floors), count = G.state.quests.stats.roomsBuilt, coin = G.state.wallet.coin;
  assert.ok(G.sys.observatory.build().ok); assert.equal(JSON.stringify(G.state.house.rooms), rooms); assert.equal(JSON.stringify(G.state.house.floors), floors); assert.equal(G.state.quests.stats.roomsBuilt, count); assert.equal(G.state.wallet.coin, coin - 1000); assert.equal(Object.keys(G.state.house.rooms).length, 12);
  const before = JSON.stringify(G.state); assert.equal(G.sys.observatory.build().ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('建造在一次真实保存中扣款与记录，失败不动内存和本机原文', () => {
  const { G, storage, writeFails } = sandbox(); ready(G); assert.ok(G.save.flush()); const before = JSON.stringify(G.state), disk = storage.get(G.data.balance.saveKey); writeFails(true);
  assert.equal(G.sys.observatory.build().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(storage.get(G.data.balance.saveKey), disk);
  writeFails(false); let events = 0; G.bus.on('observatory:built', () => events++); assert.ok(G.sys.observatory.build().ok); assert.equal(events, 1); assert.equal(JSON.parse(storage.get(G.data.balance.saveKey)).house.attic.type, 'observatory');
});
test('白天和黄昏不能观星，真实夜间与永远夜晚都能使用', () => {
  const { G, at } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok); G.store.update(state => state.settings.dayMode = 'real'); at('2026-10-28', 12); const before = JSON.stringify(G.state);
  assert.equal(G.sys.observatory.status().night, false); assert.equal(G.sys.observatory.observe().ok, false); assert.equal(JSON.stringify(G.state), before);
  at('2026-10-28', 19); assert.equal(G.sys.observatory.observe().ok, false); at('2026-10-28', 20); assert.equal(G.sys.observatory.status().canObserve, true);
  at('2026-10-28', 5); assert.equal(G.sys.observatory.status().canObserve, true); at('2026-10-28', 6); assert.equal(G.sys.observatory.observe().ok, false); G.store.update(state => state.settings.dayMode = 'night'); assert.equal(G.sys.observatory.status().canObserve, true);
});
test('当夜观星发三枚碎片、星座与回忆同次保存，计数和事件只有一次', () => {
  const { G, storage } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok); const coin = G.state.wallet.coin, changes = [], events = [];
  G.bus.on('state:change', state => changes.push(plain(state))); G.bus.on('observatory:observed', event => events.push(event));
  const result = G.sys.observatory.observe(); assert.ok(result.ok, result.message); assert.equal(G.state.observatory.fragments, 3); assert.equal(G.state.observatory.observations, 1); assert.equal(G.state.observatory.lastDate, '2026-10-28'); assert.equal(changes.length, 1); assert.equal(events.length, 1); assert.equal(G.state.wallet.coin, coin); assert.equal(Object.keys(result.discovery).length, 4);
  const saved = JSON.parse(storage.get(G.data.balance.saveKey)); assert.equal(saved.observatory.lastDiscovery.id, result.discovery.id); assert.ok(G.state.memories.at(-1).text.includes(G.data.constellationById[result.discovery.id].name));
});
test('重复、漏夜与日期回拨都不补发，之后新日期只能领一份', () => {
  const { G, at } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok); assert.ok(G.sys.observatory.observe().ok); const before = JSON.stringify(G.state);
  assert.equal(G.sys.observatory.observe().ok, false); assert.equal(JSON.stringify(G.state), before); at('2026-10-27'); assert.equal(G.sys.observatory.status().clockBehind, true); assert.equal(G.sys.observatory.observe().ok, false); assert.equal(JSON.stringify(G.state), before);
  at('2026-10-31'); assert.equal(G.sys.observatory.status().canObserve, true); assert.ok(G.sys.observatory.observe().ok); assert.equal(G.state.observatory.observations, 2); assert.equal(G.state.observatory.fragments, 6); assert.equal(G.sys.observatory.observe().ok, false);
});
test('回看与同日刷新得到相同星座，返回副本不能改写记录', () => {
  const { G, parse } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok); const first = G.sys.observatory.status().constellation.id; assert.equal(G.sys.observatory.status().constellation.id, first); assert.ok(G.sys.observatory.observe().ok);
  const before = JSON.stringify(G.state), receipt = G.sys.observatory.latest(); receipt.id = 'fake'; G.sys.observatory.status().constellation.points[0][0] = 999; G.sys.observatory.init(); assert.equal(JSON.stringify(G.state), before);
  const loaded = sandbox(parse(G.state)); assert.equal(loaded.G.sys.observatory.status().constellation.id, first); assert.equal(loaded.G.sys.observatory.status().canObserve, false); assert.equal(loaded.G.sys.observatory.latest().id, first);
});
test('观星实际拒写及存档容量超限均原子失败，恢复后仍可当天领取', () => {
  const { G, storage, writeFails } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok); const before = JSON.stringify(G.state), disk = storage.get(G.data.balance.saveKey);
  writeFails(true); assert.equal(G.sys.observatory.observe().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(storage.get(G.data.balance.saveKey), disk); writeFails(false);
  const limit = G.data.balance.maxSaveBytes; G.data.balance.maxSaveBytes = 1; try { assert.equal(G.sys.observatory.observe().ok, false); assert.equal(JSON.stringify(G.state), before); } finally { G.data.balance.maxSaveBytes = limit; }
  assert.ok(G.sys.observatory.observe().ok); assert.equal(G.state.observatory.fragments, 3);
});
test('同步状态事件与完成事件的重入不会重复建造或发碎片', () => {
  const { G } = sandbox(); ready(G); let nestedBuild, nestedObserve, armed = true;
  const off = G.bus.on('state:change', () => { if (armed) { armed = false; nestedBuild = G.sys.observatory.build(); } }); assert.ok(G.sys.observatory.build().ok); off(); assert.equal(nestedBuild.ok, false);
  G.bus.on('observatory:observed', () => nestedObserve = G.sys.observatory.observe()); assert.ok(G.sys.observatory.observe().ok); assert.equal(nestedObserve.ok, false); assert.equal(G.state.observatory.fragments, 3);
});
test('JSON往返恢复阁楼和已领星空，旧版缺字段可安全迁移', async () => {
  const { G, parse } = sandbox(); const legacy = parse(G.state); delete legacy.observatory; G.store.replace(legacy); assert.equal(G.state.observatory.fragments, 0); assert.equal(G.state.house.attic, null);
  ready(G); assert.ok(G.sys.observatory.build().ok); assert.ok(G.sys.observatory.observe().ok); const saved = parse(G.state), result = await G.save.importFile({ text: async () => JSON.stringify(saved) }); assert.ok(result.ok, result.message); assert.equal(G.state.house.attic.type, 'observatory'); assert.equal(G.sys.observatory.status().canObserve, false); assert.equal(G.state.observatory.fragments, 3);
});
test('阁楼与星空严格校验拒绝未知类型、非整数、坏日期和不一致凭据', () => {
  const { G, parse } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok); assert.ok(G.sys.observatory.observe().ok);
  for (const change of [s => s.house.attic.type = 'bedroom', s => s.house.attic.extra = true, s => s.house.attic.paidPrice = 1, s => s.house.attic.builtAt = -1, s => s.level = 16, s => s.house.attic = null, s => s.observatory.extra = true, s => s.observatory.fragments = 4, s => s.observatory.observations = 1.5, s => s.observatory.lastDate = '2026-02-30', s => s.observatory.lastDiscovery.id = 'fake', s => s.observatory.lastDiscovery.date = '2026-10-27', s => s.observatory.lastDiscovery.at = -1, s => s.observatory.lastDiscovery.fragments = 4, s => s.observatory.lastDiscovery = null]) { const raw = parse(G.state); change(raw); assert.throws(() => G.store.validate(raw)); }
});
test('碎片上限不会溢出，不改日期或计数', () => {
  const { G } = sandbox(); ready(G); assert.ok(G.sys.observatory.build().ok);
  G.store.update(state => { state.observatory = { fragments: 999999999, observations: 333333333, lastDate: '2026-10-27', lastDiscovery: { id: 'sleeping_cat', at: Date.now(), date: '2026-10-27', fragments: 3 } }; }); const before = JSON.stringify(G.state); assert.equal(G.sys.observatory.status().canObserve, false); assert.equal(G.sys.observatory.observe().ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('幻想星座数据日期固定、六种有效，纯静态绘图平衡save/restore且不修改存档', () => {
  const { G } = sandbox(); assert.equal(G.data.constellations.length, 6); const ids = new Set();
  for (let day = 1; day <= 31; day++) { const date = '2026-10-' + String(day).padStart(2, '0'), def = G.data.constellationForDate(date); assert.ok(G.data.constellationById[def.id]); assert.equal(G.data.constellationForDate(date).id, def.id); ids.add(def.id); }
  assert.equal(ids.size, 6); const calls = []; let depth = 0;
  const ctx = new Proxy({}, { get(_, name) { if (name === 'save') return () => depth++; if (name === 'restore') return () => depth--; return (...args) => calls.push([name, args]); }, set() { return true; } });
  const before = JSON.stringify(G.state); G.draw.observatory.draw(ctx, -160, -450, 320, 185, true); G.draw.observatory.draw(ctx, 0, 0, 640, 370, false); G.draw.observatory.drawConstellation(ctx, G.data.constellations[0], 0, 0, 560, 320); assert.equal(depth, 0); assert.ok(calls.some(call => call[0] === 'bezierCurveTo')); assert.ok(calls.some(call => call[0] === 'rotate')); assert.equal(JSON.stringify(G.state), before);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组阁楼天文台与观星事务检查通过（模拟Canvas，不替代真实界面目视验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
