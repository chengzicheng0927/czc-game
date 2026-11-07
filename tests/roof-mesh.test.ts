import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoofSurface } from '../src/content/roof-surface';
import { createRoofVertexData } from '../src/building/roof-mesh';

const roof = () => createRoofSurface({ polygon: [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 3 }, { x: -3, z: 3 }] });
test('实际Babylon顶点转换后屋面向上受光，底面向下，不产生凹碗式反向阴影', () => {
  const surface = roof();
  for (const underside of [false, true]) {
    const data = createRoofVertexData(surface, { baseHeight: 2.86, underside });
    const normals = Array.from(data.normals!);
    for (let i = 1; i < normals.length; i += 3) assert.ok(underside ? normals[i] < 0 : normals[i] > 0);
    assert.equal(data.indices!.length, surface.indices.length);
  }
});
test('双层薄屋面保持真实占地、连续高度与8厘米厚度，大跨度按比例缩小不截平屋脊', () => {
  const surface = roof(), scale = .6, base = 5.1;
  const top = Array.from(createRoofVertexData(surface, { baseHeight: base, heightScale: scale }).positions!);
  const bottom = Array.from(createRoofVertexData(surface, { baseHeight: base, heightScale: scale, underside: true }).positions!);
  for (let i = 0; i < top.length; i++) {
    if (i % 3 === 1) {
      assert.ok(Math.abs(top[i] - bottom[i] - .08) < 1e-9);
      assert.ok(Math.abs(top[i] - base - surface.positions[i] * scale) < 1e-9);
    } else assert.equal(top[i], surface.positions[i]);
  }
  assert.ok(Math.abs(Math.max(...top.filter((_, i) => i % 3 === 1)) - base - surface.peak.height * scale) < 1e-9);
});
test('转换不修改共享几何，纹理按4米世界尺度连续，重复预览结果一致', () => {
  const surface = roof(), before = JSON.stringify([surface.positions, surface.indices, surface.uvs]);
  const first = createRoofVertexData(surface, { baseHeight: 2.8 });
  const second = createRoofVertexData(surface, { baseHeight: 2.8 });
  assert.deepEqual(first.positions, second.positions); assert.deepEqual(first.indices, second.indices);
  assert.deepEqual(first.uvs, surface.uvs.map(value => value / 4));
  assert.equal(JSON.stringify([surface.positions, surface.indices, surface.uvs]), before);
});
