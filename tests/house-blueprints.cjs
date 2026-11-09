'use strict';
// 实际清单、真实schema2/store/save/居民规则；只用内存存储，不启动服务或读取玩家存档。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), spaces = require('./fixtures/free-spaces.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8'));
for (const file of ['js/data/house-blueprints.js', 'js/systems/house-blueprints.js']) assert.ok(manifest.includes(file), '真实清单必须加载' + file);
assert.ok(manifest.indexOf('js/data/exterior.js') < manifest.indexOf('js/data/house-blueprints.js'));
assert.ok(manifest.indexOf('js/core/store.js') < manifest.indexOf('js/systems/house-blueprints.js'));
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js']);
const files = manifest.filter(file => core.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
const plain = value => JSON.parse(JSON.stringify(value));
function setup(saved) {
  let denied = false, writes = 0; const memory = new Map();
  const context = vm.createContext({ console, Blob, URL, TextEncoder, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { hidden: false, addEventListener() {} } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => memory.get(key) || null, setItem(key, value) { if (denied) throw new Error('QuotaExceededError'); writes++; memory.set(key, String(value)); } };
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game, schema = context.CottageBuilding, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  spaces.register(G, schema); G.store.init(saved ? parse(saved) : undefined);
  return { G, schema, context, memory, parse, writes: () => writes, deny(value) { denied = value; } };
}
function fund(G, level = 30) { G.store.update(state => { state.level = level; state.wallet.coin = 10000; state.wallet.heart = 1000; state.tutorial.done = true; }); }
function success(result) { assert.equal(result.ok, true, result.message); return result; }
function apply(G, id) { const status = success(G.sys.houseBlueprints.preview(id)); return G.sys.houseBlueprints.apply(id, status.quote); }
function unchanged(G, fn) { const before = JSON.stringify(G.state), result = fn(); assert.equal(result.ok, false, result.message); assert.equal(JSON.stringify(G.state), before); return result; }
function onSegment(point, a, b) {
  return Math.abs((b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x)) < .000001 && point.x >= Math.min(a.x, b.x) - .000001 && point.x <= Math.max(a.x, b.x) + .000001 && point.z >= Math.min(a.z, b.z) - .000001 && point.z <= Math.max(a.z, b.z) + .000001;
}
function openingCenter(opening, wall) { const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z), offset = opening.offset + opening.width / 2; return { x: wall.start.x + (wall.end.x - wall.start.x) * offset / length, z: wall.start.z + (wall.end.z - wall.start.z) * offset / length }; }
function resident(roomId, index = 0) {
  return { movedIn: true, roomId, affection: 500 + index, happiness: 75, heartBubbles: index % 3, lastBubbleAt: 1234 + index, patsToday: index % 3, interactDate: '2026-11-07', giftDate: '2026-11-06', wish: null, wishLastClaimedDate: '', friendshipClaims: [1, 2, 3], bestFriendBadge: false };
}
function plantedGarden(G) {
  G.store.update(state => {
    const plantedAt = 1730000000000;
    state.garden.plots[0] = { crop: 'daisy', plantedAt, durationMs: G.data.cropById.daisy.growMs, watered: [plantedAt + 1000, null, null] };
    state.garden.seeds.daisy = 2; state.garden.harvest.carrot = 3;
  });
}
function yardFixture(env, floorId = 'legacy_yard', closed = false) {
  const { G, schema } = env;
  G.store.update(state => {
    if (!state.building.floors.some(floor => floor.id === floorId)) state.building = schema.executeCommand(state.building, { type: 'floor.add', floor: { id: floorId, name: '前院', elevation: 0 } }, G.data.furnitureById);
    state.building = schema.executeCommand(state.building, { type: 'furniture.add', furniture: { id: 'kept_yard_lamp', defId: 'yard_streetlamp', floorId, position: { x: 11, y: 0, z: 5 }, rotation: .5, color: '#AABBCC', legacyRoomId: 'yard', dimensions: schema.furnitureDimensions(G.data.furnitureById.yard_streetlamp) } }, G.data.furnitureById);
    if (closed) {
      const polygon = [{ x: 10, z: 4 }, { x: 14, z: 4 }, { x: 14, z: 7 }, { x: 10, z: 7 }];
      polygon.forEach((start, index) => { state.building = schema.executeCommand(state.building, { type: 'wall.add', wall: { id: 'yard_border_' + index, floorId, start, end: polygon[(index + 1) % 4], height: .8, thickness: .12, color: '#F4DDE7' } }, G.data.furnitureById); });
      state.building = schema.executeCommand(state.building, { type: 'opening.add', opening: { id: 'yard_gate', wallId: 'yard_border_0', kind: 'door', offset: 1.5, width: .8, height: .65, sill: 0 } }, G.data.furnitureById);
    }
  });
}
function yardSnapshot(G) {
  const document = G.state.building, floors = document.floors.filter(G.sys.houseBlueprints.isYardFloor), ids = new Set(floors.map(floor => floor.id)), walls = document.walls.filter(wall => ids.has(wall.floorId)), wallIds = new Set(walls.map(wall => wall.id));
  return plain({ floors, walls, openings: document.openings.filter(opening => wallIds.has(opening.wallId)), furniture: document.furniture.filter(item => ids.has(item.floorId)) });
}
const tests = [], test = (name, run) => tests.push({ name, run });

test('五档复用原屋顶等级/货币/价格，实际围合2/2/3/4/6房和一至两层', () => {
  const { G, schema } = setup(), before = JSON.stringify(G.state), expected = [['starter', 1, 0, 'coin', 2, 1], ['mushroom', 3, 110, 'coin', 2, 1], ['cloud', 5, 140, 'coin', 3, 1], ['castle', 8, 25, 'heart', 4, 1], ['star_castle', 12, 45, 'heart', 6, 2]];
  assert.equal(G.sys.houseBlueprints.list().length, 5);
  for (const [id, level, price, currency, roomCount, floorCount] of expected) {
    const status = success(G.sys.houseBlueprints.preview(id)), roof = G.data.exteriorById[status.roofId];
    assert.equal(status.unlockLv, level); assert.equal(status.level, level); assert.equal(status.price, price); assert.equal(status.currency, currency); assert.equal(status.roomCount, roomCount); assert.equal(status.floorCount, floorCount);
    assert.equal(roof.unlockLv, level); assert.equal(roof.price, price); assert.equal(roof.currency, currency);
    assert.deepEqual(plain(schema.validateDocument(status.building, G.data.furnitureById)), plain(status.building));
    assert.equal(status.building.furniture.length, 0); assert.equal(status.building.migration, undefined);
    const houseFloors = status.building.floors.filter(floor => !G.sys.houseBlueprints.isYardFloor(floor)), yardFloors = status.building.floors.filter(G.sys.houseBlueprints.isYardFloor);
    assert.equal(houseFloors.length, floorCount); assert.equal(status.building.floors.length, floorCount + 1);
    assert.deepEqual(plain(yardFloors), [{ id: 'legacy_yard', name: '前院', elevation: 0 }], '五型都自带空院地面，不能把它算成屋内楼层');
    assert.equal(houseFloors[0].elevation, 0); if (floorCount === 2) assert.equal(houseFloors[1].elevation, 2.65);
    assert.ok(status.building.walls.every(wall => wall.height === 2.35));
    const derived = status.building.floors.flatMap(floor => schema.deriveSpaces(status.building, floor.id)); assert.equal(derived.length, roomCount);
    for (const space of derived) {
      assert.ok(space.area > 6, '房间应有实际可布置面积');
      assert.ok(status.building.openings.some(opening => { const wall = status.building.walls.find(value => value.id === opening.wallId), center = openingCenter(opening, wall); return opening.kind === 'window' && wall.floorId === space.floorId && space.polygon.some((a, index) => onSegment(center, a, space.polygon[(index + 1) % space.polygon.length])); }), '每间房都有真实外窗');
    }
    const ground = status.building.floors[0], frontDoor = status.building.openings.find(opening => { const wall = status.building.walls.find(value => value.id === opening.wallId); return opening.kind === 'door' && wall.floorId === ground.id && wall.start.z > 0 && wall.start.z === wall.end.z; });
    assert.ok(frontDoor); assert.ok(Math.abs(openingCenter(frontDoor, status.building.walls.find(wall => wall.id === frontDoor.wallId)).x) < .000001, '入口在+Z中央');
    if (id === 'castle' || id === 'star_castle') for (const opening of status.building.openings.filter(value => value.kind === 'window')) {
      const wall = status.building.walls.find(value => value.id === opening.wallId), length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      assert.ok(opening.offset >= .8 && length - opening.offset - opening.width >= .8, '外角给真实塔身留出净距');
      if (id === 'castle') assert.ok(opening.offset > 1 && length - opening.offset - opening.width > 1, '紧凑城堡四角窗边留出超过1米塔身净距');
    }
    if (id === 'castle') {
      const xs = status.building.walls.flatMap(wall => [wall.start.x, wall.end.x]), zs = status.building.walls.flatMap(wall => [wall.start.z, wall.end.z]);
      assert.equal(Math.max(...xs) - Math.min(...xs), 7.2); assert.equal(Math.max(...zs) - Math.min(...zs), 5.6);
    }
    status.building.walls[0].height = 8; status.exterior.owned.roof_starry = true; status.returnedInventory.bed_basic = 99;
    assert.equal(G.sys.houseBlueprints.preview(id).building.walls[0].height, 2.35);
  }
  assert.equal(JSON.stringify(G.state), before); assert.ok(Object.isFrozen(G.data.houseBlueprints[0].floors[0].walls));
});

test('免费建整栋只写一次，保留付费墙/门窗/烟囱及旧外观拥有权，不赠付费装', () => {
  const { G, writes } = setup(); fund(G);
  G.store.update(state => { for (const id of ['wall_icing', 'win_stained', 'door_castle', 'heart']) state.house.exterior.owned[id] = true; Object.assign(state.house.exterior, { wall: 'wall_icing', window: 'win_stained', door: 'door_castle', chimney: 'heart' }); });
  const before = plain(G.state), count = writes(), result = success(apply(G, 'starter'));
  assert.equal(writes(), count + 1); assert.deepEqual(plain(G.state.wallet), before.wallet); assert.deepEqual(plain(G.state.avatar), before.avatar);
  assert.deepEqual(plain(G.state.house.exterior.owned), before.house.exterior.owned); for (const key of ['wall', 'window', 'door', 'chimney']) assert.equal(G.state.house.exterior[key], before.house.exterior[key]);
  assert.deepEqual(plain(G.state.quests), before.quests); assert.equal(G.state.level, before.level); assert.equal(G.state.exp, before.exp);
  assert.equal(result.exteriorBefore.owned, undefined); assert.equal(result.exteriorAfter.owned, undefined); assert.equal(result.buildingAfter.schema, 2);
});

test('默认木墙建造时免费换奶油玩具墙，已有玩具墙续用且selected包含墙配置', () => {
  const { G, writes } = setup(), toy = G.data.exteriorById.wall_toy;
  assert.ok(toy); assert.equal(toy.price, 0); assert.equal(toy.unlockLv, 1); assert.equal(G.state.house.exterior.owned.wall_toy, true);
  assert.equal(G.state.house.exterior.wall, 'wall_wood');
  const before = plain(G.state), status = G.sys.houseBlueprints.preview('starter'), count = writes();
  assert.equal(status.exterior.wall, 'wall_toy'); assert.deepEqual(plain(status.cost), { coin: 0, heart: 0 }); assert.equal(G.state.house.exterior.wall, 'wall_wood', '预览不先换墙');
  success(G.sys.houseBlueprints.apply('starter', status.quote)); assert.equal(writes(), count + 1); assert.equal(G.state.house.exterior.wall, 'wall_toy'); assert.deepEqual(plain(G.state.wallet), before.wallet); assert.deepEqual(plain(G.state.house.exterior.owned), before.house.exterior.owned);
  assert.equal(G.sys.houseBlueprints.preview('starter').selected, true);
  G.store.update(state => { state.house.exterior.wall = 'wall_wood'; }); assert.equal(G.sys.houseBlueprints.preview('starter').selected, false, '默认木墙与玩具墙是不同实际配置');
  success(apply(G, 'starter')); assert.equal(G.state.house.exterior.wall, 'wall_toy');
  fund(G); success(apply(G, 'mushroom')); assert.equal(G.state.house.exterior.wall, 'wall_toy');
});

test('等级与不足货币拒绝；已有屋顶不重复收费但不越过原等级门槛', () => {
  const { G } = setup(); fund(G, 1);
  for (const id of ['mushroom', 'cloud', 'castle', 'star_castle']) { const status = G.sys.houseBlueprints.preview(id); assert.equal(status.locked, true); unchanged(G, () => G.sys.houseBlueprints.apply(id, status.quote)); }
  G.store.update(state => { state.house.exterior.owned.roof_castle = true; }); assert.equal(G.sys.houseBlueprints.preview('castle').cost.heart, 0); unchanged(G, () => apply(G, 'castle'));
  G.store.update(state => { state.level = 12; state.wallet.coin = 109; state.wallet.heart = 44; });
  assert.equal(G.sys.houseBlueprints.preview('mushroom').canAfford, false); unchanged(G, () => apply(G, 'mushroom'));
  assert.equal(G.sys.houseBlueprints.preview('star_castle').canAfford, false); unchanged(G, () => apply(G, 'star_castle'));
});

test('原价购屋顶及整栋一次提交，换回已拥有房型免费且不丢旧配件', () => {
  const { G, writes } = setup(); fund(G); const before = plain(G.state.wallet), count = writes();
  success(apply(G, 'mushroom')); assert.equal(writes(), count + 1); assert.equal(G.state.wallet.coin, before.coin - 110); assert.equal(G.state.wallet.heart, before.heart); assert.equal(G.state.house.exterior.owned.roof_mushroom, true);
  success(apply(G, 'cloud')); assert.equal(G.state.wallet.coin, before.coin - 250);
  const free = G.sys.houseBlueprints.preview('mushroom'); assert.equal(free.owned, true); assert.deepEqual(plain(free.cost), { coin: 0, heart: 0 }); success(G.sys.houseBlueprints.apply('mushroom', free.quote)); assert.equal(G.state.wallet.coin, before.coin - 250);
  success(apply(G, 'castle')); assert.equal(G.state.wallet.heart, before.heart - 25); success(apply(G, 'star_castle')); assert.equal(G.state.wallet.heart, before.heart - 70);
  assert.equal(G.state.house.exterior.owned.roof_cloud, true); assert.equal(G.state.house.exterior.owned.roof_triangle, true);
});

test('屋内和阁楼家具回包，庭院实体原位保留，自画框卸下且旧house归档不重复回收', () => {
  const { G, schema } = setup(); fund(G); const room = spaces.buildSpace(G, 0, 0).roomId; spaces.placeItem(G, 'bed_basic', room);
  G.store.update(state => {
    state.house.floors[0].slots[0] = 'archive_room';
    state.house.rooms.archive_room = { type: 'bedroom', paidPrice: 0, wallpaper: { pattern: 'solid', color: '#FFE3C9', color2: '#FFF8FB' }, floor: { pattern: 'wood', color: '#EED7B9' }, light: 'warm', items: [{ uid: 'archive_bed', defId: 'bed_basic', x: 15, y: 130, z: 1, flip: false, color: null, parent: null, depth: .75 }] };
    state.house.yard.items = [{ uid: 'yard_furniture', defId: 'yard_streetlamp', x: 0, y: 20, z: 0, flip: false, color: null }];
    for (const floor of [{ id: 'fixture_yard', name: '庭院', elevation: 0 }, { id: 'fixture_attic', name: '阁楼', elevation: 3 }]) state.building = schema.executeCommand(state.building, { type: 'floor.add', floor }, G.data.furnitureById);
    for (const [id, defId, floorId] of [['yard_furniture', 'yard_streetlamp', 'fixture_yard'], ['attic_furniture', 'nightstand_basic', 'fixture_attic']]) state.building = schema.executeCommand(state.building, { type: 'furniture.add', furniture: { id, defId, floorId, position: { x: 0, y: 0, z: 0 }, rotation: 0, dimensions: schema.furnitureDimensions(G.data.furnitureById[defId]) } }, G.data.furnitureById);
    state.customArts.push({ id: 'blueprint_art', name: '搬家也带上小画', pixels: '1' + '.'.repeat(255) });
    state.building = schema.executeCommand(state.building, { type: 'furniture.add', furniture: { id: 'blueprint_frame', defId: G.data.creativeConfig.frameId, floorId: state.building.floors[0].id, artId: 'blueprint_art', position: { x: 1, y: 1, z: 1 }, rotation: 0, dimensions: schema.furnitureDimensions(G.data.furnitureById[G.data.creativeConfig.frameId]) } }, G.data.furnitureById);
    state.building = schema.executeCommand(state.building, { type: 'wall.decorate', wallIds: [state.building.walls[0].id], artId: 'blueprint_art' }, G.data.furnitureById);
  });
  const before = plain(G.state), status = G.sys.houseBlueprints.preview('cloud');
  assert.deepEqual(plain(status.returnedInventory), { bed_basic: 1, nightstand_basic: 1 }); assert.equal(status.removedPaintings.length, 1);
  assert.equal(status.floorCount, 1); assert.equal(status.roomCount, 3); assert.equal(status.building.floors.length, 2);
  const result = success(G.sys.houseBlueprints.apply('cloud', status.quote));
  for (const [id, amount] of Object.entries(result.returnedInventory)) assert.equal(G.state.inventory[id], (before.inventory[id] || 0) + amount);
  assert.equal(G.state.inventory.custom_art_frame, undefined); assert.deepEqual(plain(G.state.customArts), before.customArts); assert.equal(G.state.building.furniture.length, 1);
  assert.deepEqual(plain(G.state.building.furniture[0]), before.building.furniture.find(item => item.id === 'yard_furniture'));
  assert.equal(G.state.inventory.yard_streetlamp, before.inventory.yard_streetlamp); assert.equal(G.state.building.floors.find(floor => floor.id === 'fixture_yard').elevation, 0);
  const archive = plain(G.state.house); delete archive.exterior; const oldArchive = before.house; delete oldArchive.exterior; assert.deepEqual(archive, oldArchive);
  unchanged(G, () => G.sys.houseBlueprints.apply('cloud', status.quote)); assert.equal(G.state.inventory.bed_basic, before.inventory.bed_basic + 1);
});

test('连续换房保留全部庭院层/围墙/门/家具和种植字段，庭院围合不参与房型与朋友容量', () => {
  const env = setup(), { G, schema } = env; fund(G); success(apply(G, 'starter'));
  const bedroom = G.contentSpaces.list()[0]; spaces.placeItem(G, 'bed_basic', bedroom.id);
  G.store.update(state => { state.residents.lily = resident(bedroom.id); });
  yardFixture(env, 'legacy_yard', true); plantedGarden(G);
  G.store.update(state => {
    state.building = schema.executeCommand(state.building, { type: 'floor.add', floor: { id: 'side_yard', name: '侧院', elevation: 0 } }, G.data.furnitureById);
    state.customArts.push({ id: 'outdoor_art', name: '院子里的画', pixels: '.'.repeat(256) });
    state.building = schema.executeCommand(state.building, { type: 'furniture.add', furniture: { id: 'outdoor_frame', defId: G.data.creativeConfig.frameId, floorId: 'side_yard', artId: 'outdoor_art', position: { x: -8, y: 1, z: 4 }, rotation: 0, dimensions: schema.furnitureDimensions(G.data.furnitureById[G.data.creativeConfig.frameId]) } }, G.data.furnitureById);
    state.building = schema.executeCommand(state.building, { type: 'furniture.add', furniture: { id: 'outdoor_table', defId: 'nightstand_basic', floorId: 'side_yard', position: { x: -8, y: 0, z: 5 }, rotation: .2, dimensions: schema.furnitureDimensions(G.data.furnitureById.nightstand_basic) } }, G.data.furnitureById);
    state.inventory.yard_streetlamp = 9999;
  });
  const yard = yardSnapshot(G), arts = plain(G.state.customArts); let garden = plain(G.state.garden);
  assert.equal(G.sys.houseBlueprints.preview('starter').selected, true, '围合庭院不能使当前房型变成可清空重建');
  let inventory;
  for (const [id, count, floors] of [['cloud', 3, 1], ['castle', 4, 1], ['star_castle', 6, 2]]) {
    const status = success(G.sys.houseBlueprints.preview(id)); assert.equal(status.canApply, true); assert.equal(status.roomCount, count); assert.equal(status.floorCount, floors); assert.equal(status.capacity, count * 2);
    assert.equal(status.building.floors.length, floors + 2); assert.equal(status.returnedInventory.yard_streetlamp, undefined); assert.equal(status.removedPaintings.length, 0);
    assert.ok(status.roomAssignments.every(assignment => status.rooms.some(room => room.id === assignment.roomId && !G.sys.houseBlueprints.isYardFloor(room.floorId))));
    const previewYard = status.building.furniture.find(item => item.id === 'kept_yard_lamp'); previewYard.position.x = 999;
    assert.equal(G.state.building.furniture.find(item => item.id === 'kept_yard_lamp').position.x, 11, '预览保留实体也必须是独立副本');
    if (id === 'cloud') { success(G.sys.garden.plant(1, 'daisy')); garden = plain(G.state.garden); assert.equal(G.sys.houseBlueprints.preview(id).quote, status.quote, '确认期间实际播种不应被换房覆盖或使物质报价过期'); }
    success(G.sys.houseBlueprints.apply(id, status.quote)); assert.deepEqual(yardSnapshot(G), yard); assert.deepEqual(plain(G.state.garden), garden); assert.deepEqual(plain(G.state.customArts), arts);
    assert.equal(G.state.inventory.yard_streetlamp, 9999, '保留院子不因满包拒绝或增长库存');
    if (inventory) assert.deepEqual(plain(G.state.inventory), inventory, '后续换房不能反复回收同一庭院实体'); inventory = plain(G.state.inventory);
    assert.equal(G.sys.houseBlueprints.preview(id).selected, true);
  }
  const restored = setup(plain(G.state)); assert.deepEqual(yardSnapshot(restored.G), yard); assert.deepEqual(plain(restored.G.state.garden), garden); assert.equal(restored.G.state.inventory.bed_basic, 1);
});

test('存量错放室内层的庭院家具与yard身份实体迁回零高度legacy_yard，只改floorId', () => {
  const env = setup(), { G, schema } = env; fund(G); success(apply(G, 'starter')); const floorId = G.state.building.floors[0].id;
  G.store.update(state => {
    for (const item of [
      { id: 'misplaced_yard_lamp', defId: 'yard_streetlamp', position: { x: 4, y: .1, z: 5 }, rotation: .7, color: '#AACCDD' },
      { id: 'misplaced_yard_table', defId: 'nightstand_basic', legacyRoomId: 'yard', position: { x: -5, y: 0, z: 4 }, rotation: -.4 }
    ]) state.building = schema.executeCommand(state.building, { type: 'furniture.add', furniture: Object.assign({}, item, { floorId, dimensions: schema.furnitureDimensions(G.data.furnitureById[item.defId]) }) }, G.data.furnitureById);
    state.inventory.yard_streetlamp = 9999; state.inventory.nightstand_basic = 9999;
  });
  const before = plain(G.state), status = success(G.sys.houseBlueprints.preview('cloud'));
  assert.equal(status.canApply, true); assert.deepEqual(plain(status.returnedInventory), {}); assert.equal(status.floorCount, 1); assert.equal(status.building.floors.length, 2);
  success(G.sys.houseBlueprints.apply('cloud', status.quote)); assert.equal(G.state.building.floors.find(floor => floor.id === 'legacy_yard').elevation, 0);
  for (const item of before.building.furniture) assert.deepEqual(plain(G.state.building.furniture.find(value => value.id === item.id)), Object.assign({}, item, { floorId: 'legacy_yard' }));
  assert.deepEqual(plain(G.state.inventory), before.inventory);
  const yard = yardSnapshot(G); success(apply(G, 'mushroom')); assert.deepEqual(yardSnapshot(G), yard); assert.deepEqual(plain(G.state.inventory), before.inventory);
});

test('已有schema2而归档庭院仍有物件时，不从archive重新造家具或重复发回包库存', () => {
  const { G } = setup(); fund(G); success(apply(G, 'starter'));
  G.store.update(state => { state.house.yard.items = [{ uid: 'old_returned_lamp', defId: 'yard_streetlamp', x: 0, y: 20, z: 0, flip: false, color: null }]; state.inventory.yard_streetlamp = 1; });
  const archive = plain(G.state.house.yard), inventory = plain(G.state.inventory);
  for (const id of ['mushroom', 'cloud']) { success(apply(G, id)); assert.equal(G.state.building.furniture.length, 0); assert.deepEqual(plain(G.state.inventory), inventory); assert.deepEqual(plain(G.state.house.yard), archive); }
});

test('十二位已入住朋友迁居六间真实空房，每间两位，只改地址保留全部生活与奖励凭据', () => {
  const { G } = setup(); fund(G); const oldRooms = Array.from({ length: 6 }, (_, index) => spaces.buildSpace(G, 0, index).roomId);
  G.store.update(state => { G.data.residents.forEach((definition, index) => { state.residents[definition.id] = resident(oldRooms[Math.floor(index / 2)], index); }); });
  const before = plain(G.state), status = G.sys.houseBlueprints.preview('star_castle'); assert.equal(status.roomAssignments.length, 12); assert.equal(status.canApply, true);
  const result = success(G.sys.houseBlueprints.apply('star_castle', status.quote)), occupancy = {};
  for (const id of Object.keys(before.residents)) {
    const next = plain(G.state.residents[id]), old = before.residents[id]; assert.ok(G.contentSpaces.get(next.roomId)); assert.equal(result.roomMaps.before[id], old.roomId); assert.equal(result.roomMaps.after[id], next.roomId);
    occupancy[next.roomId] = (occupancy[next.roomId] || 0) + 1; delete next.roomId; delete old.roomId; assert.deepEqual(next, old);
  }
  assert.equal(Object.keys(occupancy).length, 6); assert.ok(Object.values(occupancy).every(count => count === 2));
  assert.equal(G.state.building.furniture.length, 0); assert.deepEqual(plain(G.state.quests), before.quests); assert.deepEqual(plain(G.state.avatar), before.avatar);
  assert.equal(G.state.wallet.coin, before.wallet.coin); assert.equal(G.state.wallet.heart, before.wallet.heart - 45);
  unchanged(G, () => apply(G, 'starter')); unchanged(G, () => apply(G, 'castle')); assert.equal(Object.keys(G.state.residents).length, 12);
});

test('换房不跳过新朋友原本的家具入住条件，摆好真实床后仍可邀请', () => {
  const { G } = setup(); success(apply(G, 'starter')); assert.equal(G.sys.residents.eligibility('lily').ok, false);
  const room = G.contentSpaces.list()[0]; assert.ok(room); spaces.placeItem(G, 'bed_basic', room.id); assert.ok(G.sys.residents.eligibility('lily').ok); success(G.sys.residents.invite('lily', room.id));
});

test('背包9999上限会预先阻止整栋替换，不丢失任何已摆物品', () => {
  const { G } = setup(); fund(G); const room = spaces.buildSpace(G, 0, 0).roomId; spaces.placeItem(G, 'bed_basic', room);
  G.store.update(state => { state.inventory.bed_basic = 9999; }); const status = G.sys.houseBlueprints.preview('cloud'); assert.equal(status.canApply, false); assert.match(status.reason, /9999/); unchanged(G, () => G.sys.houseBlueprints.apply('cloud', status.quote));
});

test('旧报价绑定建筑/库存/钱/地址/作品身份且跨相同内容换档拒绝，好友计时好感不干扰', () => {
  const { G } = setup(); fund(G); const room = spaces.buildSpace(G, 0, 0).roomId;
  G.store.update(state => { state.residents.lily = resident(room); }); const quote = G.sys.houseBlueprints.preview('cloud').quote;
  G.store.update(state => { state.profile.playTimeSec += 30; state.residents.lily.affection += 2; state.residents.lily.happiness += 1; state.residents.lily.lastBubbleAt += 10; });
  assert.equal(G.sys.houseBlueprints.preview('cloud').quote, quote); success(G.sys.houseBlueprints.apply('cloud', quote)); assert.equal(G.state.residents.lily.affection, 502);
  for (const mutate of [state => { state.inventory.bed_basic++; }, state => { state.wallet.coin++; }, state => { state.residents.lily.roomId = 'changed_room'; }, state => { state.house.exterior.roofColor = '#AABBCC'; }, state => { state.customArts.push({ id: 'another_art', name: '另一幅', pixels: '.'.repeat(256) }); }]) {
    const old = G.sys.houseBlueprints.preview('castle').quote; G.store.update(mutate); unchanged(G, () => G.sys.houseBlueprints.apply('castle', old));
  }
  const old = G.sys.houseBlueprints.preview('castle').quote; G.store.replace(G.state); unchanged(G, () => G.sys.houseBlueprints.apply('castle', old));
  for (const id of ['unknown', '__proto__', 'constructor', null, {}, ['starter']]) assert.equal(G.sys.houseBlueprints.preview(id).ok, false);
  for (const invalid of [undefined, null, {}, [], 1, '']) unchanged(G, () => G.sys.houseBlueprints.apply('castle', invalid));
});

test('同房型按真实几何识别，换ID/摆家具/挂画或墙纸后不能误点再清空', () => {
  const { G, schema } = setup(); fund(G); success(apply(G, 'starter')); const room = G.contentSpaces.list()[0]; spaces.placeItem(G, 'bed_basic', room.id);
  G.store.update(state => {
    state.customArts.push({ id: 'same_plan_art', name: '自己的装饰', pixels: '.'.repeat(256) });
    state.building = schema.executeCommand(state.building, { type: 'wall.decorate', wallIds: [state.building.walls[0].id], artId: 'same_plan_art' }, G.data.furnitureById);
    const ids = new Map(state.building.walls.map((wall, index) => [wall.id, 'renamed_wall_' + index]));
    state.building.walls.forEach(wall => { wall.id = ids.get(wall.id); wall.color = '#EEDDDD'; }); state.building.openings.forEach(opening => { opening.wallId = ids.get(opening.wallId); });
  });
  const before = JSON.stringify(G.state), status = G.sys.houseBlueprints.preview('starter'); assert.equal(status.selected, true); assert.equal(status.canApply, false); assert.equal(G.sys.houseBlueprints.apply('starter', status.quote).unchanged, true); assert.equal(JSON.stringify(G.state), before);
});

test('真实存储拒写/只读门禁均零半份，旧盘面与人物/库存保持，不发完成事件', () => {
  const env = setup(), { G } = env; fund(G); const room = spaces.buildSpace(G, 0, 0).roomId; spaces.placeItem(G, 'bed_basic', room); yardFixture(env); plantedGarden(G); assert.ok(G.save.flush());
  let events = 0; for (const name of ['house:rebuilt', 'exterior:bought', 'exterior:changed']) G.bus.on(name, () => events++);
  const status = G.sys.houseBlueprints.preview('cloud'), before = JSON.stringify(G.state), disk = env.memory.get(G.data.balance.saveKey), count = env.writes();
  env.deny(true); unchanged(G, () => G.sys.houseBlueprints.apply('cloud', status.quote)); env.deny(false);
  assert.equal(env.writes(), count); assert.equal(env.memory.get(G.data.balance.saveKey), disk); assert.equal(events, 0); assert.equal(JSON.stringify(G.state), before);
  G.store.setWriteGuard(() => ({ ok: false, message: '隔离只读' })); assert.equal(G.sys.houseBlueprints.preview('cloud').canApply, false); unchanged(G, () => G.sys.houseBlueprints.apply('cloud', status.quote)); G.store.setWriteGuard(null);
  G.runtime.mode = 'visit'; assert.equal(G.sys.houseBlueprints.preview('cloud').canApply, false); unchanged(G, () => apply(G, 'cloud')); G.runtime.mode = 'explore';
  success(G.sys.houseBlueprints.apply('cloud', status.quote)); assert.equal(events, 3);
});

test('保存/状态/完成事件重入不会重复回收或扣款，重复旧按钮也拒绝', () => {
  const env = setup(), { G } = env; fund(G); const room = spaces.buildSpace(G, 0, 0).roomId; spaces.placeItem(G, 'bed_basic', room);
  const status = G.sys.houseBlueprints.preview('cloud'), before = plain(G.state), count = env.writes(), nested = [];
  for (const name of ['save:committed', 'state:change', 'house:rebuilt']) G.bus.on(name, () => nested.push(apply(G, 'castle')));
  success(G.sys.houseBlueprints.apply('cloud', status.quote)); assert.equal(nested.length, 3); assert.ok(nested.every(result => !result.ok)); assert.equal(env.writes(), count + 1);
  assert.equal(G.state.wallet.coin, before.wallet.coin - 140); assert.equal(G.state.inventory.bed_basic, before.inventory.bed_basic + 1); assert.equal(G.state.memories.length, before.memories.length + 1);
  unchanged(G, () => G.sys.houseBlueprints.apply('cloud', status.quote));
});

test('新整栋、回收与朋友地址能完整JSON校验恢复，导入不会再从旧归档重复迁移', () => {
  const env = setup(), { G } = env; fund(G); const room = spaces.buildSpace(G, 0, 0).roomId; spaces.placeItem(G, 'bed_basic', room); success(G.sys.residents.invite('lily', room));
  success(apply(G, 'star_castle')); const saved = JSON.stringify(G.state), restored = setup(JSON.parse(saved));
  assert.deepEqual(plain(restored.G.state), JSON.parse(saved)); assert.ok(restored.G.contentSpaces.get(restored.G.state.residents.lily.roomId)); assert.equal(restored.G.state.building.furniture.length, 0);
  assert.deepEqual(plain(restored.G.store.validate(restored.G.state)), JSON.parse(saved)); assert.equal(restored.G.sys.houseBlueprints.preview('star_castle').selected, true);
  assert.deepEqual(JSON.parse(env.memory.get(G.data.balance.saveKey)), JSON.parse(saved));
});

for (const { name, run } of tests) { run(); console.log('✓ ' + name); }
console.log('房型蓝图 ' + tests.length + ' 组通过。');
