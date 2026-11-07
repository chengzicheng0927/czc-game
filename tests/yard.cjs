'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/yard.js'];
function sandbox(saved) {
  const context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); G.store.init(saved ? parse(saved) : undefined);
  return { G, parse, prepare: (id, count, coin = 1000) => G.store.update(s => { s.level = 11; s.wallet.coin = coin; s.inventory[id] = count; s.collection[id] = true; }) };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('20 件庭院家具都有独立可绘制类型、真实价格与 Lv.11 解锁条件', () => {
  const { G } = sandbox(); assert.equal(G.data.yardFurniture.length, 20); assert.equal(new Set(G.data.yardFurniture.map(def => def.motif)).size, 20); assert.equal(new Set(G.data.furniture.map(def => def.id)).size, G.data.furniture.length);
  G.data.yardFurniture.forEach(def => { assert.equal(def.place, 'yard'); assert.equal(def.template, 'yard'); assert.equal(def.unlockLv, 11); assert.ok(def.price > 0); assert.ok(def.w > 0 && def.w < 1300 && def.h > 0 && def.h < 250); assert.equal(G.data.furnitureById[def.id], def); }); assert.ok(G.data.furnitureById.yard_streetlamp.tags.includes('light'));
});
test('未解锁不可买/摆，库存不足或错误类型拒绝且不改变状态', () => {
  const { G, prepare } = sandbox(); const initial = JSON.stringify(G.state); assert.equal(G.sys.economy.buy('yard_bench').ok, false); assert.equal(G.sys.yard.place('yard_bench', 0, 100).ok, false); assert.equal(JSON.stringify(G.state), initial); prepare('yard_bench', 0); const before = JSON.stringify(G.state); assert.equal(G.sys.yard.place('yard_bench', 0, 100).ok, false); assert.equal(G.sys.yard.place('bed_basic', 0, 100).ok, false); assert.equal(G.sys.yard.place('yard_bench', NaN, 100).ok, false); assert.equal(G.sys.yard.place('yard_bench', 0, '100').ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('摆放扣一件库存，世界坐标在前院矩形内夹取，移动不重复扣库存', () => {
  const { G, prepare } = sandbox(); prepare('yard_tree', 2); const placed = G.sys.yard.place('yard_tree', -1000, 500); assert.ok(placed.ok); assert.equal(G.state.inventory.yard_tree, 1); let item = G.sys.yard.get(placed.uid); assert.equal(item.x, -650); assert.equal(item.y, 270 - G.data.furnitureById.yard_tree.h); assert.ok(G.sys.yard.move(placed.uid, 1000, -10).ok); item = G.sys.yard.get(placed.uid); assert.equal(item.x, 650 - G.data.furnitureById.yard_tree.w); assert.equal(item.y, 20); assert.equal(G.state.inventory.yard_tree, 1);
});
test('翻转、可爱换色和前后层次可保存；收回准确返库存且不能重复收', () => {
  const { G, prepare } = sandbox(); prepare('yard_bench', 2); const a = G.sys.yard.place('yard_bench', 0, 100), b = G.sys.yard.place('yard_bench', 150, 100); assert.ok(G.sys.yard.get(a.uid).z < G.sys.yard.get(b.uid).z); assert.ok(G.sys.yard.flip(a.uid).ok); assert.equal(G.sys.yard.get(a.uid).flip, true); assert.ok(G.sys.yard.recolor(a.uid, '#FFB6C8').ok); assert.equal(G.sys.yard.get(a.uid).color, '#FFB6C8'); assert.ok(G.sys.yard.layer(a.uid, 1).ok); assert.ok(G.sys.yard.get(a.uid).z > G.sys.yard.get(b.uid).z);
  const before = JSON.stringify(G.state); assert.equal(G.sys.yard.recolor(a.uid, 'red').ok, false); assert.equal(JSON.stringify(G.state), before); assert.ok(G.sys.yard.remove(a.uid).ok); assert.equal(G.state.inventory.yard_bench, 1); assert.equal(G.sys.yard.remove(a.uid).ok, false); assert.equal(G.state.inventory.yard_bench, 1);
});
test('栅栏连续插值铺满格点，重复经过不扣材料，不会在同格叠放', () => {
  const { G, prepare } = sandbox(); prepare('yard_fence', 5); const points = [{ x: -650, y: 20 }, { x: -650 + 5 * 72, y: 20 }], first = G.sys.yard.placeStroke('yard_fence', points); assert.ok(first.ok); assert.equal(first.count, 5); assert.equal(first.partial, true); assert.equal(G.state.inventory.yard_fence, 0); assert.equal(G.state.house.yard.items.length, 5); const coins = G.state.wallet.coin;
  const snapshot = JSON.stringify(G.state); assert.equal(G.sys.yard.placeStroke('yard_fence', points).ok, false); assert.equal(JSON.stringify(G.state), snapshot); assert.equal(G.state.wallet.coin, coins); G.store.update(s => { s.inventory.yard_fence = 1; }); const second = G.sys.yard.placeStroke('yard_fence', points); assert.equal(second.count, 1); assert.equal(G.state.house.yard.items.length, 6); assert.equal(new Set(G.state.house.yard.items.map(item => item.x + ':' + item.y)).size, 6); assert.equal(G.sys.yard.place('yard_fence', -650, 20).ok, false);
});
test('自动补购优先使用库存，仅按实际铺设数量扣价，余额不足部分完成不透支', () => {
  const { G, prepare } = sandbox(); prepare('yard_fence', 2, 75); const result = G.sys.yard.placeStroke('yard_fence', [{ x: -650, y: 20 }, { x: -650 + 7 * 72, y: 20 }], { buyMissing: true }); assert.ok(result.ok); assert.equal(result.count, 5); assert.equal(result.coinsSpent, 75); assert.equal(result.partial, true); assert.equal(G.state.wallet.coin, 0); assert.equal(G.state.inventory.yard_fence, 0); assert.equal(G.state.house.yard.items.length, 5); assert.equal(G.state.quests.stats.bought, 3);
});
test('小路也能连续铺设，关闭补购时库存不足不会花糖果，异常笔画无副作用', () => {
  const { G, prepare } = sandbox(); prepare('yard_path', 3, 1000); const result = G.sys.yard.placeStroke('yard_path', [{ x: 0, y: 100 }, { x: 200, y: 100 }]); assert.equal(result.count, 3); assert.equal(result.coinsSpent, 0); assert.equal(G.state.wallet.coin, 1000); const snapshot = JSON.stringify(G.state); for (const points of [[], [{ x: Infinity, y: 1 }], [{ x: 1 }], 'invalid']) assert.equal(G.sys.yard.placeStroke('yard_path', points, { buyMissing: true }).ok, false); assert.equal(G.sys.yard.placeStroke('yard_tree', [{ x: 0, y: 100 }]).ok, false); assert.equal(JSON.stringify(G.state), snapshot);
});
test('摆庭院家具计入布置任务，连续铺设按实际件数推进', () => {
  const { G, prepare, parse } = sandbox(); prepare('yard_path', 3); const quest = G.data.dailyQuests.find(value => value.metric === 'itemsPlaced'); G.store.update(s => { s.quests.daily.list = parse([{ id: quest.id, progress: 0, done: false, claimed: false }]); }); G.sys.yard.placeStroke('yard_path', [{ x: 0, y: 100 }, { x: 200, y: 100 }]); assert.equal(G.state.quests.stats.itemsPlaced, 3); const entry = G.state.quests.daily.list[0]; assert.equal(entry.progress, 3); assert.equal(entry.done, true);
});
test('庭院最多120件，空间满时稳定拒绝且不扣最后一件库存', () => {
  const { G, prepare } = sandbox(); prepare('yard_bush', 121); for (let i = 0; i < 120; i++) assert.ok(G.sys.yard.place('yard_bush', -600 + i % 15 * 70, 30 + Math.floor(i / 15) * 10).ok); const before = JSON.stringify(G.state); assert.equal(G.sys.yard.place('yard_bush', 0, 100).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(G.state.inventory.yard_bush, 1);
});
test('房间与前院共享总上限，批量只铺剩余格数，室内继续摆放也平稳拒绝', () => {
  const { G, prepare, parse } = sandbox(); prepare('yard_path', 20); const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; G.store.update(s => { s.house.rooms[roomId].items = parse(Array.from({ length: 990 }, (_, index) => ({ uid: 'room_test_' + index, defId: 'bed_basic', x: 10, y: 130, z: index, flip: false, color: null, parent: null }))); }); const result = G.sys.yard.placeStroke('yard_path', [{ x: -650, y: 20 }, { x: 594, y: 230 }]); assert.equal(result.count, 10); assert.equal(result.partial, true); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.decorating.place('bed_basic', roomId, 0, 100).ok, false); assert.equal(G.sys.yard.place('yard_path', 400, 100).ok, false); assert.equal(JSON.stringify(G.state), snapshot);
});
test('含庭院JSON完整恢复，旧档缺少庭院字段安全补齐为空', () => {
  const { G, prepare } = sandbox(); prepare('yard_swing', 1); const placed = G.sys.yard.place('yard_swing', 40, 40); G.sys.yard.flip(placed.uid); G.sys.yard.recolor(placed.uid, '#BDECD6'); const saved = JSON.parse(JSON.stringify(G.state)), loaded = sandbox(saved); assert.equal(JSON.stringify(loaded.G.state.house.yard), JSON.stringify(G.state.house.yard)); const legacy = JSON.parse(JSON.stringify(G.state)); delete legacy.house.yard; const migrated = sandbox(legacy); assert.equal(migrated.G.state.house.yard.items.length, 0); assert.equal(migrated.G.state.wallet.coin, G.state.wallet.coin);
});
test('坏坐标、未知家具、室内家具混入庭院、重复UID和错误颜色/层级拒绝', () => {
  const { G, prepare, parse } = sandbox(); prepare('yard_bench', 1); G.sys.yard.place('yard_bench', 0, 100); const snapshot = JSON.stringify(G.state), variants = [s => { s.house.yard.items[0].x = -651; }, s => { s.house.yard.items[0].y = 270; }, s => { s.house.yard.items[0].defId = 'bed_basic'; }, s => { s.house.yard.items[0].defId = 'unknown'; }, s => { s.house.yard.items[0].flip = 'yes'; }, s => { s.house.yard.items[0].color = '#BAD'; }, s => { s.house.yard.items[0].z = 10001; }, s => { s.house.yard.items.push(s.house.yard.items[0]); }];
  for (const mutate of variants) { const bad = JSON.parse(snapshot); mutate(bad); assert.throws(() => G.store.replace(parse(bad))); assert.equal(JSON.stringify(G.state), snapshot); }
});
test('最高合法层级的旧档仍可连续铺栅栏，输出不会越过层级上限', () => {
  const { G, prepare } = sandbox(); prepare('yard_fence', 4); const first = G.sys.yard.place('yard_fence', -650, 20); G.store.update(s => { s.house.yard.items.find(item => item.uid === first.uid).z = 10000; }); assert.ok(G.sys.yard.placeStroke('yard_fence', [{ x: -500, y: 20 }, { x: -350, y: 20 }]).ok); assert.ok(G.state.house.yard.items.every(item => item.z <= 10000));
});
console.log('\n' + passed + ' 组庭院检查通过。');
