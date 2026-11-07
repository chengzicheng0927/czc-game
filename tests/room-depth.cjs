'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js'];
function sandbox(saved) {
  const context = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context;
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); G.store.init(saved ? parse(saved) : undefined);
  return { G, parse, room: () => G.sys.building.buildRoom(0, 0, 'bedroom').roomId, item: (roomId, uid) => G.state.house.rooms[roomId].items.find(item => item.uid === uid) };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('新落地家具默认 depth=.75，显式 0/1 合法且 canonical 地面坐标不变', () => {
  const { G, room, item } = sandbox(), roomId = room(); const first = G.sys.decorating.place('bed_basic', roomId, 10, 90); assert.ok(first.ok); assert.equal(item(roomId, first.uid).depth, .75); assert.equal(item(roomId, first.uid).y, 200 - G.data.furnitureById.bed_basic.h);
  G.store.update(s => { s.inventory.bed_basic = 2; }); for (const depth of [0, 1]) { const result = G.sys.decorating.place('bed_basic', roomId, 20, 10, undefined, depth); assert.ok(result.ok); assert.equal(item(roomId, result.uid).depth, depth); assert.equal(item(roomId, result.uid).y, 130); }
});
test('移动可改变深度，不传时保留深度，x/y 与原有地面规则兼容', () => {
  const { G, room, item } = sandbox(), roomId = room(); const placed = G.sys.decorating.place('bed_basic', roomId, 10, 80, null, .2); assert.ok(G.sys.decorating.move(roomId, placed.uid, roomId, 90, 1, null, .9).ok); assert.equal(item(roomId, placed.uid).depth, .9); assert.equal(item(roomId, placed.uid).x, 90); assert.equal(item(roomId, placed.uid).y, 130); assert.ok(G.sys.decorating.move(roomId, placed.uid, roomId, 110, 200).ok); assert.equal(item(roomId, placed.uid).depth, .9);
});
test('非法 depth 的摆放和移动均拒绝，库存、位置、经验和撤销状态不被修改', () => {
  const { G, room } = sandbox(), roomId = room(), placed = G.sys.decorating.place('nightstand_basic', roomId, 100, 100, null, .25); const before = JSON.stringify(G.state);
  for (const depth of [-.001, 1.001, null, '0.5', NaN, Infinity, {}, []]) { assert.equal(G.sys.decorating.place('bed_basic', roomId, 10, 90, null, depth).ok, false); assert.equal(G.sys.decorating.move(roomId, placed.uid, roomId, 150, 70, null, depth).ok, false); assert.equal(JSON.stringify(G.state), before); }
});
test('台面小物没有独立 depth，父件变深只影响父深度；原 XY 子坐标照常跟随', () => {
  const { G, room, item } = sandbox(), roomId = room(); const parent = G.sys.decorating.place('nightstand_basic', roomId, 200, 0, null, .3); const child = G.sys.decorating.place('desk_lamp_basic', roomId, 205, 125, parent.uid); assert.ok(child.ok); assert.equal(Object.hasOwn(item(roomId, child.uid), 'depth'), false); const before = { x: item(roomId, child.uid).x, y: item(roomId, child.uid).y };
  assert.ok(G.sys.decorating.move(roomId, parent.uid, roomId, 220, 200, null, .95).ok); assert.equal(item(roomId, parent.uid).depth, .95); assert.equal(item(roomId, child.uid).x - before.x, 20); assert.equal(item(roomId, child.uid).y, before.y); assert.equal(Object.hasOwn(item(roomId, child.uid), 'depth'), false); assert.equal(item(roomId, child.uid).parent, parent.uid);
});
test('跨房间移动父子组保留深度和父子关系，子物不写入 depth', () => {
  const { G, room, item } = sandbox(), source = room(); const target = G.sys.building.buildRoom(0, 1, 'bedroom').roomId, parent = G.sys.decorating.place('nightstand_basic', source, 100, 0, null, .1), child = G.sys.decorating.place('desk_lamp_basic', source, 105, 125, parent.uid); assert.ok(G.sys.decorating.move(source, parent.uid, target, 180, 40).ok); assert.equal(item(target, parent.uid).depth, .1); assert.equal(item(target, child.uid).parent, parent.uid); assert.equal(Object.hasOwn(item(target, child.uid), 'depth'), false); assert.equal(G.state.house.rooms[source].items.length, 0);
});
test('墙面、吊顶和台面物件不接受 depth，但原来未传 depth 的接口仍可用', () => {
  const { G, room, item } = sandbox(), roomId = room(); G.store.update(s => { s.inventory.window_basic = 1; s.inventory.ceiling_lamp_basic = 1; });
  for (const id of ['window_basic', 'ceiling_lamp_basic', 'desk_lamp_basic']) { const before = JSON.stringify(G.state); assert.equal(G.sys.decorating.place(id, roomId, 20, 50, null, .4).ok, false); assert.equal(JSON.stringify(G.state), before); const placed = G.sys.decorating.place(id, roomId, 20, 50); assert.ok(placed.ok); assert.equal(Object.hasOwn(item(roomId, placed.uid), 'depth'), false); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.decorating.move(roomId, placed.uid, roomId, 60, 60, null, .5).ok, false); assert.equal(JSON.stringify(G.state), snapshot); }
});
test('旧存档落地物件缺 depth 自动补 .75，原有 x/y 与子父坐标完整保留', () => {
  const { G, room } = sandbox(), roomId = room(), parent = G.sys.decorating.place('nightstand_basic', roomId, 200, 0, null, .5), child = G.sys.decorating.place('desk_lamp_basic', roomId, 205, 125, parent.uid); const old = JSON.parse(JSON.stringify(G.state)); delete old.house.rooms[roomId].items.find(item => item.uid === parent.uid).depth; const before = old.house.rooms[roomId].items.map(item => ({ uid: item.uid, x: item.x, y: item.y, parent: item.parent })); const restored = sandbox(old); assert.equal(restored.item(roomId, parent.uid).depth, .75); assert.equal(JSON.stringify(restored.G.state.house.rooms[roomId].items.map(item => ({ uid: item.uid, x: item.x, y: item.y, parent: item.parent }))), JSON.stringify(before)); assert.equal(Object.hasOwn(restored.item(roomId, child.uid), 'depth'), false);
});
test('存档拒绝错误深度类型、超范围值与非落地家具伪造深度，原进度不变', () => {
  const { G, room, parse } = sandbox(), roomId = room(), parent = G.sys.decorating.place('nightstand_basic', roomId, 200, 0), child = G.sys.decorating.place('desk_lamp_basic', roomId, 205, 125, parent.uid), snapshot = JSON.stringify(G.state);
  for (const depth of [-1, 2, '0.75', null, {}, []]) { const bad = JSON.parse(snapshot); bad.house.rooms[roomId].items.find(item => item.uid === parent.uid).depth = depth; assert.throws(() => G.store.replace(parse(bad))); assert.equal(JSON.stringify(G.state), snapshot); }
  const forged = JSON.parse(snapshot); forged.house.rooms[roomId].items.find(item => item.uid === child.uid).depth = .75; assert.throws(() => G.store.replace(parse(forged))); assert.equal(JSON.stringify(G.state), snapshot);
});
test('深度移动可撤销，撤销恢复父件深度与子物位置，JSON 重载保留最终值', () => {
  const { G, room, item } = sandbox(), roomId = room(), parent = G.sys.decorating.place('nightstand_basic', roomId, 100, 0, null, .2), child = G.sys.decorating.place('desk_lamp_basic', roomId, 105, 125, parent.uid); const beforeX = item(roomId, child.uid).x; G.sys.decorating.move(roomId, parent.uid, roomId, 170, 0, null, .8); assert.ok(G.sys.decorating.undo().ok); assert.equal(item(roomId, parent.uid).depth, .2); assert.equal(item(roomId, child.uid).x, beforeX); const restored = sandbox(JSON.parse(JSON.stringify(G.state))); assert.equal(restored.item(roomId, parent.uid).depth, .2);
});
console.log('\n' + passed + ' 组房间深度检查通过。');
