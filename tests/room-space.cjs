'use strict';
// 验证2.5D投影、抓点反变换、桌面继承与房间纹理。无需服务或浏览器。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox() {
  const context = vm.createContext({ console }); context.window = context;
  for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/render/room-space.js', 'js/render/room-shell.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context.Game;
}
function near(a, b, label) { assert.ok(Math.abs(a - b) < 1e-8, (label || '') + ': ' + a + ' != ' + b); }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
test('后沿/前沿/默认depth与比例严格对应契约，原floor y不参与推断', () => {
  const G = sandbox(), S = G.roomSpace, def = G.data.furnitureById.bed_basic;
  for (const depth of [0, .25, .75, 1]) { const item = { x: 70, y: 200 - def.h, depth }, p = S.item({}, item, def); near(p.scale, .76 + .24 * depth); near(p.footY, 142 + 68 * depth); near(p.footX, 160 + (70 + def.w / 2 - 160) * p.scale); near(p.x + p.w / 2, p.footX); near(p.y + p.h, p.footY); assert.deepEqual(S.item({}, Object.assign({}, item, { y: -1000 }), def), p); }
  const initial = S.item({}, { x: 70, y: 0 }, def); near(initial.depth, .75); near(initial.scale, .94); near(initial.footY, 193);
});
test('全部地面家具随机1200组抓点正/反变换，不跳点且返回兼容canonical y', () => {
  const G = sandbox(), S = G.roomSpace, random = rng(8), defs = G.data.furniture.filter(def => def.place === 'floor');
  for (let i = 0; i < 1200; i++) {
    const def = defs[i % defs.length], source = { x: random() * (320 - def.w), y: 200 - def.h, depth: random() }, original = S.item({}, source, def), grab = { u: random(), v: random() }, pointer = { x: original.x + original.w * grab.u, y: original.y + original.h * grab.v }, result = S.placement(def, pointer, grab), restored = S.item({}, result, def);
    near(result.x, source.x, 'canonical x'); near(result.depth, source.depth, 'depth'); near(result.y, source.y, 'canonical y'); near(restored.x + restored.w * grab.u, pointer.x, '抓点x'); near(restored.y + restored.h * grab.v, pointer.y, '抓点y');
  }
});
test('默认新摆放抓点为脚底中心，深度/横向越界被clamp', () => {
  const G = sandbox(), S = G.roomSpace, def = G.data.furnitureById.nightstand_basic, target = { x: 200, y: 180 }, place = S.placement(def, target), p = S.item({}, place, def); near(p.footX, target.x); near(p.footY, target.y);
  const nearFront = S.placement(def, { x: 9000, y: 9000 }); assert.equal(nearFront.depth, 1); assert.equal(nearFront.x, 320 - def.w);
  const back = S.placement(def, { x: -9000, y: -9000 }); assert.equal(back.depth, 0); assert.equal(back.x, 0); assert.equal(S.pointToDepth(142), 0); assert.equal(S.pointToDepth(210), 1); near(S.pointToDepth(193), .75);
});
test('桌面物继承父家具scale/depth，脚底恰在投影后的surface上', () => {
  const G = sandbox(), S = G.roomSpace, parentDef = G.data.furnitureById.nightstand_basic, childDef = G.data.furnitureById.desk_lamp_basic;
  for (const depth of [0, .35, .75, 1]) {
    const parent = { uid: 'parent', defId: parentDef.id, x: 110, y: 200 - parentDef.h, depth }, child = { uid: 'child', defId: childDef.id, x: 117, y: parent.y + parentDef.surface.y - childDef.h, parent: 'parent' }, room = { items: [parent, child] }, p = S.item(room, parent, parentDef), projected = S.item(room, child, childDef);
    near(projected.scale, p.scale); near(projected.depth, p.depth); near(projected.x, p.x + 7 * p.scale); near(projected.footY, p.y + parentDef.surface.y * p.scale);
    for (const grab of [{ u: .5, v: 1 }, { u: .12, v: .23 }]) { const pointer = { x: projected.x + projected.w * grab.u, y: projected.y + projected.h * grab.v }, result = S.tablePlacement(room, parent, childDef, pointer, grab); near(result.x, child.x); near(result.y, child.y); assert.equal('depth' in result, false); }
  }
});
test('壁挂搁板子物、墙面/吊顶及无父桌面物保持原坐标scale1', () => {
  const G = sandbox(), S = G.roomSpace, parentDef = G.data.furnitureById.wall_shelf_basic, childDef = G.data.furnitureById.vase_basic, parent = { uid: 'shelf', defId: parentDef.id, x: 100, y: 70 }, child = { uid: 'vase', defId: childDef.id, x: 110, y: 35, parent: 'shelf' };
  const p = S.item({ items: [parent, child] }, child, childDef); near(p.scale, 1); near(p.x, child.x); near(p.y, child.y);
  for (const id of ['window_basic', 'ceiling_lamp_basic', 'vase_basic']) { const def = G.data.furnitureById[id], source = { x: 70, y: 35 }, projected = S.item({}, source, def); near(projected.x, 70); near(projected.y, 35); near(projected.scale, 1); const place = S.placement(def, { x: 120, y: 75 }); assert.equal('depth' in place, false); if (def.place === 'ceiling') assert.equal(place.y, 14); }
});
test('渲染矩形与统一hit-test/归一化grab完全一致，深度排序单调', () => {
  const G = sandbox(), S = G.roomSpace, def = G.data.furnitureById.sofa_basic; let previous = -1;
  for (let index = 0; index <= 20; index++) {
    const projected = S.item({}, { x: 20, y: 140, depth: index / 20 }, def), center = { x: projected.x + projected.w * .3, y: projected.y + projected.h * .4 };
    assert.equal(S.contains(projected, center), true); assert.equal(S.contains(projected, { x: projected.x - .1, y: projected.y }), false); assert.equal(S.contains(projected, { x: projected.x - .1, y: projected.y }, 1), true); near(S.grab(projected, center).u, .3); near(S.grab(projected, center).v, .4); assert.ok(projected.footY > previous); previous = projected.footY;
  }
});
test('异常父链/缺失父件有限终止，helper不修改room/items/def', () => {
  const G = sandbox(), S = G.roomSpace, def = G.data.furnitureById.vase_basic, room = { items: [{ uid: 'a', defId: def.id, x: 10, y: 20, parent: 'b' }, { uid: 'b', defId: def.id, x: 12, y: 21, parent: 'a' }] }, before = JSON.stringify(room), projected = S.item(room, room.items[0], def);
  assert.ok(Object.values(projected).every(Number.isFinite)); assert.equal(JSON.stringify(room), before); assert.ok(Object.values(S.item({}, { x: 4, y: 5, parent: 'missing' }, def)).every(Number.isFinite));
});
class Context {
  constructor() { this.depth = 0; this.calls = []; this.globalAlpha = 1; }
  save() { this.depth++; }
  restore() { this.depth--; assert.ok(this.depth >= 0); }
  createLinearGradient(...args) { assert.ok(args.every(Number.isFinite)); return { addColorStop(offset, color) { assert.ok(offset >= 0 && offset <= 1); assert.equal(typeof color, 'string'); } }; }
}
for (const method of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'clip', 'fillRect', 'ellipse', 'arc', 'bezierCurveTo', 'quadraticCurveTo', 'translate', 'scale']) Context.prototype[method] = function (...args) { for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg)); this.calls.push([method, args, typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient', this.strokeStyle]); };
test('全部墙纸/地板绘制有限坐标且纹理有实际差异，clip与状态配对', () => {
  const G = sandbox(), wallSigns = new Set(), floorSigns = new Set();
  for (const pattern of G.data.balance.wallpaperPatterns) { const c = new Context(); G.roomShell.draw(c, { wallpaper: { pattern, color: '#F2DDE7', color2: '#FFFFFF' }, floor: { pattern: 'wood', color: '#E8C39E' } }); assert.equal(c.depth, 0); assert.ok(c.calls.some(call => call[0] === 'clip')); wallSigns.add(JSON.stringify(c.calls)); }
  for (const pattern of G.data.balance.floorPatterns) { const c = new Context(); G.roomShell.draw(c, { wallpaper: { pattern: 'solid', color: '#F2DDE7' }, floor: { pattern, color: '#D6CCBB' } }); assert.equal(c.depth, 0); floorSigns.add(JSON.stringify(c.calls)); }
  assert.equal(wallSigns.size, G.data.balance.wallpaperPatterns.length); assert.equal(floorSigns.size, G.data.balance.floorPatterns.length);
});
test('地板纹理随深度收束，房间壳与投影后沿精确对齐且不触碰渲染器', () => {
  const G = sandbox(), c = new Context(), backLeft = G.roomShell.plane(0, 0), backRight = G.roomShell.plane(320, 0), frontLeft = G.roomShell.plane(0, 1), frontRight = G.roomShell.plane(320, 1), info = G.roomShell.draw(c, {});
  near(backLeft.x, G.roomSpace.foot(0, 0).x); near(backRight.x, G.roomSpace.foot(320, 0).x); near(backRight.x - backLeft.x, 320 * .76); near(frontRight.x - frontLeft.x, 320); near(frontLeft.y, 212); near(info.backWall.x, backLeft.x); assert.equal(G.render, undefined);
});
console.log('\n' + passed + ' 组2.5D几何/房间壳检查通过（未启动服务或浏览器）。');
