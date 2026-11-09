import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeLandscapeLayout, type LandscapeBounds } from '../src/content/home-landscape';

const cottage = { minX: -2.1, maxX: 2.1, minZ: -1.7, maxZ: 1.7 };
const castle = { minX: -3.6, maxX: 3.6, minZ: -2.8, maxZ: 2.8 };
const overlap = (a: LandscapeBounds, b: LandscapeBounds) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('小屋和城堡都扩到至少9.5米主岛，真正留出3.5米前院', () => {
  for (const house of [cottage, castle]) {
    const layout = createHomeLandscapeLayout(house);
    assert.ok(layout.island.radius >= 9.5); assert.ok(layout.yard.depth >= 3.5);
    assert.ok(layout.yard.minZ > house.maxZ, '院子在真实屋体前方');
    assert.ok(!overlap(layout.house, layout.yard)); assert.ok(!overlap(layout.house, layout.garden)); assert.ok(!overlap(layout.yard, layout.garden));
    assert.ok(layout.garden.minX > house.maxX, '真实园区在右侧，不能穿进房间');
  }
});

test('非常窄的小屋也不能让最小院宽挤进花圃', () => {
  const layout = createHomeLandscapeLayout({ minX: 2, maxX: 2.8, minZ: -1, maxZ: 1 });
  assert.ok(!overlap(layout.yard, layout.garden)); assert.ok(!overlap(layout.house, layout.garden));
});

test('摆放或移动院子家具不挪院子、园圃或主岛中心，避免布局正反馈', () => {
  const before = createHomeLandscapeLayout(castle), moved = createHomeLandscapeLayout(castle, [{ x: 18, z: 9 }, { x: -12, z: 4 }]);
  assert.deepEqual(moved.yard, before.yard); assert.deepEqual(moved.garden, before.garden);
  assert.equal(moved.island.x, before.island.x); assert.equal(moved.island.z, before.island.z);
  assert.ok(moved.island.radius > before.island.radius, '原有远处家具只扩包围半径');
});

test('主岛包住屋体、院子、九块花圃区域及原有家具', () => {
  const placed = [{ x: 19, z: -4 }, { x: -11, z: 15 }], layout = createHomeLandscapeLayout(castle, placed);
  for (const zone of [layout.house, layout.yard, layout.garden]) for (const x of [zone.minX, zone.maxX]) for (const z of [zone.minZ, zone.maxZ]) assert.ok(Math.hypot(x - layout.island.x, z - layout.island.z) < layout.island.radius);
  for (const p of placed) assert.ok(Math.hypot(p.x - layout.island.x, p.z - layout.island.z) < layout.island.radius - .9);
});

test('园区容纳真实3列9地块缩放布局，不靠假作物填满景物', () => {
  const layout = createHomeLandscapeLayout(cottage), scale = layout.garden.scale;
  const nineWidth = (100 * 3 + 18 * 2) / 100 * 1.55 * scale;
  const nineDepth = (66 * 3 + 20 * 2) / 75 * 1.55 * scale;
  assert.ok(nineWidth + .5 < layout.garden.width); assert.ok(nineDepth + .5 < layout.garden.depth);
});

test('整体平移真实房屋时布局等量平移，不被世界原点牵走', () => {
  const base = createHomeLandscapeLayout(cottage), dx = 23, dz = -17;
  const moved = createHomeLandscapeLayout({ minX: cottage.minX + dx, maxX: cottage.maxX + dx, minZ: cottage.minZ + dz, maxZ: cottage.maxZ + dz });
  for (const key of ['yard', 'garden'] as const) {
    assert.ok(Math.abs(moved[key].center.x - base[key].center.x - dx) < 1e-10);
    assert.ok(Math.abs(moved[key].center.z - base[key].center.z - dz) < 1e-10);
  }
  assert.ok(Math.abs(moved.island.x - base.island.x - dx) < 1e-10); assert.ok(Math.abs(moved.island.z - base.island.z - dz) < 1e-10);
  assert.ok(Math.abs(moved.island.radius - base.island.radius) < 1e-10);
});

test('纯布局不改调用方房屋或家具坐标，返回的区域可独立使用', () => {
  const house = { ...cottage }, placed = [{ x: 4, z: 7 }], before = JSON.stringify({ house, placed });
  const layout = createHomeLandscapeLayout(house, placed); layout.house.minX = -99;
  assert.equal(JSON.stringify({ house, placed }), before); assert.deepEqual(createHomeLandscapeLayout(house, placed).house, cottage);
});
