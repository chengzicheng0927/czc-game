'use strict';
// 实际领域bundle、空间投影和实时位置合同；只读内存，不启动UI/网络/存储或旧场景引擎。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8'));
const tests = [], test = (name, fn) => tests.push({ name, fn });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected);
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function sandbox() {
  const denied = () => { throw new Error('空间映射不能读写玩家存档或联网'); };
  const context = vm.createContext({ console, document: { createElement: denied } }); context.window = context;
  Object.defineProperty(context, 'localStorage', { get: denied }); context.fetch = denied;
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const core = new Set(['js/core/namespace.js', 'js/building/schema.js', 'js/core/content-spaces.js', 'js/core/live-space.js']);
  manifest.filter(file => core.has(file) || file.startsWith('js/data/')).forEach(run);
  for (const file of core) assert.ok(manifest.includes(file), '实际清单缺少：' + file);
  const G = context.Game, schema = context.CottageBuilding;
  G.store = { update: denied, save: denied, replace: denied }; G.ui = {};
  run('js/ui/host-room.js');
  return { G, schema, source: doc => ({ building: doc, house: { name: '内存小屋' }, wallet: { coin: 89 }, inventory: { bed_basic: 2 } }) };
}
function polygon(env, doc, points, floorId = 'floor_0', prefix = 'wall') {
  return points.reduce((value, start, index) => env.schema.executeCommand(value, { type: 'wall.add', wall: { id: prefix + '_' + index, floorId, start, end: points[(index + 1) % points.length], height: 2.8, thickness: .16, color: '#F4DDE7' } }), doc);
}
const rectangle = (minX, minZ, maxX, maxZ) => [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }];
function roundTrip(env, state, point, floorId) {
  const destination = env.G.liveSpace.destination(state, point, floorId); assert.ok(destination);
  const position = env.G.liveSpace.position(state, destination); assert.ok(position);
  close(position.x, point.x); close(position.z, point.z); return { destination, position };
}

test('任意角度真实闭环的XZ坐标按楼层墙bounds归一并可反向恢复', () => {
  const env = sandbox(), doc = polygon(env, env.schema.createEmptyDocument(), [{ x: 0, z: -4 }, { x: 4, z: 0 }, { x: 0, z: 4 }, { x: -4, z: 0 }]);
  const state = env.source(doc); assert.equal(env.G.contentSpaces.list(state).length, 1);
  for (const point of [{ x: -1, z: -1 }, { x: 2, z: 1 }, { x: 0, z: 0 }, { x: -4, z: 0 }]) {
    const result = roundTrip(env, state, point, 'floor_0'); assert.equal(result.destination.zone, 'floor_0'); close(result.position.y, 0);
    close(result.destination.x, (point.x + 4) / 8); close(result.destination.y, (point.z + 4) / 8);
  }
});

test('凹形空间不把bbox缺角当室内，非法室内peer坐标投影到真实边界', () => {
  const env = sandbox(), doc = polygon(env, env.schema.createEmptyDocument(), [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 6 }, { x: 0, z: 6 }]);
  const state = env.source(doc), room = env.G.contentSpaces.list(state)[0]; assert.equal(room.area, 20);
  const inside = roundTrip(env, state, { x: 1, z: 5 }, 'floor_0'); assert.equal(inside.destination.zone, 'floor_0');
  close(inside.destination.x, 1 / 6); close(inside.destination.y, 5 / 6);
  assert.equal(env.G.liveSpace.destination(state, { x: 4, z: 4 }, 'floor_0').zone, 'yard');
  const projected = env.G.liveSpace.position(state, { zone: 'floor_0', x: .75, y: .75 }); assert.ok(projected);
  assert.ok(projected.x <= 2 || projected.z <= 2, '不能把人留在L形缺角');
  assert.equal(env.G.liveSpace.destination(state, projected, projected.floorId).zone, 'floor_0');
});

