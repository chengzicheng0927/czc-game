import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRoofFootprints, roofEaveHeight, type RoofFootprint } from '../src/content/roof-footprints';
import { createEmptyDocument, deriveSpaces, executeCommand, type Point2, type BuildingDocument } from '../src/building/domain';

const rectangle = (x: number, z: number, xx: number, zz: number): Point2[] => [{ x, z }, { x: xx, z }, { x: xx, z: zz }, { x, z: zz }];
const signed = (ring: Point2[]) => ring.reduce((sum, point, index) => { const next = ring[(index + 1) % ring.length]; return sum + point.x * next.z - point.z * next.x; }, 0) / 2;
const area = (values: RoofFootprint[]) => values.reduce((sum, footprint) => sum + signed(footprint.polygon) + (footprint.holes || []).reduce((holes, hole) => holes + signed(hole), 0), 0);
function walls(points: Point2[], doc = createEmptyDocument(), prefix = 'wall'): BuildingDocument {
  return points.reduce((value, start, index) => executeCommand(value, { type: 'wall.add', wall: { id: prefix + '_' + index, floorId: 'floor_0', start, end: points[(index + 1) % points.length], height: 2.8, thickness: .16, color: '#F4DDE7' } }), doc);
}
function assertSimple(ring: Point2[]) { assert.equal(new Set(ring.map(point => `${point.x},${point.z}`)).size, ring.length, '同一环不能在接角处重复顶点形成蝴蝶'); }
function freeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('真实矩形被内墙分房后合成一个四角屋顶，不保留内部房间檐线', () => {
  let doc = walls(rectangle(0, 0, 6, 4));
  doc = executeCommand(doc, { type: 'wall.add', wall: { id: 'partition', floorId: 'floor_0', start: { x: 2, z: 0 }, end: { x: 2, z: 4 }, height: 2.8, thickness: .16, color: '#F4DDE7' } });
  const spaces = deriveSpaces(doc, 'floor_0'); assert.equal(spaces.length, 2);
  const result = mergeRoofFootprints(spaces); assert.equal(result.length, 1); assert.deepEqual(result[0].polygon, rectangle(0, 0, 6, 4)); assert.equal(area(result), 24); assert.equal(result[0].holes, undefined);
});

test('真实L形房间内加分隔墙后仍是一片凹形占地，不补掉L缺角', () => {
  const outline = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 6 }, { x: 0, z: 6 }];
  let doc = walls(outline);
  doc = executeCommand(doc, { type: 'wall.add', wall: { id: 'partition', floorId: 'floor_0', start: { x: 0, z: 2 }, end: { x: 2, z: 2 }, height: 2.8, thickness: .16, color: '#F4DDE7' } });
  const spaces = deriveSpaces(doc, 'floor_0'); assert.equal(spaces.length, 2);
  const result = mergeRoofFootprints(spaces); assert.equal(result.length, 1); assert.deepEqual(result[0].polygon, outline); assert.equal(area(result), 20); assertSimple(result[0].polygon);
});

test('共线T端点先切边再抵消，一条长共享边可接两间短边房', () => {
  const spaces = [
    { polygon: rectangle(0, 0, 2, 4) },
    { polygon: rectangle(2, 0, 5, 1) },
    { polygon: rectangle(2, 1, 5, 4) },
  ];
  const result = mergeRoofFootprints(spaces); assert.equal(result.length, 1); assert.deepEqual(result[0].polygon, rectangle(0, 0, 5, 4)); assert.equal(area(result), 20);
  assert.deepEqual(mergeRoofFootprints(spaces.slice().reverse()), result, '房间输入顺序不影响合并结果');
});

test('四片绕庭院的占地合并后保留CW孔洞和CCW外边', () => {
  const result = mergeRoofFootprints([
    { polygon: rectangle(0, 0, 6, 2) }, { polygon: rectangle(0, 4, 6, 6) },
    { polygon: rectangle(0, 2, 2, 4) }, { polygon: rectangle(4, 2, 6, 4) },
  ]);
  assert.equal(result.length, 1); assert.deepEqual(result[0].polygon, rectangle(0, 0, 6, 6)); assert.equal(result[0].holes?.length, 1);
  assert.equal(signed(result[0].polygon), 36); assert.equal(signed(result[0].holes![0]), -4); assert.equal(area(result), 32); assertSimple(result[0].holes![0]);
});

test('已有孔洞不丢失，洞内独立小屋保持独立，真实填满孔洞的空间才消去洞', () => {
  const outer = { polygon: rectangle(0, 0, 8, 8), holes: [rectangle(2, 2, 6, 6).reverse()] };
  const retained = mergeRoofFootprints([outer]); assert.equal(retained[0].holes?.length, 1); assert.equal(area(retained), 48);
  const island = mergeRoofFootprints([outer, { polygon: rectangle(3, 3, 5, 5) }]); assert.equal(island.length, 2); assert.equal(island[0].holes?.length, 1); assert.equal(area(island), 52);
  const filled = mergeRoofFootprints([outer, { polygon: rectangle(2, 2, 6, 6) }]); assert.equal(filled.length, 1); assert.equal(filled[0].holes, undefined); assert.equal(area(filled), 64);
});

