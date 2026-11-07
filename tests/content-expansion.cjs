'use strict';
// 数据与独立绘图回归，交由主线程串行执行；不需要浏览器或服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console }); context.window = context;
const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js'].forEach(run);
const G = context.Game, legacy = JSON.parse(JSON.stringify(G.data.furniture));
run('js/data/furniture-expansion.js'); run('js/render/furniture-extra.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('原43件旧ID、尺寸、价格、等级与台面完全保留', () => {
  assert.equal(legacy.length, 43);
  for (const before of legacy) assert.deepEqual(JSON.parse(JSON.stringify(G.data.furnitureById[before.id])), before);
});
test('9主题×38实际模板提供342常规家具，另含12居民专属和10成就', () => {
  const D = G.data; assert.equal(D.furnitureTemplates.length, 38); assert.equal(Object.keys(D.themes).length, 9); assert.equal(D.furniture.length, 364);
  for (const theme of Object.keys(D.themes)) { const regular = D.furniture.filter(def => def.theme === theme && !def.rewardOnly); assert.equal(regular.length, 38); for (const template of D.furnitureTemplates) assert.ok(D.furnitureById[template.id + '_' + theme]); }
  assert.equal(D.residentFurniture.length, 12); assert.equal(D.achievementFurniture.length, 10);
});
test('ID唯一、ById引用同一对象，合法尺寸/售价/放置与语义tag', () => {
  const D = G.data; assert.equal(new Set(D.furniture.map(def => def.id)).size, D.furniture.length);
  for (const def of D.furniture) { assert.equal(D.furnitureById[def.id], def); assert.match(def.id, /^[a-z][a-z0-9_]+$/); assert.ok(def.w > 0 && def.w <= 320 && def.h > 0 && def.h <= 180); assert.ok(Number.isInteger(def.price) && def.price >= 0); assert.ok(['floor', 'wall', 'ceiling', 'table'].includes(def.place)); assert.ok(def.tags.includes(def.template)); assert.ok(D.themes[def.theme]); }
});
test('主题解锁与价格系数按进度递增，新条目均受主题门槛约束', () => {
  const D = G.data, levels = { basic: 1, strawberry: 1, forest: 6, garden: 8, ocean: 11, cloud: 13, oriental: 16, starry: 18, princess: 22 };
  for (const [id, level] of Object.entries(levels)) assert.equal(D.themes[id].unlockLv, level);
  for (const def of D.furniture.filter(def => def.expanded)) { assert.ok(def.unlockLv >= D.themes[def.theme].unlockLv); assert.equal(def.currency, 'coin'); assert.equal(def.source, 'shop'); assert.equal(def.rewardOnly, false); assert.ok(['common', 'fine', 'rare'].includes(def.rarity)); }
  assert.ok(D.furnitureById.bed_princess.price > D.furnitureById.bed_garden.price); assert.ok(D.furnitureById.bed_garden.price >= D.furnitureById.bed_basic.price);
});
test('台面宽高边界有效，梳妆台/洗手台/钢琴台面匹配实际绘制高度', () => {
  const D = G.data;
  for (const def of D.furniture) if (def.surface) { assert.ok(def.surface.y >= 0 && def.surface.y <= def.h); assert.ok(def.surface.x0 >= 0 && def.surface.x1 <= def.w && def.surface.x0 < def.surface.x1); }
  assert.equal(D.furnitureById.vanity_basic.surface.y, 43); assert.equal(D.furnitureById.sink_basic.surface.y, 25); assert.equal(D.furnitureById.piano_basic.surface.y, 37);
  for (const template of ['nightstand', 'coffee_table', 'bookshelf', 'dining_table', 'stove', 'counter', 'vanity', 'sink', 'piano', 'toy_box', 'wall_shelf']) assert.ok(D.furnitureById[template + '_princess'].surface);
});
test('新房间按既有等级价格可建且不新增阁楼前提', () => {
  const D = G.data;
  for (const [id, level, price] of [['study', 10, 400], ['music', 13, 500], ['game', 18, 600], ['pet', 19, 600], ['workshop', 21, 800]]) { const room = D.rooms.find(value => value.id === id); assert.ok(room); assert.equal(room.unlockLv, level); assert.equal(room.price, price); assert.ok(room.required.every(tag => D.furnitureTemplates.some(template => template.id === tag))); }
  assert.equal(D.rooms.length, 13); assert.equal(D.rooms.some(room => room.id === 'observatory' || room.id === 'attic'), false);
});
test('专属ID与奖励来源固定，商店不能按普通货币直接购买', () => {
  const D = G.data;
  for (const id of ['lily', 'pudding', 'orange', 'mianmian', 'bobo', 'xingxing', 'lizi', 'yuanyuan', 'mimi', 'doudou', 'shirley', 'rainbow']) { const def = D.furnitureById['resident_' + id + '_gift']; assert.ok(def); assert.equal(def.source, 'friendship'); assert.equal(def.residentId, id); assert.equal(D.residentGiftById[id], def.id); }
  for (const def of D.residentFurniture.concat(D.achievementFurniture)) { assert.equal(def.currency, 'none'); assert.equal(def.price, 0); assert.equal(def.rewardOnly, true); assert.equal(def.rarity, 'limited'); }
  for (const id of ['builder', 'collector', 'friend', 'baker', 'gardener', 'gamer', 'fashion', 'photographer', 'rainbow', 'home_master']) assert.equal(D.achievementGiftById[id], 'achievement_' + id);
});
class Context {
  constructor() { this.calls = []; this.depth = 0; this.stack = []; this.globalAlpha = 1; }
  save() { this.depth++; this.stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha, lineWidth: this.lineWidth }); }
  restore() { this.depth--; assert.ok(this.depth >= 0); Object.assign(this, this.stack.pop()); }
  measureText(text) { return { width: String(text).length * 8 }; }
  gradient(...args) { args.forEach(value => assert.ok(Number.isFinite(value))); return { addColorStop(offset, color) { assert.ok(Number.isFinite(offset) && offset >= 0 && offset <= 1); assert.equal(typeof color, 'string'); } }; }
  createLinearGradient(...args) { return this.gradient(...args); }
  createRadialGradient(...args) { return this.gradient(...args); }
}
for (const name of ['beginPath', 'ellipse', 'roundRect', 'fill', 'stroke', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'rect', 'clip', 'translate', 'rotate', 'scale', 'setTransform', 'clearRect', 'fillRect', 'fillText', 'strokeText', 'drawImage', 'setLineDash']) Context.prototype[name] = function (...args) { args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value)); }); this.calls.push([name, args, this.fillStyle, this.strokeStyle]); };
test('22件奖励家具各有实际轮廓，镜像绘制无非法坐标且状态平衡', () => {
  const D = G.data, signatures = new Set();
  for (const def of D.residentFurniture.concat(D.achievementFurniture)) { const c = new Context(); assert.equal(G.draw.furnitureExtra(c, def, 10, 20, { flip: true }), true); assert.equal(c.depth, 0); assert.ok(c.calls.some(call => call[0] === 'scale' && call[1][0] === -1)); signatures.add(JSON.stringify(c.calls)); }
  assert.equal(signatures.size, 22);
});
test('新主题窗户有配色和主题装饰，常规模板继续交给scene绘制', () => {
  const D = G.data, signatures = new Set();
  for (const theme of ['forest', 'garden', 'ocean', 'cloud', 'oriental', 'starry', 'princess']) { const c = new Context(); assert.equal(G.draw.furnitureExtra(c, D.furnitureById['window_' + theme], 0, 0, {}), true); assert.equal(c.depth, 0); signatures.add(JSON.stringify(c.calls)); }
  assert.equal(signatures.size, 7); const c = new Context(); assert.equal(G.draw.furnitureExtra(c, D.furnitureById.bed_basic, 0, 0, {}), false); assert.equal(c.calls.length, 0);
});
test('真实scene.drawThumbnail入口绘制全部402件，38常规模板逐分支调用且画布状态平衡', () => {
  // 使用实际脚本和公开入口，不替换drawFurniture，也不启动scene的事件/动画循环。
  ['js/data/calendar.js', 'js/data/yard.js', 'js/render/room-space.js', 'js/render/room-shell.js', 'js/render/festival.js', 'js/render/yard.js', 'js/render/scene.js'].forEach(run);
  const D = G.data, sceneSource = fs.readFileSync(path.join(root, 'js/render/scene.js'), 'utf8'), templateCounts = new Map(), basicSignatures = new Set();
  assert.equal(D.furniture.length, 402); assert.equal(typeof G.render.drawThumbnail, 'function');
  for (const def of D.furniture) {
    const c = new Context(), canvas = { width: 144, height: 116, getBoundingClientRect: () => ({ width: 144, height: 116 }), getContext(type) { assert.equal(type, '2d'); return c; } };
    assert.doesNotThrow(() => G.render.drawThumbnail(canvas, def.id), '公开缩略图绘制失败：' + def.id);
    assert.equal(c.depth, 0, 'save/restore失衡：' + def.id); assert.equal(c.stack.length, 0); assert.equal(c.globalAlpha, 1, '透明度未恢复：' + def.id);
    assert.ok(c.calls.some(call => call[0] === 'setTransform'), '未设置缩略图变换：' + def.id);
    assert.ok(c.calls.some(call => call[0] === 'fill' || call[0] === 'stroke' || call[0] === 'fillText'), '只有清屏、没有实际内容：' + def.id);
    assert.ok(c.calls.filter(call => ['moveTo', 'arc', 'arcTo', 'ellipse', 'roundRect', 'bezierCurveTo', 'quadraticCurveTo'].includes(call[0])).length >= 2, '缺少轮廓绘制：' + def.id);
    if (D.furnitureTemplateById[def.template] && !def.rewardOnly) {
      templateCounts.set(def.template, (templateCounts.get(def.template) || 0) + 1);
      if (def.theme === 'basic') basicSignatures.add(JSON.stringify(c.calls));
    }
  }
  assert.equal(templateCounts.size, 38); assert.equal(basicSignatures.size, 38);
  for (const template of D.furnitureTemplates) {
    assert.equal(templateCounts.get(template.id), 9, '没有覆盖九主题：' + template.id);
    assert.match(sceneSource, new RegExp("case\\s+['\"]" + template.id + "['\"]\\s*:"), '必须有真实模板分支，不能依赖默认箱体：' + template.id);
  }
});
console.log('\n' + passed + ' 组家具扩充数据/绘图检查通过（Canvas模拟，不替代浏览器验收）。');