test('嵌套闭环保留真实hole，外圈空间ID读取不会把中心投在孔洞', () => {
  const env = sandbox(); let doc = polygon(env, env.schema.createEmptyDocument(), rectangle(0, 0, 10, 10), 'floor_0', 'outer');
  doc = polygon(env, doc, rectangle(4, 4, 6, 6), 'floor_0', 'inner');
  const state = env.source(doc), list = env.G.contentSpaces.list(state), outer = list.find(room => room.holes.length), inner = list.find(room => !room.holes.length);
  assert.ok(outer && inner); assert.equal(outer.area, 96); assert.equal(inner.area, 4); assert.equal(outer.holes[0].length, 4);
  const projected = env.G.liveSpace.position(state, { zone: outer.spaceId, x: .5, y: .5 }); assert.ok(projected);
  assert.ok(!(projected.x > 4 && projected.x < 6 && projected.z > 4 && projected.z < 6), '外圈人物不得落入其hole内部');
  assert.equal(env.G.liveSpace.destination(state, projected, 'floor_0').zone, 'floor_0');
  // 内圈本身也是墙围出的独立空间；不能用外圈hole把这个真实空间整个抹掉。
  const child = roundTrip(env, state, { x: 5, z: 5 }, 'floor_0'); assert.equal(child.destination.zone, 'floor_0');
});

test('不同真实楼层使用各自墙bounds和elevation，默认只选择最低层', () => {
  const env = sandbox(); let doc = polygon(env, env.schema.createEmptyDocument(), rectangle(-2, -2, 2, 2));
  doc = env.schema.executeCommand(doc, { type: 'floor.add', floor: { id: 'upper', name: '二楼', elevation: 4.25 } });
  doc = polygon(env, doc, rectangle(10, -2, 14, 2), 'upper', 'upper_wall');
  const state = env.source(doc), result = roundTrip(env, state, { x: 11, z: 1 }, 'upper');
  assert.equal(result.destination.zone, 'upper'); close(result.destination.x, .25); close(result.destination.y, .75); close(result.position.y, 4.25); assert.equal(result.position.floorId, 'upper');
  assert.equal(env.G.liveSpace.destination(state, { x: 11, z: 1 }).zone, 'yard');
  const yard = roundTrip(env, state, { x: 16, z: 0 }); assert.equal(yard.destination.zone, 'yard'); close(yard.destination.x, 21 / 22); close(yard.position.y, 0);
});

test('空楼层与室外使用有界yard兜底，远处/非法数字/未知zone拒绝', () => {
  const env = sandbox(), state = env.source(env.schema.createEmptyDocument());
  const center = roundTrip(env, state, { x: 0, z: 0 }); assert.deepEqual(plain(center.destination), { zone: 'yard', x: .5, y: .5 });
  close(roundTrip(env, state, { x: 8, z: -8 }).destination.x, 1);
  for (const point of [{ x: 8.01, z: 0 }, { x: NaN, z: 0 }, { x: 0, z: Infinity }, { x: '0', z: 0 }, null]) assert.equal(env.G.liveSpace.destination(state, point), null);
  for (const peer of [{ zone: 'missing', x: .5, y: .5 }, { zone: 'yard', x: -.01, y: .5 }, { zone: 'yard', x: .5, y: 1.01 }, { zone: 'yard', x: NaN, y: .5 }, { zone: 'floor_0', x: .5, y: .5 }]) assert.equal(env.G.liveSpace.position(state, peer), null);
});

