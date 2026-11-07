import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyDocument, validateDocument, executeCommand, deriveSpaces, migrateLegacyHouse,
  type BuildingDocument, type BuildingCommand, type Wall, type Point2,
} from '../src/building/domain';
import { furnitureDimensions, type FurnitureCatalog } from '../src/building/catalog';

const catalog: FurnitureCatalog = {
  bed_basic: { id: 'bed_basic', template: 'bed', place: 'floor', w: 130, h: 70 },
  table_basic: { id: 'table_basic', template: 'coffee_table', place: 'floor', w: 70, h: 35 },
  lamp_basic: { id: 'lamp_basic', template: 'desk_lamp', place: 'table', w: 25, h: 35 },
  custom_panel: { id: 'custom_panel', template: 'frame', place: 'wall', w: 60, h: 50 },
  bench_basic: { id: 'bench_basic', template: 'yard', motif: 'bench', place: 'yard', w: 100, h: 70 },
};
function wall(id: string, start: Point2, end: Point2, floorId = 'floor_0'): Wall {
  return { id, floorId, start, end, height: 2.8, thickness: .16, color: '#F4DDE7' };
}
function polygon(points: Point2[], initial = createEmptyDocument(), prefix = 'wall'): BuildingDocument {
  return points.reduce((doc, start, index) => executeCommand(doc, {
    type: 'wall.add', wall: wall(`${prefix}_${index}`, start, points[(index + 1) % points.length]),
  }), initial);
}
function square(size = 4): BuildingDocument {
  return polygon([{ x: 0, z: 0 }, { x: size, z: 0 }, { x: size, z: size }, { x: 0, z: size }]);
}
function furnitureCommand(): BuildingCommand {
  return { type: 'furniture.add', furniture: { id: 'bed_one', defId: 'bed_basic', floorId: 'floor_0', position: { x: 2, y: 0, z: 2 }, rotation: Math.PI / 4, dimensions: furnitureDimensions(catalog.bed_basic) } };
}

test('空地块建立任意角度闭合墙、真实门窗数据、家具移动、JSON恢复的完整领域闭环', () => {
  const empty = createEmptyDocument(), before = JSON.stringify(empty);
  let doc = polygon([{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 4 }, { x: -2, z: 2 }]);
  const spaces = deriveSpaces(doc, 'floor_0');
  assert.equal(spaces.length, 1); assert.equal(spaces[0].area, 8);
  doc = executeCommand(doc, { type: 'opening.add', opening: { id: 'door_one', wallId: 'wall_0', kind: 'door', offset: .5, width: .9, height: 2.1, sill: 0 } });
  doc = executeCommand(doc, { type: 'opening.add', opening: { id: 'window_one', wallId: 'wall_1', kind: 'window', offset: .6, width: 1.1, height: 1, sill: 1 } });
  doc = executeCommand(doc, furnitureCommand(), catalog);
  doc = executeCommand(doc, { type: 'furniture.move', id: 'bed_one', position: { x: 0, y: 0, z: 2 }, rotation: Math.PI / 2 }, catalog);
  assert.equal(doc.revision, 8); assert.equal(doc.openings.length, 2);
  assert.deepEqual(doc.furniture[0].position, { x: 0, y: 0, z: 2 });
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc)), catalog), doc);
  assert.equal(JSON.stringify(empty), before, '命令不能修改调用方原文档');
});

test('穿过外墙的分隔墙按真实交点切分空间，而非固定矩形槽位', () => {
  let doc = square();
  doc = executeCommand(doc, { type: 'wall.add', wall: wall('divider_x', { x: 2, z: -1 }, { x: 2, z: 5 }) });
  assert.deepEqual(deriveSpaces(doc, 'floor_0').map(space => space.area).sort(), [8, 8]);
  doc = executeCommand(doc, { type: 'wall.add', wall: wall('divider_z', { x: -1, z: 2 }, { x: 5, z: 2 }) });
  const spaces = deriveSpaces(doc, 'floor_0');
  assert.equal(spaces.length, 4); assert.equal(spaces.reduce((area, space) => area + space.area, 0), 16);
});

test('开放墙和T形悬空墙不虚构房间，闭环中的桥边不污染边界', () => {
  const open = executeCommand(createEmptyDocument(), { type: 'wall.add', wall: wall('open', { x: 0, z: 0 }, { x: 3, z: 2 }) });
  assert.deepEqual(deriveSpaces(open, 'floor_0'), []);
  const branch = executeCommand(square(), { type: 'wall.add', wall: wall('branch', { x: 2, z: 0 }, { x: 2, z: 2 }) });
  assert.equal(deriveSpaces(branch, 'floor_0').length, 1); assert.equal(deriveSpaces(branch, 'floor_0')[0].area, 16);
  let separate = polygon([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }]);
  separate = polygon([{ x: 4, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 }, { x: 4, z: 2 }], separate, 'other');
  separate = executeCommand(separate, { type: 'wall.add', wall: wall('bridge', { x: 2, z: 1 }, { x: 4, z: 1 }) });
  assert.equal(deriveSpaces(separate, 'floor_0').length, 2);
  assert.equal(deriveSpaces(separate, 'floor_0').reduce((area, space) => area + space.area, 0), 8);
});

