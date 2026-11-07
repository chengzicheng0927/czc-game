'use strict';
// 真实角色元数据与Geometry的纯CPU检查；不创建Canvas/GL/DOM，不代表整页或像素验收。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, run) => tests.push([name, run]);
const plain = value => JSON.parse(JSON.stringify(value));
function setup() {
  const fail = name => () => { throw new Error('纯CPU舞台不得调用' + name); };
  const context = vm.createContext({ console, Game: { data: {}, runtime: {}, sys: {}, store: new Proxy({}, { get: (_, name) => fail('store.' + String(name)) }) } }); context.window = context;
  for (const name of ['document', 'localStorage', 'OffscreenCanvas', 'Image']) Object.defineProperty(context, name, { get: fail(name), configurable: true });
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval', 'fetch', 'addEventListener']) context[name] = fail(name);
  Object.defineProperty(context.Game, 'state', { get: fail('隐式Game.state'), configurable: true });
  for (const file of ['js/data/balance.js', 'js/data/content.js', 'js/data/residents-expansion.js', 'js/data/outfits.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/page-stages3d.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context.Game;
}
function state(G) {
  return { avatar: plain(G.data.defaultAvatar()), residents: Object.fromEntries(G.data.residents.map(def => [def.id, { movedIn: false, affection: 0 }])), house: { name: '合成舞台样本', floors: [], rooms: {} }, wallet: { coin: 25, heart: 0 } };
}
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function extents(geometry, start = 0, end = geometry.data.length) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  assert.ok(end > start, '实际几何必须含顶点'); assert.equal((end - start) % 27, 0, '完整三角面');
  for (let i = start; i < end; i++) {
    const value = geometry.data[i]; assert.ok(Number.isFinite(value), '位置、法线和颜色均为有限数');
    if (i % 9 >= 6) assert.ok(value >= 0 && value <= 1, '顶点颜色在0—1范围');
  }
  for (let i = start; i < end; i += 9) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], geometry.data[i + axis]); max[axis] = Math.max(max[axis], geometry.data[i + axis]); }
  return { min, max };
}
function within(actual, expected) {
  assert.equal(expected.min.length, 3); assert.equal(expected.max.length, 3);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Number.isFinite(expected.min[axis]) && Number.isFinite(expected.max[axis])); assert.ok(expected.max[axis] > expected.min[axis]);
    assert.ok(actual.min[axis] >= expected.min[axis] - 1e-8, 'bounds完整包住轴' + axis + '下沿：' + actual.min[axis]);
    assert.ok(actual.max[axis] <= expected.max[axis] + 1e-8, 'bounds完整包住轴' + axis + '上沿：' + actual.max[axis]);
  }
}
function build(G, descriptor) {
  const geometry = new G.world3dMath.Geometry(), characters = [];
  assert.equal(descriptor.build(geometry, { character(target, avatar, position, scale, resident) {
    const start = target.data.length, result = G.world3dModels.character(target, avatar, position, scale, resident);
    characters.push({ avatar: plain(avatar), resident: plain(resident || null), position: plain(position), scale, bounds: extents(target, start) }); return result;
  } }), true);
  const bounds = extents(geometry); within(bounds, descriptor.bounds);
  descriptor.focus.forEach((value, axis) => assert.ok(Number.isFinite(value) && value >= descriptor.bounds.min[axis] && value <= descriptor.bounds.max[axis], 'focus在舞台内'));
  return { geometry, characters, bounds };
}
function signature(geometry) { return crypto.createHash('sha256').update(Buffer.from(new Float64Array(geometry.data).buffer)).digest('hex'); }

