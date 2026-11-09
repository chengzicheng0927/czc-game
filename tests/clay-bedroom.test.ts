import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createClayModels } from '../src/content/clay-models.js';
import { furnitureDimensions, type FurnitureCatalog } from '../src/building/catalog';

// 使用正式内容目录，不以另一份家具定义替代运行输入；不接触玩家存档。
const sandbox = vm.createContext({ console });
sandbox.window = sandbox;
for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js']) {
  vm.runInContext(fs.readFileSync(path.resolve(file), 'utf8'), sandbox, { filename: file });
}
const data = sandbox.Game.data;
const catalog: FurnitureCatalog = data.furnitureById;
const ids = ['bed_basic', 'nightstand_basic', 'desk_lamp_basic', 'wardrobe_basic'] as const;
type Point = [number, number, number];
type Rotation = readonly number[] | undefined;
const epsilon = 1e-8;

function rotate(point: Point, rotation?: Rotation): Point {
  if (!rotation) return [...point];
  const matrix = Matrix.RotationYawPitchRoll(rotation[1] || 0, rotation[0] || 0, rotation[2] || 0);
  const value = Vector3.TransformCoordinates(Vector3.FromArray(point), matrix);
  return [value.x, value.y, value.z];
}

// 记录体积的保守包络，并应用真实adapter同序的局部Euler旋转。
// 不断言具体部件数量、装饰位置或颜色；改造型仍应满足相同米制边界。
function geometryRecorder() {
  const points: Point[] = [];
  const corners = (position: Point, radius: Point, color: string, rotation?: Rotation) => {
    for (const value of [...position, ...radius]) assert.ok(Number.isFinite(value), '几何参数必须有限');
    assert.ok(radius.every(value => value > 0), '实体各轴必须有正厚度');
    assert.match(color, /^#[0-9a-f]{6}$/i);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const local = rotate([x * radius[0], y * radius[1], z * radius[2]], rotation);
      points.push(local.map((value, axis) => value + position[axis]) as Point);
    }
  };
  return {
    points,
    box(position: Point, size: Point, color: string, _radius?: number, rotation?: Rotation) {
      corners(position, size.map(value => value / 2) as Point, color, rotation);
    },
    sphere(position: Point, radius: Point, color: string, _segments?: number, _rings?: number, rotation?: Rotation) {
      corners(position, radius, color, rotation);
    },
    cylinder(position: Point, radius: number, height: number, color: string, topRadius?: number, _segments?: number, rotation?: Rotation) {
      const widest = Math.max(radius, topRadius ?? radius);
      corners(position, [widest, height / 2, widest], color, rotation);
    },
    profile(ring: { x: number; y: number }[], position: Point, size: Point, color: string, rotation?: Rotation) {
      assert.ok(ring.length >= 3, '轮廓必须能围合成有厚度的实体');
      assert.match(color, /^#[0-9a-f]{6}$/i);
      assert.ok(size.every(value => Number.isFinite(value) && value > 0));
      for (const point of ring) for (const side of [-1, 1]) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        const local = rotate([point.x * size[0], point.y * size[1], side * size[2] / 2], rotation);
        points.push(local.map((value, axis) => value + position[axis]) as Point);
      }
    },
  };
}

function envelope(points: Point[], rotation?: Rotation, translation: Point = [0, 0, 0]) {
  assert.ok(points.length > 0, '正式内容ID必须生成实体几何');
  const transformed = points.map(point => rotate(point, rotation).map((value, axis) => value + translation[axis]));
  return {
    min: [0, 1, 2].map(axis => Math.min(...transformed.map(point => point[axis]))),
    max: [0, 1, 2].map(axis => Math.max(...transformed.map(point => point[axis]))),
  };
}