test('凹多边形和嵌套闭环的空间面积准确，内环成为洞而非重叠实心房', () => {
  const concave = polygon([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }]);
  assert.equal(deriveSpaces(concave, 'floor_0')[0].area, 12);
  const nested = polygon([{ x: 2, z: 2 }, { x: 4, z: 2 }, { x: 4, z: 4 }, { x: 2, z: 4 }], square(8), 'inner');
  const spaces = deriveSpaces(nested, 'floor_0');
  assert.equal(spaces.length, 2); assert.deepEqual(spaces.map(space => space.area).sort((a, b) => a - b), [4, 60]);
  assert.equal(spaces.find(space => space.area === 60)?.holes?.length, 1);
});

test('门窗必须完整位于墙上，重叠、悬空门和非法引用都拒绝且不改文档', () => {
  const base = square(), before = JSON.stringify(base);
  const door = { id: 'door', wallId: 'wall_0', kind: 'door' as const, offset: 1, width: 1, height: 2.1, sill: 0 };
  const withDoor = executeCommand(base, { type: 'opening.add', opening: door });
  const invalid = [
    { ...door, wallId: 'missing' }, { ...door, offset: 3.5 }, { ...door, height: 3 },
    { ...door, sill: .1 }, { ...door, width: 0 },
  ];
  for (const opening of invalid) assert.throws(() => executeCommand(base, { type: 'opening.add', opening }));
  assert.throws(() => executeCommand(withDoor, { type: 'opening.add', opening: { ...door, id: 'overlap', kind: 'window', sill: 1, height: 1 } }), /重叠/);
  const transom = executeCommand(withDoor, { type: 'opening.add', opening: { ...door, id: 'above_door', kind: 'window', sill: 2.2, height: .5 } });
  assert.equal(transom.openings.length, 2, '不相交的门上高窗应合法');
  assert.equal(JSON.stringify(base), before);
});

test('删除墙级联删除所属开口，删除家具与开口独立且不删除楼层', () => {
  let doc = executeCommand(square(), { type: 'opening.add', opening: { id: 'door', wallId: 'wall_0', kind: 'door', offset: 1, width: 1, height: 2.1, sill: 0 } });
  doc = executeCommand(doc, furnitureCommand(), catalog);
  const removed = executeCommand(doc, { type: 'entity.remove', id: 'wall_0' }, catalog);
  assert.equal(removed.walls.length, 3); assert.equal(removed.openings.length, 0); assert.equal(removed.furniture.length, 1);
  assert.equal(doc.openings.length, 1, '原文档仍保留门');
  assert.equal(executeCommand(removed, { type: 'entity.remove', id: 'bed_one' }, catalog).furniture.length, 0);
  assert.throws(() => executeCommand(removed, { type: 'entity.remove', id: 'floor_0' }));
});

test('拒绝未来版本、缺失字段、危险字段、NaN、重复编号、非法楼层和整体越界', () => {
  const doc = square();
  const invalid: unknown[] = [
    { ...doc, schema: 3 }, { ...doc, revision: -1 }, { ...doc, revision: .5 },
    { ...doc, furniture: undefined }, { ...doc, unexpected: true },
    { ...doc, walls: [{ ...doc.walls[0], end: { x: NaN, z: 2 } }] },
    { ...doc, walls: [{ ...doc.walls[0], start: { x: 1001, z: 0 } }] },
    { ...doc, floors: [...doc.floors, { ...doc.floors[0] }] },
    { ...doc, walls: [{ ...doc.walls[0], floorId: 'missing' }] },
    JSON.parse('{"schema":2,"revision":0,"floors":[],"walls":[],"openings":[],"furniture":[],"__proto__":{"polluted":true}}'),
  ];
  for (const raw of invalid) assert.throws(() => validateDocument(raw));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  const command = furnitureCommand(); assert.equal(command.type, 'furniture.add');
  if (command.type !== 'furniture.add') return;
  command.furniture.position.x = 999.9;
  assert.throws(() => executeCommand(doc, command, catalog), /整体超出/);
});

