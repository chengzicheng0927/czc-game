import type { ClayGeometry } from './island-environment';
import { starProfile, type ExteriorGeometry, type ProfilePoint } from './exterior-details';

type Triple = [number, number, number];
const tau = Math.PI * 2;
/** 银杏与圣诞树是围绕完整枝干生成的实体；不使用朝向相机的PNG平面。 */
export function buildArtTree(g: ClayGeometry, kind: 'ginkgo' | 'christmas', x: number, z: number, s = 1, y = 0) {
  const point = (dx: number, dy: number, dz: number): Triple => [x + dx * s, y + dy * s, z + dz * s];
  const sphere = (p: Triple, size: Triple, tone: string, segments = 12) => g.sphere(point(...p), size.map(v => v * s) as Triple, tone, segments, 8);
  const cylinder = (p: Triple, radius: number, height: number, tone: string, top = radius, rotation?: number[]) => g.cylinder(point(...p), radius * s, height * s, tone, top * s, 16, rotation);
  const branch = (a: Triple, b: Triple, radius: number, top: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dy, dz);
    cylinder([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], radius, length, '#AC7555', top, [Math.atan2(dz, dy), 0, -Math.asin(dx / length)]);
  };
  const profile = (g as Partial<ExteriorGeometry>).profile?.bind(g);
  sphere([0, .025, 0], [.70, .022, .56], '#A5BD8D');
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * tau;
    branch([0, .32, 0], [Math.cos(a) * .34, .035, Math.sin(a) * .34], .10, .055);
  }
  if (kind === 'ginkgo') {
    branch([0, .05, 0], [-.10, .82, .025], .17, .12);
    branch([-.10, .82, .025], [.06, 1.55, -.025], .12, .065);
    branch([.06, 1.55, -.025], [-.12, 2.25, -.10], .065, .025);
    // 扇形叶片有厚度；三层叶簇绕树干分布，背面与俯视也保留枝叶体积。
    const fan: ProfilePoint[] = [{ x: 0, y: 0 }, { x: -.18, y: .38 }];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * .08 + i / 14 * Math.PI * .84;
      fan.push({ x: -Math.cos(a) * .5, y: .34 + Math.sin(a) * .61 - (i % 2 ? .035 : 0) });
    }
    fan.push({ x: .18, y: .38 });
    const tones = ['#F6C348', '#FFD76B', '#E9AC37', '#F5C653'];
    for (let level = 0; level < 3; level++) {
      const count = level === 2 ? 5 : 7, baseY = 1.40 + level * .39, radius = .65 - level * .14;
      for (let i = 0; i < count; i++) {
        const a = (i / count + level * .13) * tau, px = Math.cos(a) * radius, pz = Math.sin(a) * radius;
        branch([.025, baseY - .34, 0], [px, baseY + .05, pz], .045 - level * .008, .02);
        sphere([px * .85, baseY + .13, pz * .85], [.30, .23, .30], tones[(i + level) % tones.length], 14);
        for (let leaf = 0; leaf < 2; leaf++) {
          const angle = a + (leaf ? .36 : -.28), lp: Triple = [px + Math.cos(angle) * .12, baseY + .04 + leaf * .19, pz + Math.sin(angle) * .12];
          if (profile) profile(fan, point(...lp), [.48 * s, .43 * s, .05 * s], tones[(i + leaf + level) % tones.length], [-.22, Math.PI / 2 - angle, leaf ? -.15 : .13]);
          else sphere(lp, [.26, .21, .10], tones[(i + leaf) % tones.length]);
        }
      }
    }
    // 几片落叶只作环境装饰，不进入背包或种植计时。
    for (let i = 0; i < 3; i++) sphere([-.40 + i * .34, .045, .27 + i % 2 * .14], [.10, .018, .08], '#F6C348', 10);
    return;
  }
  cylinder([0, .37, 0], .15, .73, '#AC7555', .10);
  const greens = ['#5D8E69', '#729B70', '#82A574', '#96B17F'];
  for (let level = 0; level < 4; level++) {
    const baseY = .64 + level * .43, r = .91 - level * .17;
    cylinder([0, baseY + .27, 0], r, .65, greens[level], r * .12);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9 + level * .06) * tau;
      sphere([Math.cos(a) * r * .72, baseY + .035, Math.sin(a) * r * .72], [r * .34, .13, r * .30], greens[level], 12);
    }
  }
  // 灯串由实体金线短段和奶油灯珠环绕一整圈，旋转到背面仍连续。
  for (let i = 0; i < 32; i++) {
    const t = i / 31, a = t * tau * 2.6, h = .83 + t * 1.35, r = .91 - t * .57;
    const p: Triple = [Math.cos(a) * r, h, Math.sin(a) * r];
    if (i) {
      const u = (i - 1) / 31, previousA = u * tau * 2.6, previousR = .91 - u * .57;
      const q: Triple = [Math.cos(previousA) * previousR, .83 + u * 1.35, Math.sin(previousA) * previousR];
      const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2], length = Math.hypot(dx, dy, dz);
      cylinder([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], .014, length, '#E8C56A', .014, [Math.atan2(dz, dy), 0, -Math.asin(dx / length)]);
    }
    if (i % 2 === 0) sphere([p[0], p[1] - .035, p[2]], [.037, .05, .037], '#FFF0AF', 10);
    if (i % 5 === 2) sphere([p[0] * 1.03, p[1] - .11, p[2] * 1.03], [.095, .105, .095], i % 2 ? '#E1C998' : '#CC6A83', 12);
  }
  sphere([0, 2.46, 0], [.11, .12, .11], '#F4D387', 14);
  if (profile) {
    profile(starProfile(), point(0, 2.43, 0), [.36 * s, .36 * s, .10 * s], '#F4D387');
    profile(starProfile(), point(0, 2.43, 0), [.36 * s, .36 * s, .10 * s], '#F4D387', [0, Math.PI / 2, 0]);
  }
}

/** 宽腹与非对称云峰形成完整三维云团，绕看不会暴露一张贴图。 */
export function buildMarshmallowCloud(g: ClayGeometry, x: number, y: number, z: number, s = 1) {
  const ball = g.cloudSphere ? g.cloudSphere.bind(g) : g.sphere.bind(g);
  for (const [dx, dy, dz, rx, ry, rz, tone] of [
    [0, -.08, 0, 1.53, .33, .77, '#F6F2FF'],
    [-.98, .02, .04, .63, .35, .58, '#FFF9F1'],
    [-.43, .35, -.07, .72, .56, .62, '#FFFDF8'],
    [.38, .55, -.03, .65, .68, .62, '#FFFDF8'],
    [.99, .11, .06, .65, .41, .58, '#FBEFF5'],
    [-.12, .06, .42, 1.12, .29, .41, '#FFFAF4'],
  ] as const) ball([x + dx * s, y + dy * s, z + dz * s], [rx * s, ry * s, rz * s], tone, 18, 10);
}
