'use strict';
// 旧内容目录与真实建筑米制映射回归；交由主线程串行执行，不启动浏览器或服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console }); context.window = context;
const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js'].forEach(run);
const G = context.Game, legacy = JSON.parse(JSON.stringify(G.data.furniture));
run('js/data/furniture-expansion.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8'));
assert.ok(manifest.includes('js/building/schema.js'), '实际清单必须包含建筑schema');
run('js/building/schema.js');
const dimensions = definition => context.CottageBuilding.furnitureDimensions(definition);
const plain = value => JSON.parse(JSON.stringify(value));
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
test('原13种房型的等级价格与家具要求数据保留，不混入阁楼种类', () => {
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
// 原脚本后三组依赖退役scene与Canvas模拟，不能作为当前3D场景或视觉还原验收。
// 原商店缩略图由catalog-art公开入口绘制，另需实际浏览器逐类核对；本脚本只验证内容与米制规则。
test('38模板九主题使用同一真实米制映射，尺寸不随旧缩略图像素变化', () => {
  for (const template of G.data.furnitureTemplates) {
    const expected = dimensions(G.data.furnitureById[template.id + '_basic']);
    for (const theme of Object.keys(G.data.themes)) {
      const definition = G.data.furnitureById[template.id + '_' + theme];
      assert.deepEqual(plain(dimensions(definition)), plain(expected), definition.id);
      const resized = Object.assign({}, definition, { w: 1, h: 10000 });
      assert.deepEqual(plain(dimensions(resized)), plain(expected), '米制尺寸不得反推旧缩略图像素：' + definition.id);
    }
  }
  assert.deepEqual(plain(dimensions(G.data.furnitureById.bed_basic)), { width: 1.45, height: .72, depth: 2.05 });
  assert.deepEqual(plain(dimensions(G.data.furnitureById.dining_table_basic)), { width: 1.4, height: .76, depth: .85 });
  assert.deepEqual(plain(dimensions(G.data.furnitureById.desk_lamp_basic)), { width: .25, height: .42, depth: .25 });
});
test('所有原内容和22件奖励均有有限正数米制尺寸，查询不改内容目录', () => {
  const before = JSON.stringify(G.data.furniture);
  for (const definition of G.data.furniture) {
    const result = dimensions(definition);
    for (const key of ['width', 'height', 'depth']) assert.ok(Number.isFinite(result[key]) && result[key] >= .01 && result[key] <= 30, definition.id + '.' + key);
  }
  assert.equal(JSON.stringify(G.data.furniture), before);
  for (const definition of G.data.residentFurniture) assert.deepEqual(plain(dimensions(definition)), { width: .55, height: .6, depth: .5 });
  for (const definition of G.data.achievementFurniture) assert.deepEqual(plain(dimensions(definition)), { width: .6, height: .8, depth: .5 });
});
test('自定义画框、庭院物件与显式尺寸各自保留真实尺度且返回独立副本', () => {
  assert.deepEqual(plain(dimensions({ id: 'custom_art_frame', template: 'custom_art' })), { width: .8, height: .8, depth: .045 });
  assert.deepEqual(plain(dimensions({ id: 'yard_bench', template: 'yard', motif: 'bench' })), { width: 1.4, height: .9, depth: .55 });
  assert.deepEqual(plain(dimensions({ id: 'yard_tree', template: 'yard', motif: 'tree' })), { width: 1.1, height: 2.4, depth: 1.1 });
  const definition = { id: 'custom', template: 'bed', dimensions: { width: 2, height: 1, depth: 3 } }, before = JSON.stringify(definition);
  const result = dimensions(definition); result.width = 30;
  assert.deepEqual(plain(dimensions(definition)), { width: 2, height: 1, depth: 3 });
  assert.equal(JSON.stringify(definition), before);
  const known = dimensions(G.data.furnitureById.bed_basic); known.width = 30;
  assert.equal(dimensions(G.data.furnitureById.bed_basic).width, 1.45);
});
console.log('\n' + passed + ' 组家具扩充数据/米制映射检查通过（不涵盖浏览器缩略图、3D外观或像素还原）。');