test('墙体可任意角度但不能零长或共线重复，首尾相接仍合法', () => {
  const doc = executeCommand(createEmptyDocument(), { type: 'wall.add', wall: wall('first', { x: 0, z: 0 }, { x: 4, z: 2 }) });
  assert.throws(() => executeCommand(doc, { type: 'wall.add', wall: wall('zero', { x: 1, z: 1 }, { x: 1, z: 1 }) }));
  assert.throws(() => executeCommand(doc, { type: 'wall.add', wall: wall('duplicate', { x: 3, z: 1.5 }, { x: 1, z: .5 }) }), /重复叠画/);
  assert.equal(executeCommand(doc, { type: 'wall.add', wall: wall('continued', { x: 4, z: 2 }, { x: 6, z: 3 }) }).walls.length, 2);
});

test('家具尺寸来自真实模板米制尺寸，不随旧二维图标w/h变化', () => {
  assert.deepEqual(furnitureDimensions({ id: 'one', template: 'bed', w: 10, h: 900 }), furnitureDimensions({ id: 'two', template: 'bed', w: 5000, h: 1 }));
  assert.deepEqual(furnitureDimensions(catalog.bed_basic), { width: 1.45, height: .72, depth: 2.05 });
  assert.deepEqual(furnitureDimensions({ id: 'custom', dimensions: { width: 2, height: 1, depth: 3 } }), { width: 2, height: 1, depth: 3 });
  const first = furnitureDimensions(catalog.bed_basic); first.width = 99;
  assert.equal(furnitureDimensions(catalog.bed_basic).width, 1.45, '返回值不能污染共享尺寸表');
});

test('墙纸命令只修改真实墙面作品引用，批量失败不发生半次提交', () => {
  const doc = square(), changed = executeCommand(doc, { type: 'wall.decorate', wallIds: ['wall_0', 'wall_1'], artId: 'art_one' });
  assert.equal(changed.walls[0].artId, 'art_one'); assert.equal(changed.walls[1].artId, 'art_one');
  assert.equal(doc.walls[0].artId, undefined);
  assert.throws(() => executeCommand(doc, { type: 'wall.decorate', wallIds: ['wall_0', 'missing'], artId: 'art_one' }));
  assert.equal(doc.walls[0].artId, undefined);
  const removed = executeCommand(changed, { type: 'wall.decorate', wallIds: ['wall_0'], artId: null });
  assert.equal(removed.walls[0].artId, undefined); assert.equal(removed.walls[1].artId, 'art_one');
  assert.throws(() => executeCommand(doc, { type: 'wall.decorate', wallIds: [], artId: 'art_one' }));
});

test('普通墙纸直接存入真实墙，保留花纹与颜色、清除作品引用，失败时整次不提交', () => {
  const source = executeCommand(square(), {type:'wall.decorate',wallIds:['wall_0'],artId:'art_one'});
  const finished = executeCommand(source, {type:'wall.finish',wallIds:['wall_0','wall_1'],color:'#BDECD6',pattern:'dots'});
  assert.equal(finished.walls[0].color,'#BDECD6'); assert.equal(finished.walls[0].pattern,'dots');
  assert.equal(finished.walls[0].artId,undefined); assert.equal(source.walls[0].artId,'art_one');
  assert.equal(validateDocument(JSON.parse(JSON.stringify(finished))).walls[1].pattern,'dots');
  assert.throws(()=>executeCommand(source,{type:'wall.finish',wallIds:['wall_0','missing'],color:'#BDECD6',pattern:'stripes'}));
  assert.equal(source.walls[0].pattern,undefined);
  assert.throws(()=>validateDocument({...finished,walls:[{...finished.walls[0],pattern:'unknown'},...finished.walls.slice(1)]}));
});

function legacyFixture() {
  const item = (uid: string, defId: string, extra = {}) => ({ uid, defId, x: 30, y: 100, z: 1, flip: false, color: null, parent: null, ...extra });
  const room = (type: string, items: unknown[]) => ({ type, wallpaper: { pattern: 'solid', color: '#FFDDDD', color2: '#FFFFFF' }, floor: { pattern: 'wood', color: '#CCAA88' }, light: 'warm', items, paidPrice: 100 });
  return {
    version: 1, wallet: { coin: 721, heart: 10 }, inventory: { bed_basic: 3 },
    house: {
      name: '原来的小屋', floors: [{ slots: ['room_one', null, null] }, { slots: [null, 'room_two', null] }],
      rooms: {
        room_one: room('bedroom', [item('bed_uid', 'bed_basic', { depth: .75 }), item('art_uid', 'custom_panel', { artId: 'art_saved' }), item('table_uid', 'table_basic', { depth: .5 }), item('lamp_uid', 'lamp_basic', { parent: 'table_uid' })]),
        room_two: room('kitchen', []),
      },
      attic: { type: 'observatory', paidPrice: 1000, builtAt: 123, room: room('observatory', [item('attic_lamp_uid', 'lamp_basic')]) },
      yard: { items: [item('yard_bench_uid', 'bench_basic', { x: -100, y: 80 })] },
    },
    customArts: [{ id: 'art_saved', name: '旧作品', pixels: '.'.repeat(256) }],
  };
}

