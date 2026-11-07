'use strict';
// 五件新成品真实注册与共用绘图入口；只定义串行规则检查，不创建服务或浏览器。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ console }); context.window = context;
const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/yard.js'].forEach(run);
const G = context.Game, previous = plain(G.data.furniture), before = new Set(previous.map(def => def.id));
run('js/data/crafting.js'); run('js/render/crafting.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
class Context {
  constructor() { this.depth = 0; this.stack = []; this.calls = []; this.globalAlpha = 1; }
  save() { this.depth++; this.stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha }); }
  restore() { this.depth--; assert.ok(this.depth >= 0); Object.assign(this, this.stack.pop()); }
  measureText(text) { return { width: String(text).length * 10 }; }
}
for (const method of ['beginPath','closePath','ellipse','roundRect','fill','stroke','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','translate','rotate','scale','setTransform','clearRect','fillRect','fillText','strokeText','drawImage','setLineDash','rect','clip']) Context.prototype[method] = function (...args) { for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), method + ': ' + arg); this.calls.push([method, args, this.fillStyle, this.strokeStyle]); };
test('五配方稳定唯一，真实材料数量与房间开放条件对应原需求', () => {
  const recipes = G.data.craftingRecipes; assert.equal(recipes.length, 5); assert.equal(new Set(recipes.map(r => r.id)).size, 5);
  const expected = [['tulip_vase','tulip',3,'craft_tulip_vase',6,null],['pumpkin_lantern','pumpkin',2,'craft_pumpkin_lantern',6,null],['sakura_tree','sakura',1,'craft_sakura_tree',11,null],['strawberry_deluxe','strawberry',2,'cake_strawberry_deluxe',21,'workshop'],['blueberry_deluxe','blueberry',2,'cake_blueberry_deluxe',21,'workshop']];
  assert.deepEqual(plain(recipes.map(r => [r.id,r.cropId,r.cropCount,r.itemId,r.unlockLv,r.requireRoom])), expected);
  for (const recipe of recipes) { assert.equal(G.data.craftingRecipeById[recipe.id], recipe); assert.ok(G.data.cropById[recipe.cropId]); assert.ok(G.data.furnitureById[recipe.itemId]); assert.ok(recipe.name && recipe.description); }
  assert.equal(G.data.rooms.find(r => r.id === 'workshop').unlockLv, 21); assert.equal(G.data.yardConfig.unlockLv, 11);
});
test('仅追加五件实际家具，原402件定义与引用完整保留，ID和名称不混淆节日', () => {
  assert.equal(previous.length, 402); assert.equal(G.data.furniture.length, 407); assert.equal(new Set(G.data.furniture.map(d => d.id)).size, 407);
  for (const old of previous) assert.deepEqual(plain(G.data.furnitureById[old.id]), old);
  assert.equal(G.data.craftedFurniture.length, 5); assert.equal(G.data.furnitureById.craft_pumpkin_lantern.name, '手作南瓜灯');
  const oldPumpkin = previous.find(def => def.name === '微笑南瓜灯'); assert.ok(oldPumpkin); assert.notEqual(G.data.furnitureById.craft_pumpkin_lantern.name, oldPumpkin.name);
  for (const def of G.data.craftedFurniture) { assert.equal(before.has(def.id), false); assert.equal(G.data.furnitureById[def.id], def); assert.match(def.id, /^[a-z][a-z0-9_]+$/); }
});
test('成品真实放置类别与食物元数据安全，樱花树进入庭院背包而蛋糕可桌面摆放', () => {
  const D = G.data;
  for (const def of D.craftedFurniture) { assert.ok(def.w > 0 && def.w <= 320 && def.h > 0 && def.h <= 180); assert.ok(['floor','table','yard'].includes(def.place)); assert.equal(def.surface, null); assert.equal(def.recolor, false); assert.ok(def.tags.includes('crafting') && def.tags.includes('crafted')); assert.ok(D.themes[def.theme]); }
  const tree = D.furnitureById.craft_sakura_tree; assert.equal(tree.place,'yard'); assert.equal(tree.unlockLv,11); assert.equal(D.yardFurniture.filter(d => d.id === tree.id).length,1); assert.equal(D.yardFurniture.at(-1),tree);
  assert.equal(D.furnitureById.craft_tulip_vase.place,'table'); assert.equal(D.furnitureById.craft_pumpkin_lantern.place,'floor'); assert.ok(D.furnitureById.craft_pumpkin_lantern.tags.includes('light'));
  for (const cropId of ['strawberry','blueberry']) { const def = D.furnitureById['cake_' + cropId + '_deluxe']; assert.equal(def.place,'table'); assert.equal(def.giftCrop,cropId); assert.ok(def.tags.includes('food') && def.tags.includes('cake')); }
  assert.ok(D.craftedFurniture.filter(d=>!d.tags.includes('food')).every(d=>!d.giftCrop));
});
test('五件加工专属不会进入普通购买、礼盒随机池或九主题套装', () => {
  for (const def of G.data.craftedFurniture) { assert.equal(def.source,'crafting'); assert.equal(def.rewardOnly,true); assert.equal(def.currency,'none'); assert.equal(def.price,0); assert.equal(def.festivalId,undefined); assert.equal(G.data.furnitureTemplateById[def.template],undefined); }
});
test('五件成品均独立手绘且画布状态平衡，翻转共用标准家具变换', () => {
  const signatures = new Set();
  for (const def of G.data.craftedFurniture) {
    const c = new Context(), item = { flip:true }; assert.equal(G.draw.crafting(c,def,12,23,item),true); assert.equal(c.depth,0); assert.equal(c.stack.length,0); assert.equal(c.globalAlpha,1); assert.ok(c.calls.some(call=>call[0]==='fill')); assert.ok(c.calls.some(call=>call[0]==='scale' && call[1][0]===-1)); signatures.add(JSON.stringify(c.calls));
    assert.deepEqual(item,{flip:true});
  }
  assert.equal(signatures.size,5);
});
test('常规家具继续走原绘图，失败绘制也释放所有临时变换而不修改内容', () => {
  const c = new Context(); assert.equal(G.draw.crafting(c,G.data.furnitureById.bed_basic,0,0,{}),false); assert.equal(c.calls.length,0); assert.equal(G.draw.crafting(c,null,0,0),false);
  const def = G.data.furnitureById.craft_tulip_vase, old = JSON.stringify(def), broken = new Context(); broken.rotate = () => { throw new Error('画布故障'); };
  assert.throws(()=>G.draw.crafting(broken,def,0,0,{}),/画布故障/); assert.equal(broken.depth,0); assert.equal(broken.stack.length,0); assert.equal(JSON.stringify(def),old);
});
test('真实scene缩略图入口绘制五成品，尺寸/状态有限且没有占位文字', () => {
  ['js/render/room-space.js','js/render/room-shell.js','js/render/scene.js'].forEach(run);
  for (const def of G.data.craftedFurniture) {
    const c = new Context(), canvas = { width:144,height:116,getBoundingClientRect:()=>({width:144,height:116}),getContext:()=>c };
    assert.doesNotThrow(()=>G.render.drawThumbnail(canvas,def.id)); assert.equal(c.depth,0); assert.equal(c.stack.length,0); assert.ok(c.calls.some(call=>call[0]==='fill')); assert.ok(!c.calls.some(call=>call[0]==='fillText'));
  }
});
console.log('\n' + passed + ' 组加工成品内容与绘图检查通过。');