test('仅衣橱和所选真实居民返回描述，未选/未知居民和其它功能保持原场景', () => {
  const G = setup(), s = state(G), describe = G.pageStages3D.describe;
  assert.equal(describe(), null); assert.equal(describe({ surface: 'avatar' }), null); assert.equal(describe({ state: {}, surface: 'avatar' }), null);
  for (const surface of ['home', 'houseDesign', 'exterior', 'garden', 'crafting', 'wardrobe', 'photo', 'creative', 'observatory']) assert.equal(describe({ state: s, surface, residentId: 'lily' }), null);
  for (const residentId of [undefined, null, '', 'missing', '__proto__']) assert.equal(describe({ state: s, surface: 'residents', residentId }), null);
  for (const surface of ['avatar', 'residents']) { const descriptor = describe({ state: s, surface, residentId: 'lily' }); assert.equal(descriptor.id, surface); assert.equal(typeof descriptor.key, 'string'); assert.ok(descriptor.key.length); assert.equal(typeof descriptor.build, 'function'); }
});
test('衣橱使用当前真实外观而非预设样本，包含完整人体和陈设且不接触存档/浏览器', () => {
  const G = setup(), s = state(G); s.avatar = Object.assign(s.avatar, plain(G.data.avatarPresetLook('preset_pony')), { hairColor: '#B497CC', face: 'shy', acc: ['acc_bunny'] }); s.avatar.owned.acc_bunny = true; s.avatar = plain(G.data.validateAvatar(s.avatar));
  const before = JSON.stringify(s), metadata = JSON.stringify(G.data); freeze(s); freeze(G.data);
  const stage = G.pageStages3D.describe({ state: s, surface: 'avatar' }), result = build(G, stage); assert.equal(result.characters.length, 1);
  const actor = result.characters[0]; for (const key of ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc']) assert.deepEqual(actor.avatar[key], s.avatar[key]);
  assert.equal(actor.resident, null); assert.ok(actor.scale > 1.5, '中央人物比普通屋内角色大');
  assert.ok(actor.bounds.max[1] - actor.bounds.min[1] > (result.bounds.max[0] - result.bounds.min[0]) * .35, '人物保持展示主体比例');
  assert.ok(actor.bounds.min[1] >= .3 && actor.bounds.max[1] > 4, '脚接纸台，最高头饰完整');
  assert.equal(JSON.stringify(s), before); assert.equal(JSON.stringify(G.data), metadata);
});
test('十种真实发型与高头饰/背包/配饰的实际顶点全部落在声明bounds内', () => {
  const G = setup(), s = state(G);
  for (const hair of G.data.avatarHairStyles) { s.avatar.hair = hair.id; const result = build(G, G.pageStages3D.describe({ state: s, surface: 'avatar' })); assert.equal(result.characters.length, 1); within(result.characters[0].bounds, { min: [-2, .3, -1.5], max: [2, 5.25, 2] }); }
  for (const accessories of [['acc_bunny'], ['acc_crown'], ['acc_straw'], ['acc_beret'], ['acc_wings', 'acc_bag', 'acc_glasses', 'bow_red']]) {
    accessories.forEach(id => { assert.ok(G.data.outfitById[id], id); s.avatar.owned[id] = true; }); s.avatar.acc = accessories.slice(); s.avatar = plain(G.data.validateAvatar(s.avatar));
    const result = build(G, G.pageStages3D.describe({ state: s, surface: 'avatar' })); assert.deepEqual(result.characters[0].avatar.acc, accessories);
  }
});
test('八套真实预设和全部服饰均用实际角色Geometry校验头发、头饰与外缘', () => {
  const G = setup(), s = state(G); assert.equal(G.data.avatarPresets.length, 8); assert.ok(G.data.outfits.length >= 60);
  for (const preset of G.data.avatarPresets) {
    s.avatar = plain(G.data.validateAvatar(Object.assign(plain(G.data.defaultAvatar()), plain(G.data.avatarPresetLook(preset.id)))));
    const result = build(G, G.pageStages3D.describe({ state: s, surface: 'avatar' })); assert.equal(result.characters.length, 1);
    assert.equal(result.characters[0].avatar.hair, preset.hair); within(result.characters[0].bounds, G.pageStages3D.describe({ state: s, surface: 'avatar' }).bounds);
  }
  for (const outfit of G.data.outfits) {
    const avatar = plain(G.data.defaultAvatar()); avatar.owned[outfit.id] = true;
    if (outfit.category === 'dress') { avatar.dress = outfit.id; avatar.top = avatar.bottom = null; }
    else if (outfit.category === 'top' || outfit.category === 'bottom') { avatar.dress = null; avatar.top = G.data.avatarConfig.defaultTop; avatar.bottom = G.data.avatarConfig.defaultBottom; avatar[outfit.category] = outfit.id; }
    else if (outfit.category === 'shoes') avatar.shoes = outfit.id;
    else { avatar.acc = avatar.acc.filter(id => G.data.outfitById[id].slot !== outfit.slot); avatar.acc.push(outfit.id); }
    s.avatar = plain(G.data.validateAvatar(avatar)); const before = JSON.stringify(s);
    const stage = G.pageStages3D.describe({ state: s, surface: 'avatar' }), result = build(G, stage), actor = result.characters[0];
    assert.equal(result.characters.length, 1); within(actor.bounds, stage.bounds);
    if (outfit.category === 'acc') assert.ok(actor.avatar.acc.includes(outfit.id), outfit.id); else assert.equal(actor.avatar[outfit.category], outfit.id);
    assert.equal(JSON.stringify(s), before, '完整服饰几何不写拥有权/穿戴：' + outfit.id);
  }
});
test('十二位动物各使用所选真实定义，待邀请仍可预览，角耳尾巴与完整几何不被裁', () => {
  const G = setup(), s = state(G), before = JSON.stringify(s), seen = new Set(); freeze(s);
  for (const definition of G.data.residents) {
    const stage = G.pageStages3D.describe({ state: s, surface: 'residents', residentId: definition.id }), result = build(G, stage); assert.equal(result.characters.length, 1);
    const actor = result.characters[0]; assert.equal(actor.avatar, null); assert.equal(actor.resident.id, definition.id); assert.equal(actor.resident.species, definition.species); assert.equal(actor.resident.color, definition.color); assert.equal(actor.resident.accent, definition.accent);
    assert.ok(actor.bounds.min[1] >= .3, '脚部完整且接在纸台上'); assert.ok(actor.bounds.max[1] - actor.bounds.min[1] > 2.5, '真实动物作为大人物展示');
    if (definition.species === 'rabbit') assert.ok(actor.bounds.max[1] > 4.1, '兔耳顶端计入几何');
    if (definition.species === 'deer' || definition.species === 'unicorn') assert.ok(actor.bounds.max[1] > 3.9, '鹿角/独角计入几何');
    seen.add(signature(result.geometry)); assert.equal(s.residents[definition.id].movedIn, false, '预览不伪造入住');
  }
  assert.equal(seen.size, G.data.residents.length, '真实动物轮廓或配色各不相同'); assert.equal(JSON.stringify(s), before);
});
test('外观/选中居民/真实定义变化使key和实际模型变化，无关钱包与非穿着库存不重建', () => {
  const G = setup(), s = state(G), describe = surface => G.pageStages3D.describe({ state: s, surface, residentId: 'lily' });
  const avatar = describe('avatar'), original = signature(build(G, avatar).geometry); s.wallet.coin++; s.avatar.owned.acc_bag = true; assert.equal(describe('avatar').key, avatar.key);
  for (const [field, value] of [['hair', 'buns'], ['hairColor', '#C77362'], ['face', 'surprise'], ['skin', 2]]) { const old = s.avatar[field]; s.avatar[field] = value; assert.notEqual(describe('avatar').key, avatar.key, field); s.avatar[field] = old; }
  s.avatar.acc = ['acc_bunny']; assert.notEqual(describe('avatar').key, avatar.key); s.avatar.acc = ['bow_red'];
  const dress = G.data.outfitById[s.avatar.dress], oldColor = dress.color; dress.color = '#AF526E'; const newDress = describe('avatar'); assert.notEqual(newDress.key, avatar.key); assert.notEqual(signature(build(G, newDress).geometry), original); dress.color = oldColor;
  const skin = G.data.avatarSkins.find(row => row.id === s.avatar.skin), oldSkin = skin.color; skin.color = '#F2D49A'; assert.notEqual(describe('avatar').key, avatar.key); skin.color = oldSkin; assert.equal(describe('avatar').key, avatar.key);
  const resident = describe('residents'), actor = G.data.residents.find(def => def.id === 'lily'), oldSpecies = actor.species; actor.species = 'deer'; assert.notEqual(describe('residents').key, resident.key); actor.species = oldSpecies;
  assert.notEqual(G.pageStages3D.describe({ state: s, surface: 'residents', residentId: 'xingxing' }).key, resident.key);
  const changed = plain(s); changed.residents.lily.movedIn = true; assert.notEqual(G.pageStages3D.describe({ state: changed, surface: 'residents', residentId: 'lily' }).key, resident.key); assert.equal(s.residents.lily.movedIn, false);
});
test('描述快照不受之后选择/档案编辑污染，重复构建确定且不共享可变bounds', () => {
  const G = setup(), s = state(G), originalHair = s.avatar.hairColor, avatar = G.pageStages3D.describe({ state: s, surface: 'avatar' }); s.avatar.hairColor = '#C77362';
  const first = build(G, avatar), second = build(G, avatar); assert.equal(first.characters[0].avatar.hairColor, originalHair); assert.equal(signature(first.geometry), signature(second.geometry));
  const resident = G.pageStages3D.describe({ state: s, surface: 'residents', residentId: 'lily' }), def = G.data.residents.find(row => row.id === 'lily'), oldColor = def.color; def.color = '#D7A7B8'; assert.equal(build(G, resident).characters[0].resident.color, oldColor);
  avatar.bounds.min[0] = -100; avatar.focus[0] = 100; const next = G.pageStages3D.describe({ state: s, surface: 'avatar' }); assert.ok(next.bounds.min[0] > -100); assert.equal(next.focus[0], 0);
});
test('缺少模型依赖时安全返回false且不留下半份几何', () => {
  const G = setup(), stage = G.pageStages3D.describe({ state: state(G), surface: 'avatar' }), geometry = new G.world3dMath.Geometry();
  assert.equal(stage.build(null, G.world3dModels), false); assert.equal(stage.build(geometry, {}), false); assert.equal(geometry.data.length, 0);
});
if (require.main === module) {
  for (const [name, run] of tests) { run(); console.log('✓ ' + name); }
  console.log('\n' + tests.length + ' 组功能页舞台CPU几何合约检查通过（未覆盖GL/相机/像素/实际页面接线）。');
}