test('旧房间身份与新spaceId均可读取，但新发送只使用稳定floorId', () => {
  const env = sandbox(), legacy = { floors: [{ slots: ['old_room'] }], rooms: { old_room: { type: 'bedroom', wallpaper: { color: '#F4DDE7' }, items: [] } }, yard: { items: [] }, attic: null };
  const before = JSON.stringify(legacy), state = env.source(env.schema.migrateLegacyHouse(legacy, env.G.data.furnitureById)), room = env.G.contentSpaces.list(state)[0];
  assert.equal(room.id, 'old_room'); assert.notEqual(room.spaceId, room.id);
  const oldPoint = env.G.liveSpace.position(state, { zone: 'old_room', x: .5, y: .5 }), currentPoint = env.G.liveSpace.position(state, { zone: room.spaceId, x: .5, y: .5 });
  assert.deepEqual(plain(oldPoint), plain(currentPoint));
  assert.equal(env.G.liveSpace.destination(state, oldPoint, room.floorId).zone, room.floorId);
  const publicDoc = plain(state.building); delete publicDoc.migration;
  const publicState = env.source(env.schema.validateDocument(publicDoc, env.G.data.furnitureById));
  assert.equal(env.G.contentSpaces.list(publicState)[0].id, room.spaceId);
  assert.deepEqual(plain(env.G.liveSpace.position(publicState, { zone: room.spaceId, x: .5, y: .5 })), plain(currentPoint));
  assert.equal(JSON.stringify(legacy), before);
});

test('真实roomKit方向步进经过几何映射，凹角和指定空间hole都不会悬空', () => {
  const env = sandbox(); let doc = polygon(env, env.schema.createEmptyDocument(), [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 6 }, { x: 0, z: 6 }]);
  const state = freeze(env.source(doc)); env.G.state = state;
  let self = { id: 'me', zone: 'floor_0', x: .5, y: .3 }, phase = 'connected'; const moves = [];
  env.G.live = { status: () => ({ phase, peerId: 'me', peers: [self] }), move(zone, x, y) { moves.push({ zone, x, y }); } };
  const kit = env.G.roomKit.create({}); kit.direction('down'); assert.equal(moves.length, 1);
  let point = env.G.liveSpace.position(state, moves[0]); close(point.x, 3); close(point.z, 2);
  const before = moves.length; phase = 'reconnecting'; kit.direction('down'); assert.equal(moves.length, before);
  doc = polygon(env, env.schema.createEmptyDocument(), rectangle(0, 0, 10, 10), 'floor_0', 'outer'); doc = polygon(env, doc, rectangle(4, 4, 6, 6), 'floor_0', 'inner');
  const ring = freeze(env.source(doc)), outer = env.G.contentSpaces.list(ring).find(room => room.holes.length);
  env.G.state = ring; phase = 'connected'; self = { id: 'me', zone: outer.spaceId, x: .5, y: .5 }; kit.direction('down');
  point = env.G.liveSpace.position(ring, moves.at(-1)); assert.ok(point); assert.equal(moves.at(-1).zone, 'floor_0');
  assert.ok(!(point.x > 4 && point.x < 6 && point.z > 4 && point.z < 6));
});

test('纯映射和方向操作不修改冻结建筑、经济、库存、peer或保存入口', () => {
  const env = sandbox(), state = freeze(env.source(polygon(env, env.schema.createEmptyDocument(), rectangle(-2, -2, 2, 2))));
  const peer = freeze({ zone: 'floor_0', x: .4, y: .6 }), source = JSON.stringify(state), peerSource = JSON.stringify(peer); env.G.state = state;
  for (let index = 0; index < 20; index++) { env.G.liveSpace.destination(state, { x: 0, z: 0 }); env.G.liveSpace.position(state, peer); }
  env.G.live = { status: () => ({ phase: 'connected', peerId: 'me', peers: [{ ...peer, id: 'me' }] }), move() {} }; env.G.roomKit.create({}).direction('right');
  assert.equal(JSON.stringify(state), source); assert.equal(JSON.stringify(peer), peerSource); assert.equal(env.G.state, state); assert.equal(state.wallet.coin, 89); assert.equal(state.inventory.bed_basic, 2);
});

for (const item of tests) { item.fn(); console.log('✓ ' + item.name); }
console.log(tests.length + ' 组真实建筑实时空间映射检查通过（不代表人物像素或浏览器体验验收）。');
