'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/garden.js', 'js/systems/time.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 27, 12).getTime(); const RealDate = Date, timers = [];
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  spaces.register(G, context.CottageBuilding); G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, timers, at: (date, hour = 12) => { const p = date.split('-').map(Number); clock = new Date(p[0], p[1] - 1, p[2], 0).getTime() + hour * 3600000; }, clock: () => clock };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function has(G, id) { return G.sys.time.current().festivals.some(event => event.festivalId === id); }
function lily(G) { const roomId = spaces.buildSpace(G, 0, 0, 'bedroom').roomId; spaces.placeItem(G, 'bed_basic', roomId, 10, 100); assert.ok(G.sys.residents.invite('lily', roomId).ok); }
test('2025—2035 春节/中秋22个日期符合香港天文台逐年官方表，不依赖本机Intl结果', () => {
  const { G } = sandbox();
  // 2026-10-27独立读取HKO T{year}e.txt的正月初一、八月十五；来源保留在数据文件。
  const official = [
    [2025, '01-29', '10-06'], [2026, '02-17', '09-25'], [2027, '02-06', '09-15'],
    [2028, '01-26', '10-03'], [2029, '02-13', '09-22'], [2030, '02-03', '09-12'],
    [2031, '01-23', '10-01'], [2032, '02-11', '09-19'], [2033, '01-31', '09-08'],
    [2034, '02-19', '09-27'], [2035, '02-08', '09-16']
  ];
  for (const [year, spring, midAutumn] of official) {
    const entry = G.data.lunarFestivalDates[year]; assert.equal(entry.spring_festival, year + '-' + spring); assert.equal(entry.mid_autumn, year + '-' + midAutumn);
    assert.equal(G.data.lunarFestivalSources[year], 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T' + year + 'e.txt');
  }
});
test('2027和2030春节节期以官方正日为中心，前后七天边界不偏移一天', () => {
  const { G } = sandbox();
  for (const [date, active] of [['2027-01-29', false], ['2027-01-30', true], ['2027-02-06', true], ['2027-02-13', true], ['2027-02-14', false], ['2030-01-26', false], ['2030-01-27', true], ['2030-02-03', true], ['2030-02-10', true], ['2030-02-11', false]]) { G.sys.time.setDebug({ date }); assert.equal(has(G, 'spring_festival'), active, date); }
});
test('真实时间 6—18 白天、18—20 黄昏、20—6 夜晚，日出日落过渡连续', () => {
  const { G, at } = sandbox();
  for (const [hour, phase, darkness] of [[0, 'night', 1], [5, 'night', 1], [5.5, 'night', .5], [6, 'day', 0], [17.999, 'day', 0], [18, 'dusk', 0], [19, 'dusk', .5], [20, 'night', 1], [23.99, 'night', 1]]) { at('2026-08-01', hour); const current = G.sys.time.current(); assert.equal(current.phase, phase); assert.ok(Math.abs(current.nightness - darkness) < .001); }
  at('2026-08-01', 19.999); assert.ok(G.sys.time.current().nightness > .999); at('2026-08-01', 5.999); assert.ok(G.sys.time.current().nightness < .001);
});
test('固定白天与夜晚覆盖显示阶段，日期和真实钟保留；debug 时间可单独预览', () => {
  const { G, at, clock } = sandbox(); at('2026-08-01', 23); const actual = clock(); G.store.update(s => { s.settings.dayMode = 'day'; }); assert.equal(G.sys.time.current().phase, 'day'); assert.equal(G.sys.time.current().nightness, 0); assert.equal(G.sys.time.current().hour, 23);
  G.store.update(s => { s.settings.dayMode = 'night'; }); assert.equal(G.sys.time.current().nightness, 1); assert.ok(G.sys.time.setDebug({ hour: 12 }).ok); assert.equal(G.sys.time.current().phase, 'day'); assert.equal(clock(), actual); assert.equal(G.sys.time.current().date, '2026-08-01');
});
test('日期天气稳定，年度覆盖六种天气，雪/樱花/落叶遵守季节', () => {
  const { G, at } = sandbox(), observed = new Set();
  for (let day = 0; day < 365; day++) { const date = new Date(2026, 0, 1 + day), text = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); at(text, 10); const value = G.sys.time.current(); assert.equal(G.sys.time.current().weather, value.weather); observed.add(value.weather); if (value.weather === 'snow') assert.equal(value.season, 'winter'); if (value.weather === 'sakura') assert.equal(value.season, 'spring'); if (value.weather === 'leaves') assert.equal(value.season, 'autumn'); }
  assert.equal(observed.size, 6);
});
test('雨天 15 点后雨停并出现彩虹，其他天气没有雨后彩虹', () => {
  const { G, at } = sandbox(); G.sys.time.setDebug({ weather: 'rain', hour: 14.99 }); assert.equal(G.sys.time.current().weather, 'rain'); assert.equal(G.sys.time.current().rainbow, false); G.sys.time.setDebug({ hour: 15 }); assert.equal(G.sys.time.current().weather, 'clear'); assert.equal(G.sys.time.current().baseWeather, 'rain'); assert.equal(G.sys.time.current().rainbow, true); G.sys.time.setDebug({ hour: 19 }); assert.equal(G.sys.time.current().rainbow, true); G.sys.time.setDebug({ hour: 20 }); assert.equal(G.sys.time.current().rainbow, false); assert.equal(G.sys.time.current().weather, 'clear'); G.sys.time.setDebug({ hour: 22 }); assert.equal(G.sys.time.current().rainbow, false); G.sys.time.setDebug({ weather: 'cloudy', hour: 17 }); assert.equal(G.sys.time.current().rainbow, false); at('2026-08-01', 17); G.sys.time.setDebug({ weather: 'rain', hour: null }); G.store.update(s => { s.settings.dayMode = 'night'; }); assert.equal(G.sys.time.current().rainbow, false);
});
test('春节前后七日、万圣节前后七日与圣诞 12月20—26 日期边界准确', () => {
  const { G } = sandbox();
  for (const [date, festival, active] of [['2026-02-09', 'spring_festival', false], ['2026-02-10', 'spring_festival', true], ['2026-02-24', 'spring_festival', true], ['2026-02-25', 'spring_festival', false], ['2026-10-23', 'halloween', false], ['2026-10-24', 'halloween', true], ['2026-11-07', 'halloween', true], ['2026-11-08', 'halloween', false], ['2026-12-19', 'christmas', false], ['2026-12-20', 'christmas', true], ['2026-12-26', 'christmas', true], ['2026-12-27', 'christmas', false], ['2027-01-01', 'christmas', false]]) { G.sys.time.setDebug({ date }); assert.equal(has(G, festival), active, date); }
  G.sys.time.setDebug({ date: '2026-02-14' }); assert.ok(has(G, 'spring_festival')); assert.ok(has(G, 'valentines'));
});
test('中秋仅当日触发，内置表外不猜农历日期', () => {
  const { G } = sandbox(); for (const date of ['2026-09-24', '2026-09-26', '2036-09-25']) { G.sys.time.setDebug({ date }); assert.equal(has(G, 'mid_autumn'), false); } G.sys.time.setDebug({ date: '2026-09-25' }); assert.equal(has(G, 'mid_autumn'), true);
});
test('每年每事件只领一次，刷新存档保留领奖记录，次年可再庆祝', () => {
  const { G } = sandbox(); G.sys.time.setDebug({ date: '2026-12-25' }); const gift = 'festival_christmas_tree'; assert.ok(G.sys.time.claim('christmas').ok); assert.equal(G.state.calendar.claimed['2026:christmas'], true); assert.equal(G.state.inventory[gift], 1); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.time.claim('christmas').ok, false); assert.equal(JSON.stringify(G.state), snapshot);
  const loaded = sandbox(JSON.parse(snapshot)); loaded.G.sys.time.setDebug({ date: '2026-12-25' }); assert.equal(loaded.G.sys.time.claim('christmas').ok, false); G.sys.time.setDebug({ date: '2027-12-25' }); assert.ok(G.sys.time.claim('christmas').ok); assert.equal(G.state.inventory[gift], 2); assert.equal(G.state.calendar.claimed['2027:christmas'], true);
});
test('节外不可购买节日家具，已有家具仍可正常摆放，非法/满库存领取不扣状态', () => {
  const { G } = sandbox(); G.sys.time.setDebug({ date: '2026-12-25' }); assert.ok(G.sys.economy.buy('festival_christmas_tree').ok); const room = spaces.buildSpace(G, 0, 0, 'bedroom'); G.sys.time.setDebug({ date: '2026-07-01' }); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.economy.buy('festival_christmas_tree').ok, false); assert.equal(G.sys.time.claim('christmas').ok, false); assert.equal(JSON.stringify(G.state), snapshot); assert.ok(spaces.placeItem(G, 'festival_christmas_tree', room.roomId, 70, 50).ok);
  G.sys.time.setDebug({ date: '2026-12-25' }); G.store.update(s => { s.inventory.festival_christmas_tree = 9999; }); const full = JSON.stringify(G.state); assert.equal(G.sys.time.claim('christmas').ok, false); assert.equal(JSON.stringify(G.state), full);
});
test('旧存档补空日历，错误领奖键/居民/值拒绝且不改变现有进度', () => {
  const { G, parse } = sandbox(), legacy = JSON.parse(JSON.stringify(G.state)); delete legacy.calendar; legacy.wallet.coin = 1234; const migrated = sandbox(legacy); assert.equal(migrated.G.state.wallet.coin, 1234); assert.equal(Object.keys(migrated.G.state.calendar.claimed).length, 0);
  const snapshot = JSON.stringify(G.state); for (const claimed of [{ '2026:christmas': false }, { '2026:unknown': true }, { '0000:christmas': true }, { '2026:resident_birthday:unknown': true }, { '2026:resident_birthday': true }, { '2026:christmas:lily': true }]) { const bad = JSON.parse(snapshot); bad.calendar.claimed = claimed; assert.throws(() => G.store.replace(parse(bad))); assert.equal(JSON.stringify(G.state), snapshot); }
});
test('玩家生日可为空且支持闰日；生日事件与节日各自有独立年度领奖键', () => {
  const { G } = sandbox(); G.store.update(s => { s.profile.birthday = '02-29'; }); G.sys.time.setDebug({ date: '2028-02-29' }); assert.ok(has(G, 'player_birthday')); assert.ok(G.sys.time.claim('player_birthday').ok); assert.ok(G.state.calendar.claimed['2028:player_birthday']); G.sys.time.setDebug({ date: '2027-02-28' }); assert.equal(has(G, 'player_birthday'), false); G.store.update(s => { s.profile.birthday = ''; }); assert.equal(has(G, 'player_birthday'), false);
  G.store.update(s => { s.profile.birthday = '06-01'; }); G.sys.time.setDebug({ date: '2026-06-01' }); assert.ok(has(G, 'player_birthday')); assert.ok(has(G, 'children_day')); assert.ok(G.sys.time.claim('player_birthday').ok); assert.ok(G.sys.time.claim('children_day').ok);
});
test('只为已入住朋友庆祝生日，赠帽按居民分别去重，普通送礼仍有生日双倍', () => {
  const { G, at } = sandbox(); G.sys.time.setDebug({ date: '2026-03-14' }); assert.equal(G.sys.time.current().birthdays.length, 0); lily(G); assert.deepEqual(Array.from(G.sys.time.current().birthdays), ['lily']); assert.ok(G.sys.time.claim('resident_birthday_lily').ok); assert.ok(G.state.calendar.claimed['2026:resident_birthday:lily']); assert.equal(G.state.inventory.festival_birthday_hat, 1);
  at('2026-03-14', 12); G.sys.time.clearDebug(); G.store.update(s => { s.garden.harvest.carrot = 1; }); assert.equal(G.sys.residents.gift('lily', 'carrot').affection, 40);
});
test('儿童节朋友送点心和幸福值，所有奖励均在同一领取中去重', () => {
  const { G } = sandbox(); lily(G); G.store.update(s => { s.residents.lily.happiness = 80; }); G.sys.time.setDebug({ date: '2026-06-01' }); assert.ok(G.sys.time.claim('children_day').ok); assert.equal(G.state.inventory.cake_strawberry, 1); assert.equal(G.state.residents.lily.happiness, 85); assert.equal(G.sys.time.claim('children_day').ok, false); assert.equal(G.state.inventory.cake_strawberry, 1);
});
test('日期/时间/天气/节日 debug 仅写 runtime，可单独清除，非法 patch 保留前值', () => {
  const { G, clock } = sandbox(); G.store.update(s => { s.level = 6; }); G.sys.garden.plant(0, 'daisy'); const before = JSON.stringify(G.state), real = clock(), matureAt = G.sys.garden.status(0).matureAt;
  assert.ok(G.sys.time.setDebug({ date: '2030-12-25', hour: 21, weather: 'snow', festival: 'christmas' }).ok); assert.equal(G.sys.time.current().weather, 'snow'); assert.equal(G.sys.time.current().phase, 'night'); assert.equal(JSON.stringify(G.state), before); assert.equal(clock(), real); assert.equal(G.sys.garden.status(0).matureAt, matureAt); assert.equal(G.sys.garden.status(0).stage, 0); assert.equal(G.sys.garden.isNight(), false);
  const debug = JSON.stringify(G.runtime.timeDebug); for (const bad of [{ date: '2026-02-30' }, { hour: 24 }, { weather: 'storm' }, { festival: 'unknown' }, { injected: 1 }]) { assert.equal(G.sys.time.setDebug(bad).ok, false); assert.equal(JSON.stringify(G.runtime.timeDebug), debug); }
  assert.ok(G.sys.time.setDebug({ hour: null, weather: null, festival: null }).ok); assert.equal(G.sys.time.current().date, '2030-12-25'); assert.equal(Object.keys(G.runtime.timeDebug).length, 1); G.sys.time.clearDebug(); assert.equal(G.sys.time.current().debug, false); assert.equal(G.sys.time.current().date, '2026-10-27'); assert.equal(JSON.stringify(G.state), before);
});
test('18 件限定家具全部注册、年度领奖状态可保存，节日灯具有 light 标记', () => {
  const { G } = sandbox(); assert.equal(G.data.festivals.length, 8); assert.equal(G.data.festivalFurniture.length, 18); assert.equal(new Set(G.data.furniture.map(def => def.id)).size, G.data.furniture.length); G.data.festivalFurniture.forEach(def => { assert.equal(G.data.furnitureById[def.id], def); assert.ok(G.data.festivalById[def.festivalId]); assert.equal(def.template, 'festival'); assert.equal(def.rarity, 'limited'); }); assert.ok(G.data.furnitureById.festival_lantern.tags.includes('light')); G.sys.time.setDebug({ festival: 'christmas' }); G.sys.time.claim('christmas'); assert.equal(G.save.flush(), true);
});
test('跨日和设置变化发出 time:change，重复 init 不新增时间定时器', () => {
  const { G, at, timers } = sandbox(); let changed = 0; G.bus.on('time:change', () => changed++); const count = timers.length; G.sys.time.init(); assert.equal(timers.length, count); const before = changed; at('2026-10-28', 20); timers.forEach(fn => fn()); assert.ok(changed > before); const previous = changed; G.store.update(s => { s.settings.dayMode = 'day'; }); assert.ok(changed > previous); assert.equal(G.sys.time.current().phase, 'day');
});
console.log('\n' + passed + ' 组时间、天气与节日检查通过。');