test('迁移保留全部家具UID/定义、房间关联、楼层、挂画、庭院和阁楼，不扣库存', () => {
  const save = legacyFixture(), before = JSON.stringify(save), migrated = migrateLegacyHouse(save, catalog);
  assert.equal(JSON.stringify(save), before, '迁移不能修改存档、钱包或库存');
  assert.equal(migrated.schema, 2); assert.equal(migrated.floors.length, 4); assert.equal(migrated.walls.length, 12);
  assert.deepEqual(migrated.furniture.map(item => item.id).sort(), ['art_uid', 'attic_lamp_uid', 'bed_uid', 'lamp_uid', 'table_uid', 'yard_bench_uid']);
  assert.equal(migrated.furniture.find(item => item.id === 'art_uid')?.artId, 'art_saved');
  assert.equal(migrated.furniture.find(item => item.id === 'yard_bench_uid')?.floorId, 'legacy_yard');
  assert.equal(migrated.furniture.find(item => item.id === 'attic_lamp_uid')?.legacyRoomId, 'attic:observatory');
  assert.equal(migrated.furniture.find(item => item.id === 'lamp_uid')?.position.y, furnitureDimensions(catalog.table_basic).height);
  assert.deepEqual(migrated.migration?.rooms.map(room => room.id), ['room_one', 'room_two', 'attic:observatory']);
  assert.equal(deriveSpaces(migrated, 'legacy_floor_0')[0].legacyRoomId, 'room_one');
});

test('迁移幂等，已有自由建筑即使旧house改动也绝不覆盖；公开去迁移信息仍可恢复', () => {
  const save = legacyFixture(), migrated = migrateLegacyHouse(save, catalog);
  const revised = executeCommand(migrated, { type: 'wall.add', wall: wall('new_free_wall', { x: 15, z: 5 }, { x: 18, z: 7 }, 'legacy_floor_0') });
  save.house.rooms.room_one.items = [];
  assert.deepEqual(migrateLegacyHouse({ ...save, building: revised }, catalog), revised);
  assert.deepEqual(migrateLegacyHouse(revised, catalog), revised);
  const publicDoc = JSON.parse(JSON.stringify(revised)); delete publicDoc.migration;
  publicDoc.furniture.forEach((item: { legacyRoomId?: string }) => { delete item.legacyRoomId; });
  assert.deepEqual(validateDocument(publicDoc, catalog), publicDoc);
});

test('旧像素墙纸迁移为真实墙面作品引用，不丢掉原来的挂画', () => {
  const save = legacyFixture();
  Object.assign(save.house.rooms.room_one.wallpaper, { pattern: 'custom', artId: 'art_saved' });
  const migrated = migrateLegacyHouse(save, catalog);
  assert.equal(migrated.walls.filter(wall => wall.artId === 'art_saved').length, 4);
  assert.equal(migrated.furniture.find(item => item.id === 'art_uid')?.artId, 'art_saved');
});

test('迁移不会以默认值掩盖无效家具、未来版本或危险字段', () => {
  const future = legacyFixture(); future.version = 99;
  assert.throws(() => migrateLegacyHouse(future, catalog), /版本/);
  const broken = legacyFixture(); (broken.house.rooms.room_one.items[0] as { uid: string }).uid = '';
  assert.throws(() => migrateLegacyHouse(broken, catalog), /编号/);
  assert.throws(() => migrateLegacyHouse({ house: JSON.parse('{"floors":[],"rooms":{},"constructor":{"prototype":{}}}') }, catalog), /危险/);
  assert.throws(() => validateDocument({ ...createEmptyDocument(), furniture: [{ ...(furnitureCommand() as Extract<BuildingCommand, { type: 'furniture.add' }>).furniture, defId: 'not_owned_in_catalog' }] }, catalog), /目录/);
});

test('添加独立楼层只改变新文档，空间推导严格区分楼层', () => {
  const original = square(), added = executeCommand(original, { type: 'floor.add', floor: { id: 'upper', name: '二楼', elevation: 3 } });
  assert.equal(original.floors.length, 1); assert.equal(added.floors.length, 2);
  assert.deepEqual(deriveSpaces(added, 'upper'), []); assert.equal(deriveSpaces(added, 'floor_0').length, 1);
  assert.throws(() => deriveSpaces(added, 'missing'), /不存在/);
});
