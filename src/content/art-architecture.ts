import type { RoofSurface } from './roof-surface';
import type { ExteriorGeometry } from './exterior-details';
import type { Point2 } from '../building/domain';

export interface ArtRoofOptions { base: number; heightScale: number; style: string; tone: string }
const tint = (hex: string, light: number) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + light)).toString(16).padStart(2, '0')).join('');

/** 真实连续屋面上的软陶瓦、蘑菇斑和云肩；不创建第二套房间或以设定图遮住房屋。 */
export function buildArtRoofDetails(g: ExteriorGeometry, surface: RoofSurface, options: ArtRoofOptions) {
  const { base, heightScale: scale, style, tone } = options;
  const height = (x: number, z: number) => surface.heightAt({ x, z }) * scale;
  const ring = surface.rings[0], xs = ring.map(p => p.x), zs = ring.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  // 厚檐沿真实边界连续绕行，转角用短半径软帽连接；内洞保留。
  for (const boundary of surface.rings) for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const nx = dz / length, nz = -dx / length, yaw = -Math.atan2(dz, dx);
    g.box([(a.x + b.x) / 2 + nx * .075, base - .035, (a.z + b.z) / 2 + nz * .075], [length + .10, .19, .34], '#FFF0D8', .075, [0, yaw, 0]);
    g.box([(a.x + b.x) / 2 + nx * .09, base + .035, (a.z + b.z) / 2 + nz * .09], [length + .10, .085, .31], style === 'roof_cloud' ? '#D7E7EB' : tone, .035, [0, yaw, 0]);
    g.sphere([a.x + nx * .06, base - .025, a.z + nz * .06], [.18, .105, .18], '#FFF0D8', 12, 8);
  }
  const has = (p: Point2, margin = .10) => height(p.x, p.z) > margin;
  const slope = (x: number, z: number) => {
    const dx = (height(x + .06, z) - height(x - .06, z)) / .12;
    const dz = (height(x, z + .06) - height(x, z - .06)) / .12;
    return [-Math.atan(dz), 0, Math.atan(dx)];
  };
  if (['roof_triangle', 'roof_castle', 'roof_starry'].includes(style)) {
    // 瓦片的高度与法向读取同一屋面，不照设定PNG烘焙光影；每栋最多约110片。
    const stepX = Math.max(.63, (maxX - minX) / 12), stepZ = Math.max(.59, (maxZ - minZ) / 9);
    let row = 0;
    for (let z = minZ + stepZ * .42; z < maxZ; z += stepZ, row++) for (let x = minX + stepX * (.44 + row % 2 * .48); x < maxX; x += stepX) {
      const corners = [[x - stepX * .43, z - stepZ * .40], [x + stepX * .43, z - stepZ * .40], [x - stepX * .43, z + stepZ * .40], [x + stepX * .43, z + stepZ * .40]];
      if (!corners.every(([px, pz]) => has({ x: px, z: pz }, .025))) continue;
      g.box([x, base + height(x, z) + .035, z], [stepX * .95, .065, stepZ * .94], row % 3 ? tone : tint(tone, 8), .035, slope(x, z));
    }
  } else if (style === 'roof_mushroom') {
    // 独立浅奶油斑块紧贴连续蘑菇帽；中央偏大的斑点使远看仍能识别房型。
    const width = maxX - minX, depth = maxZ - minZ;
    const spots = [[.19,.29,.23],[.38,.22,.30],[.68,.28,.24],[.82,.50,.18],[.24,.66,.27],[.53,.54,.36],[.68,.77,.25],[.42,.83,.17]];
    for (const [u, v, r] of spots) {
      const x = minX + u * width, z = minZ + v * depth;
      if (!has({ x, z }, .1)) continue;
      g.box([x, base + height(x, z) + .038, z], [r * 1.6, .065, r * 1.2], '#FFF0D5', .032, slope(x, z));
    }
  } else if (style === 'roof_cloud') {
    const width = maxX - minX, depth = maxZ - minZ;
    for (const [u, v, r] of [[.18,.38,.60],[.40,.30,.71],[.67,.31,.68],[.83,.49,.51],[.25,.66,.61],[.51,.58,.77],[.72,.67,.60]]) {
      const x = minX + u * width, z = minZ + v * depth;
      if (!has({ x, z }, .12)) continue;
      g.sphere([x, base + height(x, z) - .035, z], [r, .20 + r * .12, r * .72], tone, 16, 10);
    }
  }
}
