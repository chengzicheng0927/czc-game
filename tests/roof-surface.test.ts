import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoofSurface, type RoofFootprint, type RoofSurface } from '../src/content/roof-surface';
import type { Point2 } from '../src/building/domain';

const point = (x: number, z: number): Point2 => ({ x, z });
const ring = (rows: number[][]): Point2[] => rows.map(([x, z]) => point(x, z));
const square: RoofFootprint = { polygon: ring([[0, 0], [4, 0], [4, 4], [0, 4]]) };
const lShape: RoofFootprint = { polygon: ring([[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]]) };
const courtyard: RoofFootprint = { polygon: ring([[0, 0], [7, 0], [7, 6], [0, 6]]), holes: [ring([[2, 2], [5, 2], [5, 4], [2, 4]])] };
const orient = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function distanceToSegment(p: Point2, a: Point2, b: Point2) {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function boundary(p: Point2, rings: Point2[][]) {
  return rings.some(values => values.some((a, i) => distanceToSegment(p, a, values[(i + 1) % values.length]) < 1e-7));
}
function inRing(p: Point2, values: Point2[]) {
  let result = false;
  for (let i = 0, j = values.length - 1; i < values.length; j = i++) {
    const a = values[j], b = values[i];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < a.x + (b.x - a.x) * (p.z - a.z) / (b.z - a.z)) result = !result;
  }
  return result;
}
function contains(p: Point2, rings: Point2[][]) {
  return boundary(p, rings) || inRing(p, rings[0]) && !rings.slice(1).some(hole => inRing(p, hole));
}
function vertex(surface: RoofSurface, index: number) { return point(surface.positions[index * 3], surface.positions[index * 3 + 2]); }
function checkMesh(surface: RoofSurface, expectedArea: number) {
  assert.equal(surface.positions.length % 3, 0); assert.equal(surface.indices.length, surface.triangleCount * 3);
  assert.equal(surface.normals.length, surface.positions.length); assert.equal(surface.uvs.length, surface.positions.length / 3 * 2);
  assert.ok(surface.positions.every(Number.isFinite)); assert.ok(surface.normals.every(Number.isFinite)); assert.ok(surface.uvs.every(Number.isFinite));
  const edges = new Map<string, { a: number; b: number; count: number }>(), coordinates = new Set<string>();
  for (let i = 0; i < surface.positions.length / 3; i++) {
    const p = vertex(surface, i), key = `${p.x.toFixed(10)}:${p.z.toFixed(10)}`;
    assert.ok(!coordinates.has(key), '相同XZ点必须复用同一个顶点，不能沿三角接缝各自取高'); coordinates.add(key);
    const nx = surface.normals[i * 3], ny = surface.normals[i * 3 + 1], nz = surface.normals[i * 3 + 2];
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-7); assert.ok(ny > 0, '屋面法线朝上');
    assert.ok(surface.positions[i * 3 + 1] >= 0);
    assert.equal(surface.uvs[i * 2], p.x); assert.equal(surface.uvs[i * 2 + 1], p.z);
    if (boundary(p, surface.rings)) assert.equal(surface.positions[i * 3 + 1], 0, '所有外檐和洞边严格从0开始');
  }
  let area = 0;
  for (let i = 0; i < surface.indices.length; i += 3) {
    const ids = surface.indices.slice(i, i + 3), p = ids.map(id => vertex(surface, id));
    const signed = orient(p[0], p[1], p[2]); assert.ok(signed < 0, '非退化三角形采用统一向上绕序'); area += -signed / 2;
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) {
      const c = 4 - a - b, sample = point((p[0].x * a + p[1].x * b + p[2].x * c) / 4, (p[0].z * a + p[1].z * b + p[2].z * c) / 4);
      assert.ok(contains(sample, surface.rings), '三角面不可跨盖凹口或内洞');
    }
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`, row = edges.get(key);
      if (row) row.count++; else edges.set(key, { a, b, count: 1 });
      // 屋面边不得穿过外轮廓或内洞边，只有端点接触和共线接触是合法的。
      const start = vertex(surface, a), end = vertex(surface, b);
      for (const values of surface.rings) for (let k = 0; k < values.length; k++) {
        const c = values[k], d = values[(k + 1) % values.length];
        assert.ok(!(orient(start, end, c) * orient(start, end, d) < -1e-13 && orient(c, d, start) * orient(c, d, end) < -1e-13), '屋面边不能横穿真实墙边');
      }
    }
  }
  assert.ok(Math.abs(area - expectedArea) < Math.max(1e-7, expectedArea * 1e-8), `覆盖面积应为${expectedArea}，实际${area}`);
  for (const edge of edges.values()) {
    assert.ok(edge.count === 1 || edge.count === 2, '面网格不可出现非流形共边');
    const a = vertex(surface, edge.a), b = vertex(surface, edge.b), mid = point((a.x + b.x) / 2, (a.z + b.z) / 2);
    if (edge.count === 1) assert.ok(boundary(mid, surface.rings), '内部单边意味着裂缝或T接缝');
    else assert.ok(Math.abs(surface.heightAt(mid) - (surface.positions[edge.a * 3 + 1] + surface.positions[edge.b * 3 + 1]) / 2) < 1e-7, '共享边的高度必须与最终顶点线性相连');
  }
  const stride = Math.max(3, Math.floor(surface.indices.length / 90 / 3) * 3);
  for (let i = 0; i < surface.indices.length; i += stride) {
    const ids = surface.indices.slice(i, i + 3); if (ids.length < 3) continue;
    const p = ids.map(id => vertex(surface, id)), center = point((p[0].x + p[1].x + p[2].x) / 3, (p[0].z + p[1].z + p[2].z) / 3), actual = ids.reduce((sum, id) => sum + surface.positions[id * 3 + 1], 0) / 3;
    assert.ok(Math.abs(surface.heightAt(center) - actual) < 1e-7, 'heightAt读取最终网格，不能另算一条悬空高度曲线');
  }
  assert.ok(surface.peak.height > 0); assert.ok(contains(surface.peak, surface.rings));
  assert.ok(Math.abs(surface.heightAt(surface.peak) - surface.peak.height) < 1e-7);
}

test('L形是连续薄坡面，凹口不被包围矩形或独立面包屋顶覆盖', () => {
  const roof = createRoofSurface(lShape, { sampleSize: .35 }); checkMesh(roof, 18);
  assert.equal(roof.heightAt(point(4, 4)), 0); assert.equal(roof.heightAt(point(-1, 1)), 0);
  assert.ok(roof.heightAt(point(1, 3.7)) > .1); assert.ok(roof.heightAt(point(4.5, 1)) > .1);
});

test('天井保留完整洞，外檐和内洞边均为0且屋面没有T接缝', () => {
  const roof = createRoofSurface(courtyard, { sampleSize: .42 }); checkMesh(roof, 36);
  assert.equal(roof.heightAt(point(3, 3)), 0); assert.equal(roof.heightAt(point(2, 3)), 0);
  assert.ok(roof.heightAt(point(1, 3)) > .1);
});

test('两个方向不同的合法天井都保留，孔索引不混入后一条边界', () => {
  const roof = createRoofSurface({
    polygon: ring([[0, 0], [8, 0], [8, 6], [0, 6]]),
    holes: [ring([[1, 1], [2.5, 1], [2.5, 2.5], [1, 2.5]]), ring([[4, 3], [4, 5], [6, 5], [6, 3]])],
  }, { sampleSize: .45 });
  checkMesh(roof, 41.75); assert.equal(roof.rings.length, 3);
  assert.equal(roof.heightAt(point(1.5, 1.5)), 0); assert.equal(roof.heightAt(point(5, 4)), 0);
  assert.ok(roof.heightAt(point(3.3, 1.2)) > .1);
});

test('斜墙与狭长通道覆盖真实边界，不依赖轴对齐分块', () => {
  const angle = .431, rotate = (p: Point2) => point(p.x * Math.cos(angle) - p.z * Math.sin(angle) + 5, p.x * Math.sin(angle) + p.z * Math.cos(angle) - 3);
  const rotated = createRoofSurface({ polygon: lShape.polygon.map(rotate) }, { sampleSize: .38 }); checkMesh(rotated, 18);
  assert.equal(rotated.heightAt(rotate(point(4, 4))), 0);
  const narrow = createRoofSurface({ polygon: ring([[0, 0], [4, 0], [4, .08], [.08, .08], [.08, 3], [0, 3]]) }, { sampleSize: .22 });
  checkMesh(narrow, 4 * .08 + 2.92 * .08);
});

test('预算耗尽仍原子拆分共享边、保留面积与洞，而不留下裂缝', () => {
  const roof = createRoofSurface(courtyard, { sampleSize: .001, maxTriangles: 128 });
  assert.ok(roof.triangleCount <= 128); checkMesh(roof, 36);
});

test('极小三角房即使粗采样也有正高度，不退化为没有内顶点的平板', () => {
  const roof = createRoofSurface({ polygon: ring([[0, 0], [.1, 0], [.03, .08]]) }, { sampleSize: 2, maxTriangles: 4 });
  checkMesh(roof, .004); assert.ok(roof.peak.height < .1);
});

test('三角款有明确缓坡，圆润款式沿同一足迹连续变高，UV保持世界米制', () => {
  const triangle = createRoofSurface(square, { sampleSize: .3, style: 'roof_triangle' }); checkMesh(triangle, 16);
  const heights = [.25, .7, 1.2, 1.7].map(x => triangle.heightAt(point(x, 2)));
  assert.ok(heights.every((height, i) => !i || height > heights[i - 1] + .1), '默认款不能是宽大平平台');
  for (const style of ['round', 'roof_starry', 'cloud', 'roof_mushroom', 'strawberry']) {
    const roof = createRoofSurface(square, { sampleSize: .3, style }); checkMesh(roof, 16);
    assert.ok(roof.heightAt(point(1, 2)) > triangle.heightAt(point(1, 2)) * 1.1);
  }
});

test('重复终点与共线冗余点可清理，输入不被修改且结果确定', () => {
  const source = { polygon: ring([[0, 0], [2, 0], [4, 0], [4, 4], [0, 4], [0, 0]]) }, before = JSON.stringify(source);
  const first = createRoofSurface(source, { sampleSize: .5 }), second = createRoofSurface(source, { sampleSize: .5 });
  assert.equal(JSON.stringify(source), before); assert.deepEqual(first.positions, second.positions); assert.deepEqual(first.indices, second.indices); checkMesh(first, 16);
});

test('退化、自交、相交/越界洞与无效预算明确拒绝，不生成NaN或盖洞兜底', () => {
  for (const value of [
    { polygon: ring([[0, 0], [1, 0], [2, 0]]) },
    { polygon: ring([[0, 0], [3, 3], [0, 3], [3, 0]]) },
    { polygon: [point(0, 0), point(1, 0), point(Infinity, 1)] },
    { ...square, holes: [ring([[3, 3], [5, 3], [5, 5], [3, 5]])] },
    { ...square, holes: [ring([[0, 1], [1, 1], [1, 2], [0, 2]])] },
    { ...square, holes: [ring([[1, 1], [3, 1], [3, 3], [1, 3]]), ring([[2, 2], [3.5, 2], [3.5, 3.5], [2, 3.5]])] },
  ]) assert.throws(() => createRoofSurface(value), RangeError);
  for (const options of [{ sampleSize: 0 }, { pitch: NaN }, { maxTriangles: 3 }, { maxTriangles: 1e9 }]) assert.throws(() => createRoofSurface(square, options), RangeError);
});
