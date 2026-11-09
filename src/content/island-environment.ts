import { createClayModels } from './clay-models.js';
import type { HomeLandscapeLayout } from './home-landscape';
import { buildArtTree, buildMarshmallowCloud } from './art-landscape';

type Triple = [number, number, number];
export interface ClayGeometry {
  box(position: Triple, size: Triple, color: string, radius?: number, rotation?: number[]): unknown;
  sphere(position: Triple, size: Triple, color: string, segments?: number, rings?: number): unknown;
  cloudSphere?(position: Triple, size: Triple, color: string, segments?: number, rings?: number): unknown;
  cylinder(position: Triple, radius: number, height: number, color: string, topRadius?: number, segments?: number, rotation?: number[]): unknown;
  roof(position: Triple, width: number, depth: number, height: number, color: string): unknown;
}
export interface IslandEnvironmentSpec {
  x: number; z: number; y: number; radius: number;
  entry?: { x: number; z: number };
  entryDirection?: { x: number; z: number };
  layout?: HomeLandscapeLayout;
}

/** 原型前院的纯内容组合；只输出资产，不持有Engine、相机、进度或网络。 */
export function buildIslandEnvironment(g: ClayGeometry, models: ReturnType<typeof createClayModels>, spec: IslandEnvironmentSpec) {
  const { x, z, y, radius: r } = spec;
  const size = Math.max(.8, Math.min(1.25, r / 6));
  const local = (dx: number, dy: number, dz: number): Triple => [x + dx, y + dy, z + dz];
  const yard = spec.layout?.yard, garden = spec.layout?.garden, house = spec.layout?.house;
  models.island(g, x, z, r, y - .06, true);
  buildArtTree(g, 'ginkgo', house ? house.minX - .9 : x - r * .7, house ? house.minZ - .7 : z - r * .27, size * .9, y);
  buildArtTree(g, 'christmas', garden ? garden.maxX + .35 : x + r * .72, garden ? garden.minZ - .3 : z + r * .02, size * .83, y);
  models.tree(g, yard ? yard.minX - .6 : x - r * .65, yard ? yard.maxZ - .45 : z + r * .42, size * .62, y, '#BAD193', 'fruit');

  // 白色圆头栅栏、奶油长椅和莓红邮箱沿用原型的散件比例。
  const fenceX = yard ? yard.minX - x + .12 : -r * .62, fenceZ = yard ? yard.maxZ - z + .30 : r * .64;
  for (let i = 0; i < 6; i++) {
    const px = fenceX + i * .43 * size;
    g.box(local(px, .34 * size, fenceZ), [.12 * size, .64 * size, .12 * size], '#FFFAF0', .045);
    g.sphere(local(px, .69 * size, fenceZ), [.085 * size, .09 * size, .085 * size], '#FFFAF0', 10, 6);
  }
  for (const height of [.23, .48]) g.box(local(fenceX + 1.075 * size, height * size, fenceZ), [2.3 * size, .075 * size, .08 * size], '#FFF2D9', .025);
  const benchX = yard ? yard.minX - x - 1.0 : -r * .55, benchZ = yard ? yard.center.z - z + .35 : r * .25;
  for (const dx of [-.55, .55]) for (const dz of [-.17, .17]) g.box(local(benchX + dx * size, .29 * size, benchZ + dz * size), [.08 * size, .58 * size, .08 * size], '#43877F', .03);
  g.box(local(benchX, .62 * size, benchZ), [1.5 * size, .14 * size, .53 * size], '#F4D988', .05);
  g.box(local(benchX, .93 * size, benchZ - .22 * size), [1.5 * size, .5 * size, .11 * size], '#F4D988', .05);
  const mailX = yard ? yard.minX - x - .35 : -r * .25, mailZ = yard ? yard.minZ - z + .2 : r * .7;
  g.cylinder(local(mailX, .54 * size, mailZ), .065 * size, 1.08 * size, '#BC8868', undefined, 10);
  g.box(local(mailX, 1.1 * size, mailZ), [.58 * size, .4 * size, .4 * size], '#C86E87', .1);
  g.box(local(mailX, 1.13 * size, mailZ + .23 * size), [.39 * size, .05 * size, .025 * size], '#FFF2D9', .015);

  for (let i = 0; i < 16; i++) {
    const px = (yard ? yard.minX - x - .32 : -r * .65) + Math.floor(i / 8) * .25 * size, pz = (yard ? yard.minZ - z + .15 : r * .56) + (i % 8) * .35 * size;
    models.flower(g, x + px, z + pz, ['#FFFAF0', '#F4D988', '#ECA6BD'][i % 3], .75 * size, y);
  }
  for (let i = 0; i < 6; i++) models.flower(g, garden ? garden.maxX + .15 : x + r * .38 + i * .23, garden ? garden.maxZ - 1.4 + i * .25 : z + r * .53 - i * .12, i % 2 ? '#FFFAF0' : '#ECA6BD', .75 * size, y);
  for (const [px, pz, tone] of [[yard ? yard.minX - x + .25 : -r * .29, yard ? yard.minZ - z - .20 : r * .37, '#87BCB0'], [garden ? garden.minX - x - .2 : r * .3, garden ? garden.minZ - z + .15 : r * .38, '#ECA6BD']] as const) {
    g.cylinder(local(px, .14, pz), .2, .28, tone, .25, 14);
    g.cylinder(local(px, .3, pz), .27, .065, tone, undefined, 14);
    models.flower(g, x + px, z + pz, '#FFFAF0', 1.15, y + .3);
  }

  const teaX = yard ? yard.maxX - x + .85 : r * .22, teaZ = yard ? yard.maxZ - z - .3 : r * .65;
  g.cylinder(local(teaX, .61 * size, teaZ), .56 * size, .1 * size, '#FFF2D9', undefined, 24);
  g.cylinder(local(teaX, .32 * size, teaZ), .075 * size, .55 * size, '#BC8868', undefined, 10);
  g.cylinder(local(teaX, .055 * size, teaZ), .3 * size, .09 * size, '#FFF2D9', undefined, 14);
  g.cylinder(local(teaX, .71 * size, teaZ), .1 * size, .11 * size, '#ECA6BD', undefined, 12);
  for (const [dx, dz] of [[.7, -.12], [-.4, .5]]) {
    g.cylinder(local(teaX + dx * size, .22 * size, teaZ + dz * size), .22 * size, .4 * size, '#BC8868', undefined, 14);
    g.cylinder(local(teaX + dx * size, .45 * size, teaZ + dz * size), .26 * size, .12 * size, '#F4D988', undefined, 16);
  }
  if (spec.entry) {
    const vx = spec.entry.x - x, vz = spec.entry.z - z, length = Math.hypot(vx, vz) || 1;
    const dx = spec.entryDirection?.x ?? vx / length, dz = spec.entryDirection?.z ?? vz / length;
    for (let i = 1; i <= 6; i++) {
      const distance = .25 + i * .31, bend = Math.sin(i / 6 * Math.PI) * .3;
      g.box([spec.entry.x + dx * distance - dz * bend, y + .025, spec.entry.z + dz * distance + dx * bend], [.36, .045, .27], '#EDDEBE', .09, [0, -.2 - i * .06, 0]);
    }
  }

  if (garden) {
    // 同一主岛上的园区边界；真实作物由renderer复用garden描述单独绘制。
    g.box([garden.center.x, y + .005, garden.center.z], [garden.width - .12, .025, garden.depth - .12], '#C5D8AB', .14);
    for (const side of [-1, 1]) {
      const fx = garden.center.x + side * garden.width / 2;
      for (let i = 0; i < 5; i++) {
        const fz = garden.minZ + i * garden.depth / 5;
        g.box([fx, y + .29, fz], [.095, .57, .095], '#FFF2D9', .035);
        g.sphere([fx, y + .59, fz], [.065, .065, .065], '#ECA6BD', 10, 6);
      }
      for (const height of [.22, .43]) g.box([fx, y + height, garden.center.z - garden.depth / 10], [.065, .065, garden.depth * .8], '#FFF2D9', .025);
    }
    for (let i = 0; i < 7; i++) {
      const fx = garden.minX + i * garden.width / 6;
      g.box([fx, y + .3, garden.minZ], [.095, .58, .095], '#FFF2D9', .035);
    }
    for (const height of [.23, .44]) g.box([garden.center.x, y + height, garden.minZ], [garden.width, .07, .07], '#FFF2D9', .025);
    // 园区正面留开口，短路连向真实院子，篱笆不把花圃围死。
    for (let i = 0; i < 4; i++) g.box([garden.center.x - i * .28, y + .025, garden.maxZ + .20 + i * .12], [.35, .045, .27], '#EDDEBE', .09, [0, -.2, 0]);
  }

  // 远岛为无账号、无交互的背景景物，绝不冒充在线邻居。
  for (const [dx, dz, scale] of [[-1.48, -.7, .28]] as const) {
    const ix = x + r * dx, iz = z + r * dz, ir = r * scale, iy = y - .55;
    models.island(g, ix, iz, ir, iy, true);
    g.box([ix, iy + .66, iz], [.95, 1.2, .85], '#FFF2D9', .075);
    g.roof([ix, iy + 1.25, iz], 1.18, 1.07, .49, scale > .25 ? '#87BCB0' : '#B9AED5');
    g.box([ix, iy + .44, iz + .45], [.25, .7, .05], '#43877F', .07);
    g.box([ix + .27, iy + .81, iz + .45], [.22, .24, .05], '#A9D4D7', .025);
    models.tree(g, ix - ir * .58, iz + ir * .1, .35, iy, '#B8C78B', 'foliage');
  }
  for (const [dx, dz, scale] of [[-1.25, .5, 1.2], [.8, -1.15, 1.4], [1.38, .85, .95], [-.9, -1.2, 1.0], [.0, 1.6, 2.0]] as const) {
    buildMarshmallowCloud(g, x + dx * r, y - 1.45, z + dz * r, scale * Math.max(1, r / 5.5));
  }
}