test('只角接和完全分离的屋体保持独立，不串出自交蝴蝶或跨空地屋盖', () => {
  const touching = mergeRoofFootprints([{ polygon: rectangle(0, 0, 2, 2) }, { polygon: rectangle(2, 2, 4, 4) }]);
  assert.equal(touching.length, 2); touching.forEach(value => { assert.equal(signed(value.polygon), 4); assertSimple(value.polygon); }); assert.equal(area(touching), 8);
  const separate = mergeRoofFootprints([{ polygon: rectangle(-5, 0, -3, 2) }, { polygon: rectangle(3, 0, 5, 2) }]);
  assert.equal(separate.length, 2); assert.equal(area(separate), 8);
});

test('斜边三角面合成真实斜墙轮廓，方向自动规范且保留输入不变', () => {
  const spaces = freeze([
    { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 2 }] },
    { polygon: [{ x: 2, z: 2 }, { x: 4, z: 4 }, { x: 4, z: 0 }] },
  ]), before = JSON.stringify(spaces);
  const result = mergeRoofFootprints(spaces); assert.equal(result.length, 1); assert.equal(area(result), 8);
  assert.deepEqual(result[0].polygon, [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }]);
  result[0].polygon[0].x = -100; assert.equal(JSON.stringify(spaces), before);
});

test('空输入返回空屋顶，拒绝非有限或退化的边界，不修改输入', () => {
  assert.deepEqual(mergeRoofFootprints([]), []);
  assert.throws(() => mergeRoofFootprints([{ polygon: [{ x: 0, z: 0 }, { x: NaN, z: 1 }, { x: 1, z: 0 }] }]), /有限/);
  assert.throws(() => mergeRoofFootprints([{ polygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }] }]), /退化/);
});

test('同层独立闭合屋体各取自己的真实墙高，远处开放高墙不抬高任何屋面', () => {
  let doc = walls(rectangle(0, 0, 4, 3));
  doc = { ...doc, walls: doc.walls.map(wall => ({ ...wall, height: 1.8 })) };
  doc = walls(rectangle(10, 0, 14, 3), doc, 'tall');
  doc = { ...doc, walls: doc.walls.map(wall => wall.id.startsWith('tall') ? { ...wall, height: 4.6 } : wall) };
  doc = executeCommand(doc, { type: 'wall.add', wall: { id: 'open_high', floorId: 'floor_0', start: { x: 20, z: 0 }, end: { x: 25, z: 0 }, height: 8, thickness: .16, color: '#F4DDE7' } });
  const footprints = mergeRoofFootprints(deriveSpaces(doc, 'floor_0'));
  const low = footprints.find(value => value.polygon.some(point => point.x === 0))!, tall = footprints.find(value => value.polygon.some(point => point.x === 10))!;
  assert.equal(roofEaveHeight(low, doc.walls), 1.8, '不能人为把矮墙至少抬到2.4米'); assert.equal(roofEaveHeight(tall, doc.walls), 4.6);
});

test('支承必须共线且有正长度重叠，排除只碰角/端点/T支线和内部高分隔墙', () => {
  const footprint = freeze({ polygon: rectangle(0, 0, 4, 4) });
  const supports = freeze([
    { start: { x: -2, z: 0 }, end: { x: 2, z: 0 }, height: 2.1 },
    { start: { x: 4, z: 0 }, end: { x: 6, z: 0 }, height: 7 },
    { start: { x: -1, z: -1 }, end: { x: 0, z: 0 }, height: 8 },
    { start: { x: 0, z: 2 }, end: { x: 4, z: 2 }, height: 9 },
    { start: { x: 2, z: 0 }, end: { x: 2, z: 4 }, height: 10 },
    { start: { x: 2, z: -2 }, end: { x: 2, z: 0 }, height: 11 },
  ]), before = JSON.stringify([footprint, supports]);
  assert.equal(roofEaveHeight(footprint, supports), 2.1); assert.equal(roofEaveHeight(footprint, supports.slice(1)), 2.8, '无支承时才使用兼容回退');
  assert.equal(JSON.stringify([footprint, supports]), before);
});

test('洞边及斜边的局部支承算真实高度，跨过洞内部的墙不算洞边支承', () => {
  const footprint = { polygon: rectangle(0, 0, 8, 8), holes: [rectangle(3, 3, 5, 5).reverse()] };
  assert.equal(roofEaveHeight(footprint, [
    { start: { x: 0, z: 0 }, end: { x: 8, z: 0 }, height: 2.2 },
    { start: { x: 3, z: 3 }, end: { x: 5, z: 3 }, height: 3.4 },
    { start: { x: 4, z: 3 }, end: { x: 4, z: 5 }, height: 9 },
  ]), 3.4);
  assert.equal(roofEaveHeight({ polygon: [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }] }, [
    { start: { x: 1, z: 1 }, end: { x: 3, z: 3 }, height: 1.65 },
    { start: { x: 4, z: 4 }, end: { x: 6, z: 6 }, height: 12 },
  ]), 1.65);
});