for (const id of ids) test(`${id}真实几何不超出正式目录包络，底部中心支点支持移动与旋转`, () => {
  const definition = catalog[id];
  assert.ok(definition, 'ID必须来自实际内容目录');
  const dimensions = furnitureDimensions(definition);
  const recorder = geometryRecorder();
  assert.equal(createClayModels(data).furniture(recorder, definition, {}, [0, 0, 0], [dimensions.width, dimensions.height, dimensions.depth]), true);
  const base = envelope(recorder.points);
  assert.ok(Math.abs(base.min[1]) < epsilon, '地面家具的支点必须接地');
  assert.ok(base.max[1] <= dimensions.height + epsilon, '不能用超高床头或木冠越过选中包络');
  assert.ok(base.max[1] >= dimensions.height * .8, '高家具应保留实际高度，不能压成图卡');
  for (const [axis, width] of [[0, dimensions.width], [2, dimensions.depth]]) {
    assert.ok(base.min[axis] >= -width / 2 - epsilon, '部件不能越过占地负边界');
    assert.ok(base.max[axis] <= width / 2 + epsilon, '部件不能越过占地正边界');
    assert.ok(base.max[axis] - base.min[axis] >= width * .8, '几何必须具有真实三维进深');
  }
  for (const yaw of [Math.PI / 2, .73, Math.PI]) {
    const offset: Point = [3.1, 2.65, -4.2];
    const turned = envelope(recorder.points, [0, yaw, 0], offset);
    const halfX = (Math.abs(Math.cos(yaw)) * dimensions.width + Math.abs(Math.sin(yaw)) * dimensions.depth) / 2;
    const halfZ = (Math.abs(Math.sin(yaw)) * dimensions.width + Math.abs(Math.cos(yaw)) * dimensions.depth) / 2;
    assert.ok(turned.min[0] >= offset[0] - halfX - epsilon && turned.max[0] <= offset[0] + halfX + epsilon);
    assert.ok(turned.min[2] >= offset[2] - halfZ - epsilon && turned.max[2] <= offset[2] + halfZ + epsilon);
    assert.ok(Math.abs(turned.min[1] - offset[1]) < epsilon, '旋转和上楼不得改变底部支点');
  }
});

test('卧室模型渲染不改写内容目录、实体、位置或尺寸输入', () => {
  const state = { customArts: [], inventory: { bed_basic: 1 } };
  const beforeData = JSON.stringify(data), beforeState = JSON.stringify(state);
  for (const id of ids) {
    const definition = Object.freeze({ ...catalog[id] });
    const item = Object.freeze({ id: 'fixture_' + id, defId: id, color: '#D789A2', flip: true, rotation: .73 });
    const origin = Object.freeze([1.2, .58, -2.2]) as unknown as Point;
    const size = furnitureDimensions(definition);
    const dimensions = Object.freeze([size.width, size.height, size.depth]);
    const before = JSON.stringify({ definition, item, origin, dimensions });
    assert.equal(createClayModels(data, state).furniture(geometryRecorder(), definition, item, origin, dimensions), true);
    assert.equal(JSON.stringify({ definition, item, origin, dimensions }), before);
  }
  assert.equal(JSON.stringify(data), beforeData);
  assert.equal(JSON.stringify(state), beforeState);
});

test('台灯作为独立模型可准确落在真实床头柜台面，不暗中生成或依附另一实体', () => {
  const table = catalog.nightstand_basic, lamp = catalog.desk_lamp_basic;
  assert.equal(table.place, 'floor'); assert.equal(lamp.place, 'table');
  const tableSize = furnitureDimensions(table), lampSize = furnitureDimensions(lamp);
  const tableGeometry = geometryRecorder(), lampGeometry = geometryRecorder();
  const models = createClayModels(data);
  models.furniture(tableGeometry, table, {}, [0, 0, 0], [tableSize.width, tableSize.height, tableSize.depth]);
  const beforeTable = JSON.stringify(tableGeometry.points);
  models.furniture(lampGeometry, lamp, {}, [0, tableSize.height, 0], [lampSize.width, lampSize.height, lampSize.depth]);
  assert.ok(Math.abs(envelope(tableGeometry.points).max[1] - envelope(lampGeometry.points).min[1]) < epsilon);
  assert.equal(JSON.stringify(tableGeometry.points), beforeTable);
});
