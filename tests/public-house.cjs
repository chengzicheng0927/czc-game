'use strict';
// 公开投影仅用隔离合成小屋，禁止真实localStorage或监听。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function sandbox() {
  const context = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); context.window = context;
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('public projection must not access localStorage'); } });
  const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  const base = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js']);
  for (const file of files.filter(file => base.has(file) || file.startsWith('js/data/'))) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/core/public-house.js'), 'utf8'), context);
  context.Game.store.init(); return { G: context.Game, context };
}
function fixture(G) {
  G.store.update(state => { state.level = G.data.balance.maxLevel; state.wallet.coin = 5000; });
  const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
  G.store.update(state => {
    state.profile.name = '不可公开的姓名'; state.profile.birthday = '08-19';
    state.house.exterior.roof = 'roof_cloud'; state.house.exterior.roofColor = '#BFE3FF'; state.house.exterior.owned.roof_cloud = true; state.house.exterior.owned.roof_castle = true;
    state.house.attic = { type: 'observatory', paidPrice: 1000, builtAt: 1234 };
    state.customArts = [{ id: 'public_art', name: '不公开的画名', pixels: '1' + '.'.repeat(255) }, { id: 'unused_art', name: '不公开的未用画', pixels: '2' + '.'.repeat(255) }];
    state.house.rooms[roomId].wallpaper = { pattern: 'custom', color: '#FFB6C8', color2: '#FFF1C1', artId: 'public_art' };
    state.house.rooms[roomId].items = [
      { uid: 'table', defId: 'nightstand_basic', x: 100, y: 100, z: 1, flip: false, color: null, parent: null, depth: .2 },
      { uid: 'lamp', defId: 'desk_lamp_basic', x: 105, y: 95, z: 2, flip: true, color: '#BDECD6', parent: 'table' },
      { uid: 'frame', defId: 'custom_art_frame', x: 15, y: 20, z: 3, flip: true, color: null, parent: null, artId: 'public_art' }
    ];
    state.house.floors = [{ slots: [null, null, null] }, { slots: [null, roomId, null] }];
    state.residents.lily = { movedIn: true, roomId, affection: 99, happiness: 75, heartBubbles: 2, lastBubbleAt: 5678, patsToday: 0 };
  });
  return { state: plain(G.state), roomId };
}
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function runTests() {
  let count = 0; const test = (name, fn) => { fn(); count++; console.log('✓ ' + name); };
  test('白名单投影去掉完整私档、未引用画作、经济和人物私密字段', () => {
    const { G } = sandbox(), { state } = fixture(G), before = JSON.stringify(state), output = G.publicHouse.project(deepFreeze(state), { title: '公开的小屋', displayName: '小小建筑师' });
    assert.equal(JSON.stringify(state), before); assert.equal(output.house.name, '公开的小屋');
    assert.deepEqual(Object.keys(output).sort(), ['avatar', 'customArts', 'house', 'residents', 'version']);
    const serialized = JSON.stringify(output); for (const secret of ['profile', 'wallet', 'inventory', 'collection', 'owned', 'affection', 'heartBubbles', 'lastBubbleAt', 'patsToday', 'paidPrice', 'builtAt', 'birthday', 'album', 'settings', 'memories', 'unused_art', '不公开的', '不可公开的姓名']) assert.ok(!serialized.includes(secret), secret);
    assert.deepEqual(plain(output.customArts), [{ id: 'public_art', pixels: state.customArts[0].pixels }]);
  });
  test('保留稳定房间位置、外观色、父子台面、深度、翻转与已引用画作', () => {
    const { G } = sandbox(), { state, roomId } = fixture(G), output = G.publicHouse.project(state, { title: '公开的小屋' });
    assert.deepEqual(plain(output.house.floors), state.house.floors); assert.equal(output.house.exterior.roof, 'roof_cloud'); assert.equal(output.house.exterior.roofColor, '#BFE3FF');
    const restored = G.publicHouse.materialize(output); assert.equal(restored.house.floors[1].slots[1], roomId); assert.equal(restored.house.rooms[roomId].items[0].depth, .2); assert.equal(restored.house.rooms[roomId].items[1].parent, 'table'); assert.equal(restored.house.rooms[roomId].items[1].flip, true); assert.equal(restored.house.rooms[roomId].items[2].artId, 'public_art'); assert.equal(restored.house.rooms[roomId].wallpaper.artId, 'public_art'); assert.ok(restored.house.attic);
  });
  test('合成状态的拥有权、私人角色和用户资料均为固定默认，投影不带这些值', () => {
    const { G } = sandbox(), { state } = fixture(G), output = G.publicHouse.project(state, { title: '公开的小屋' }), restored = G.publicHouse.materialize(output);
    assert.equal(restored.profile.name, '小设计师'); assert.equal(restored.wallet.coin, G.data.balance.initialCoin); assert.equal(restored.house.exterior.owned.roof_cloud, true); assert.equal(restored.house.exterior.owned.roof_castle, undefined); assert.equal(restored.residents.lily.affection, 0); assert.equal(restored.residents.lily.heartBubbles, 0); assert.equal(restored.customArts[0].name, '公开画作');
    restored.house.rooms[Object.keys(restored.house.rooms)[0]].items[0].depth = .8; assert.equal(output.house.rooms[Object.keys(output.house.rooms)[0]].items[0].depth, .2);
  });
  test('陌生字段或危险键不能混入公开快照与合成状态', () => {
    const { G } = sandbox(), { state } = fixture(G), output = plain(G.publicHouse.project(state, { title: '公开的小屋' }));
    const mutations = [x => { x.profile = state.profile; }, x => { x.house.exterior.owned = { roof_castle: true }; }, x => { x.residents[0].affection = 100; }, x => { x.customArts[0].name = 'secret'; }, x => { x.house.rooms[Object.keys(x.house.rooms)[0]].paidPrice = 777; }, x => { x.avatar.owned = {}; }, x => { x.version = 2; }];
    mutations.forEach(mutate => { const bad = plain(output); mutate(bad); assert.throws(() => G.publicHouse.materialize(bad)); });
    const polluted = JSON.parse(JSON.stringify(output).replace('"version":1', '"version":1,"__proto__":{"secret":true}')); assert.throws(() => G.publicHouse.materialize(polluted));
  });
  test('损坏引用、重复角色、未声明画作、非法深度和未来版均拒绝', () => {
    const { G } = sandbox(), { state, roomId } = fixture(G), output = plain(G.publicHouse.project(state, { title: '公开的小屋' }));
    for (const mutate of [x => { x.house.floors[1].slots[1] = 'missing'; }, x => { x.residents.push(x.residents[0]); }, x => { x.customArts = []; }, x => { x.house.rooms[roomId].items[0].depth = 2; }, x => { x.house.rooms[roomId].items[1].parent = 'missing'; }]) { const bad = plain(output); mutate(bad); assert.throws(() => G.publicHouse.materialize(bad)); }
  });
  test('公开标题校验与Unicode截断不带出主人私有屋名', () => {
    const { G } = sandbox(), { state } = fixture(G);
    for (const title of ['', 'a'.repeat(25), '两\n行']) assert.throws(() => G.publicHouse.project(state, { title }));
    const output = G.publicHouse.project(state, { title: '🌷'.repeat(24) }); assert.ok(output.house.name.length <= 32); assert.equal([...output.house.name].join(''), output.house.name); assert.doesNotThrow(() => G.publicHouse.materialize(output));
  });
  console.log(count + ' 组公开投影与合成状态检查通过。');
}
module.exports = { sandbox, fixture, plain };
if (require.main === module) runTests();
