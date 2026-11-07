'use strict';
// 衣橱真实规则、严格存档与代码绘图测试，不替代浏览器视觉验收。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox() {
  const context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/avatar.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game; G.store.init(); G.sys.init();
  const parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.render = { preservedMarker: true }; vm.runInContext(fs.readFileSync(path.join(root, 'js/render/avatar.js'), 'utf8'), context);
  return { G, context, parse };
}
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('4肤色/10发型/12发色/6表情及60件分组服装数量准确且定义不同', () => {
  const { G } = sandbox(), D = G.data;
  assert.equal(D.avatarSkins.length, 4); assert.equal(D.avatarHairStyles.length, 10); assert.equal(D.avatarHairColors.length, 12); assert.equal(D.avatarFaces.length, 6); assert.equal(D.outfits.length, 60);
  for (const [category, count] of [['top', 12], ['bottom', 10], ['dress', 14], ['shoes', 8], ['acc', 16]]) { const list = D.outfits.filter(item => item.category === category); assert.equal(list.length, count); assert.equal(new Set(list.map(item => item.shape + item.pattern + item.color + item.accent)).size, count); }
  assert.equal(new Set(D.outfits.map(item => item.id)).size, 60); assert.ok(D.outfits.every(item => Number.isInteger(item.price) && item.price >= 0 && Number.isInteger(item.unlockLv)));
});
test('旧空owned仅幂等补固定5件基础衣服，不修改传入对象或发货币', () => {
  const { G, parse } = sandbox(), original = parse(G.state.avatar); original.owned = {}; original.acc = 'bow_red'; const before = JSON.stringify(original), coin = G.state.wallet.coin;
  const migrated = G.data.validateAvatar(original), second = G.data.validateAvatar(migrated); assert.deepEqual(plain(migrated), plain(second)); assert.equal(JSON.stringify(original), before); assert.equal(G.state.wallet.coin, coin); assert.equal(Object.keys(migrated.owned).length, 5); assert.deepEqual(plain(migrated.acc), ['bow_red']);
});
test('未知字段、非法形象值/颜色、错误服装类别与未拥有穿着均被拒绝', () => {
  const { G, parse } = sandbox(), base = G.data.defaultAvatar();
  const invalid = [avatar => { avatar.skin = 4; }, avatar => { avatar.skin = '0'; }, avatar => { avatar.hair = 'fake'; }, avatar => { avatar.hairColor = '#123456'; }, avatar => { avatar.face = 'fake'; }, avatar => { avatar.foo = true; }, avatar => { avatar.dress = 'top_cloud'; }, avatar => { avatar.dress = 'dress_blue'; }, avatar => { avatar.owned.fake = true; }, avatar => { avatar.owned.bow_red = 1; }, avatar => { avatar.owned.bow_red = false; }];
  for (const mutate of invalid) { const avatar = parse(base); mutate(avatar); assert.throws(() => G.data.validateAvatar(avatar)); }
  const lower = parse(base); lower.hairColor = '#8b5a3c'; assert.equal(G.data.validateAvatar(lower).hairColor, '#8B5A3C');
});
test('配饰去重/slot互斥、裙与上下装互斥、方案名称/数量严格校验', () => {
  const { G, parse } = sandbox(), base = G.data.defaultAvatar();
  for (const mutate of [avatar => { avatar.acc = ['bow_red', 'bow_red']; }, avatar => { avatar.owned.acc_flower = true; avatar.acc = ['bow_red', 'acc_flower']; }, avatar => { avatar.top = 'top_cloud'; }, avatar => { avatar.dress = null; }, avatar => { avatar.outfits = [1]; }, avatar => { avatar.outfits = [null, null, null, null]; }, avatar => { avatar.outfits = [Object.assign({}, base, { name: '方案', owned: undefined, outfits: undefined })]; }]) { const avatar = parse(base); mutate(avatar); assert.throws(() => G.data.validateAvatar(avatar)); }
});
test('购买只扣一次、缺钱/锁定/未知ID不修改状态，正式购买后才能穿', () => {
  const { G } = sandbox(), sys = G.sys.avatar, coin = G.state.wallet.coin;
  assert.equal(sys.equip('top_berry').ok, false); assert.equal(sys.buy('acc_crown').ok, false); assert.equal(sys.buy('__proto__').ok, false); assert.equal(sys.equip('__proto__').ok, false); assert.equal(G.state.wallet.coin, coin);
  assert.equal(sys.buy('top_berry').ok, true); assert.equal(G.state.wallet.coin, coin - 40); assert.equal(sys.buy('top_berry').ok, false); assert.equal(G.state.wallet.coin, coin - 40); assert.equal(sys.equip('top_berry').ok, true);
  G.store.update(state => { state.wallet.coin = 0; }); const before = JSON.stringify(G.state); assert.equal(sys.buy('bottom_denim').ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('连衣裙与上下装切换始终有完整衣服，购买与试穿不触碰家具库存', () => {
  const { G } = sandbox(), sys = G.sys.avatar, inventory = JSON.stringify(G.state.inventory);
  assert.equal(sys.equip('top_cloud').ok, true); assert.equal(G.state.avatar.dress, null); assert.equal(G.state.avatar.bottom, 'bottom_cream'); assert.equal(sys.buy('bottom_denim').ok, true); assert.equal(sys.equip('bottom_denim').ok, true); assert.equal(G.state.avatar.bottom, 'bottom_denim');
  assert.equal(sys.equip('dress_pink').ok, true); assert.equal(G.state.avatar.top, null); assert.equal(G.state.avatar.bottom, null); assert.equal(G.state.avatar.dress, 'dress_pink'); assert.equal(JSON.stringify(G.state.inventory), inventory);
});
test('四类配饰可同时穿戴，同一slot替换且移除不会丢所有权', () => {
  const { G } = sandbox(), sys = G.sys.avatar; G.store.update(state => { state.level = 12; state.wallet.coin = 2000; });
  for (const id of ['acc_flower', 'acc_glasses', 'acc_wings', 'acc_bag']) { assert.equal(sys.buy(id).ok, true); assert.equal(sys.equip(id).ok, true); }
  assert.equal(G.state.avatar.acc.length, 4); assert.equal(G.state.avatar.acc.includes('bow_red'), false); assert.equal(sys.equip('bow_red').ok, true); assert.equal(G.state.avatar.acc.length, 4); assert.equal(G.state.avatar.acc.includes('acc_flower'), false);
  assert.equal(sys.removeAccessory('acc_glasses').ok, true); assert.equal(G.state.avatar.acc.includes('acc_glasses'), false); assert.equal(G.state.avatar.owned.acc_glasses, true); assert.equal(sys.removeAccessory('acc_glasses').ok, false);
});
test('形象选择只接受既有枚举、免费且不会改变服装所有权', () => {
  const { G } = sandbox(), sys = G.sys.avatar, before = G.state.wallet.coin;
  assert.equal(sys.setSkin(3).ok, true); assert.equal(sys.setHair('buns').ok, true); assert.equal(sys.setHairColor('#d998ae').ok, true); assert.equal(sys.setFace('wink').ok, true);
  assert.equal(G.state.avatar.skin, 3); assert.equal(G.state.avatar.hair, 'buns'); assert.equal(G.state.avatar.hairColor, '#D998AE'); assert.equal(G.state.avatar.face, 'wink'); assert.equal(G.state.wallet.coin, before);
  const snapshot = JSON.stringify(G.state); for (const result of [sys.setSkin(-1), sys.setHair('bad'), sys.setHairColor('red'), sys.setFace('bad')]) assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), snapshot);
});
test('三格方案保存/切换、空槽、覆盖和数组隔离正确', () => {
  const { G } = sandbox(), sys = G.sys.avatar;
  assert.equal(sys.saveOutfit(2, '  初见草莓  ').ok, true); assert.equal(G.state.avatar.outfits.length, 3); assert.equal(G.state.avatar.outfits[0], null); assert.equal(sys.applyOutfit(0).ok, false); assert.equal(sys.saveOutfit(3, '太多啦').ok, false); assert.equal(sys.saveOutfit(0, '').ok, false); assert.equal(sys.saveOutfit(0, '1234567890123').ok, false);
  assert.equal(sys.setHair('bob').ok, true); assert.equal(sys.removeAccessory('bow_red').ok, true); assert.equal(sys.saveOutfit(0, '云朵散步').ok, true); assert.equal(sys.applyOutfit(2).ok, true); assert.equal(G.state.avatar.hair, 'twin_tails'); assert.deepEqual(plain(G.state.avatar.acc), ['bow_red']);
  assert.equal(sys.removeAccessory('bow_red').ok, true); assert.deepEqual(plain(G.state.avatar.outfits[2].acc), ['bow_red']); assert.equal(sys.applyOutfit(0).ok, true); assert.equal(G.state.avatar.hair, 'bob'); assert.equal(G.state.avatar.acc.length, 0);
  assert.equal(sys.saveOutfit(2, '新的搭配').ok, true); assert.equal(G.state.avatar.outfits[2].name, '新的搭配');
});
test('存档JSON往返保持衣橱与方案，非法方案穿着不可凭空获得服装', () => {
  const { G, parse } = sandbox(), sys = G.sys.avatar; sys.buy('top_berry'); sys.equip('top_berry'); sys.saveOutfit(1, '草莓上衣'); const saved = plain(G.state.avatar); G.store.replace(parse(G.state)); assert.deepEqual(plain(G.state.avatar), saved);
  const invalid = parse(saved); invalid.outfits[1].top = 'top_coat'; assert.throws(() => G.data.validateAvatar(invalid));
});
class Context {
  constructor() { this.calls = []; this.depth = 0; }
  save() { this.depth++; }
  restore() { this.depth--; assert.ok(this.depth >= 0); }
}
for (const method of ['beginPath', 'ellipse', 'arc', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'closePath', 'translate', 'scale', 'rotate', 'setTransform', 'clearRect']) Context.prototype[method] = function (...args) { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value)); this.calls.push([method, args, this.fillStyle, this.strokeStyle]); };
test('所有60件服装可代码绘制、10种发型/6表情有不同绘图且左右镜像', () => {
  const { G } = sandbox(), base = G.data.defaultAvatar();
  for (const item of G.data.outfits) { const look = Object.assign({}, base, { acc: [] }); if (item.category === 'acc') look.acc = [item.id]; else if (item.category === 'dress') look.dress = item.id; else if (item.category === 'top' || item.category === 'bottom') { look.dress = null; look.top = 'top_cloud'; look.bottom = 'bottom_cream'; look[item.category] = item.id; } else look.shoes = item.id; const c = new Context(); G.draw.avatar(c, look, 100, 200, 1, { facing: -1, still: true }); assert.equal(c.depth, 0); assert.ok(c.calls.some(call => call[0] === 'scale' && call[1][0] === -1)); }
  for (const [list, field] of [[G.data.avatarHairStyles, 'hair'], [G.data.avatarFaces, 'face']]) { const signatures = new Set(); for (const item of list) { const c = new Context(); G.draw.avatar(c, Object.assign({}, base, { [field]: item.id }), 0, 0, 1, { still: true }); signatures.add(JSON.stringify(c.calls)); } assert.equal(signatures.size, list.length); }
});
test('缩略图按CSS尺寸与DPR绘制，并保留现有G.render接口', () => {
  const { G, context } = sandbox(), c = new Context(), canvas = { width: 1, height: 1, getBoundingClientRect: () => ({ width: 120, height: 180 }), getContext: () => c }; context.devicePixelRatio = 1.5;
  G.render.drawAvatar(canvas, G.data.defaultAvatar(), { facing: 1 }); assert.equal(canvas.width, 180); assert.equal(canvas.height, 270); assert.equal(c.depth, 0); assert.equal(G.render.preservedMarker, true);
});
test('applyBundle一次事务换整套，结果与逐件调用完全一致，只写一次存档、通知一次', () => {
  const specs = [
    { hair: 'twin_tails', hairColor: '#f4a6b8', face: 'smile', wear: ['dress_pink', 'shoes_mary', 'bow_red'] },
    { hair: 'ponytail', face: 'cheer', wear: ['top_cloud', 'shoes_sneaker', 'acc_star'] },
    { hair: 'curls', face: 'wink', wear: ['bottom_pants', 'shoes_boots', 'bow_red', 'acc_teddy'] },
    { hair: 'no_such_hair', hairColor: 'not-a-color', face: 'no_such_face', wear: ['none', 'no_such_item', 'shoes_mary'] }
  ];
  for (const spec of specs) {
    const a = sandbox(), b = sandbox();
    // 逐件：原来点胶囊时的做法
    if (spec.hair) a.G.sys.avatar.setHair(spec.hair); if (spec.hairColor) a.G.sys.avatar.setHairColor(spec.hairColor); if (spec.face) a.G.sys.avatar.setFace(spec.face);
    for (const id of spec.wear) { if (id && a.G.data.outfitById[id]) a.G.store.update(state => { const avatar = a.G.data.validateAvatar(state.avatar); if (!avatar.owned[id]) { avatar.owned[id] = true; state.avatar = a.G.data.validateAvatar(avatar); } }); a.G.sys.avatar.equip(id); }
    let stateChanges = 0, avatarChanges = 0, worn = 0; b.G.bus.on('state:change', () => stateChanges++); b.G.bus.on('avatar:changed', () => avatarChanges++); b.G.bus.on('avatar:worn', () => worn++);
    const coin = b.G.state.wallet.coin, result = b.G.sys.avatar.applyBundle(spec);
    assert.equal(result.ok, true); assert.deepEqual(plain(b.G.state.avatar), plain(a.G.state.avatar), '与逐件结果一致：' + JSON.stringify(spec)); assert.equal(b.G.state.wallet.coin, coin, '不扣钱');
    assert.equal(stateChanges, 1, '只写一次存档'); assert.equal(avatarChanges, 1, '只通知一次换装'); assert.ok(worn <= 1);
  }
  const { G } = sandbox(), before = JSON.stringify(G.state.avatar); G.sys.avatar.applyBundle({ hair: 'x', hairColor: 'x', face: 'x', wear: ['none', 'nope'] }); assert.equal(JSON.stringify(G.state.avatar), before, '全是无效项时不改形象');
});
console.log('\n' + passed + ' 组换装规则/绘图检查通过（未执行浏览器视觉验收）。');
