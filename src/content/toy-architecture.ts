import type { Point2 } from '../building/domain';
import { heartProfile, starProfile, type ExteriorGeometry, type ProfilePoint } from './exterior-details';

export interface ArchitectureOpening {
  /** 实际开口在墙中心线上的世界端点；sill/height相对本次floorY。 */
  start: Point2;
  end: Point2;
  sill: number;
  height: number;
}
export interface ToyArchitectureOptions {
  floorY: number;
  eaveY: number;
  kind: 'cottage' | 'castle' | 'star_castle';
  roofColor: string;
  doors?: ArchitectureOpening[];
  windows?: ArchitectureOpening[];
  maxTowers?: number;
}
export interface ToyArchitectureResult { towerCount: number; decorationCount: number }
type Triple = [number, number, number];
type Edge = { a: Point2; b: Point2; length: number; dx: number; dz: number; outX: number; outZ: number };
type Corner = { p: Point2; before: Edge; after: Edge; outX: number; outZ: number; index: number };
type Tower = Corner & { center: Point2; radius: number; score: number };
const cream = '#FFF2DA', milk = '#FFFAF0', blush = '#E9ACC0', lilac = '#B8A5D5', butter = '#F4D68E';
const EPS = 1e-6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finitePoint = (p: Point2) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const cross = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const signedArea = (points: Point2[]) => points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.z - q.x * p.z; }, 0) / 2;
function distance(p: Point2, a: Point2, b: Point2) {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / length, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function mix(hex: string, light: number) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : blush;
  return '#' + [1, 3, 5].map(i => clamp(parseInt(value.slice(i, i + 2), 16) + light, 0, 255).toString(16).padStart(2, '0')).join('');
}
function makeEdge(a: Point2, b: Point2): Edge {
  const length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
  return { a, b, length, dx, dz, outX: dz, outZ: -dx };
}
function openingOnEdge(opening: ArchitectureOpening, edge: Edge) {
  if (distance(opening.start, edge.a, edge.b) > .09 || distance(opening.end, edge.a, edge.b) > .09) return null;
  const a = (opening.start.x - edge.a.x) * edge.dx + (opening.start.z - edge.a.z) * edge.dz;
  const b = (opening.end.x - edge.a.x) * edge.dx + (opening.end.z - edge.a.z) * edge.dz;
  return { min: Math.max(0, Math.min(a, b)), max: Math.min(edge.length, Math.max(a, b)) };
}

/** 只附着于真实外墙的玩具建筑外饰；不生成房间、门窗洞、屋顶主体或可摆放空间。 */
export function buildToyArchitecture(
  g: ExteriorGeometry,
  footprint: { polygon: Point2[]; holes?: Point2[][] },
  options: ToyArchitectureOptions,
): ToyArchitectureResult {
  let decorationCount = 0, towerCount = 0;
  if (!footprint?.polygon?.length || footprint.polygon.length < 3 || !footprint.polygon.every(finitePoint) || !Number.isFinite(options.floorY) || !Number.isFinite(options.eaveY) || options.eaveY - options.floorY < .3) return { towerCount, decorationCount };
  const polygon = footprint.polygon.map(p => ({ ...p })).filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > EPS);
  if (polygon.length > 1 && Math.hypot(polygon[0].x - polygon[polygon.length - 1].x, polygon[0].z - polygon[polygon.length - 1].z) <= EPS) polygon.pop();
  // 内隔墙的T端点会把外墙分成短段；仅清理共线冗余点，塔半径读取真实相邻墙长。
  let cleaned = true;
  while (cleaned && polygon.length > 3) {
    cleaned = false;
    for (let i = 0; i < polygon.length; i++) if (distance(polygon[i], polygon[(i + polygon.length - 1) % polygon.length], polygon[(i + 1) % polygon.length]) <= EPS) { polygon.splice(i, 1); cleaned = true; break; }
  }
  if (polygon.length < 3) return { towerCount, decorationCount };
  if (signedArea(polygon) < 0) polygon.reverse();
  const edges = polygon.map((p, i) => makeEdge(p, polygon[(i + 1) % polygon.length])).filter(edge => edge.length > EPS);
  if (edges.length !== polygon.length) return { towerCount, decorationCount };
  const { floorY, eaveY, kind } = options, wallHeight = eaveY - floorY;
  const roofTone = /^#[0-9a-f]{6}$/i.test(options.roofColor) ? options.roofColor : '#E7A6B5';
  const doors = (options.doors || []).filter(value => finitePoint(value.start) && finitePoint(value.end) && Number.isFinite(value.sill) && Number.isFinite(value.height) && value.height > 0);
  const windows = (options.windows || []).filter(value => finitePoint(value.start) && finitePoint(value.end) && Number.isFinite(value.sill) && Number.isFinite(value.height) && value.height > 0);
  const openings = [...doors, ...windows];
  const box = (p: Triple, size: Triple, tone: string, radius = .04, rotation?: number[]) => { decorationCount++; return g.box(p, size, tone, radius, rotation); };
  const ball = (p: Triple, size: Triple, tone: string, segments = 16) => { decorationCount++; return g.sphere(p, size, tone, segments, 10); };
  const cylinder = (p: Triple, radius: number, height: number, tone: string, topRadius = radius, segments = 20) => { decorationCount++; return g.cylinder(p, radius, height, tone, topRadius, segments); };
  const profile = (points: ProfilePoint[], p: Triple, size: Triple, tone: string, rotation?: number[]) => { decorationCount++; return g.profile(points, p, size, tone, rotation); };
  const touchesOpening = (p: Point2, radius: number, bottom: number, top: number) => openings.some(opening => bottom < floorY + opening.sill + opening.height + .025 && top > floorY + opening.sill - .025 && distance(p, opening.start, opening.end) < radius + .07);

  // 大块奶油基座和软檐跟随每一条真实外墙，遇真实低门/高窗必须断开。
  const band = (edge: Edge, centerY: number, height: number, depth: number, tone: string) => {
    let pieces: Array<[number, number]> = [[0, edge.length]];
    for (const opening of openings) {
      if (centerY - height / 2 >= floorY + opening.sill + opening.height || centerY + height / 2 <= floorY + opening.sill) continue;
      const interval = openingOnEdge(opening, edge); if (!interval) continue;
      const lo = interval.min - .04, hi = interval.max + .04;
      pieces = pieces.flatMap(([a, b]): Array<[number, number]> => hi <= a || lo >= b ? [[a, b]] : [[a, Math.max(a, lo)], [Math.min(b, hi), b]].filter(([x, z]) => z - x > .025) as Array<[number, number]>);
    }
    for (const [a, b] of pieces) if (b - a > .025) box([edge.a.x + edge.dx * (a + b) / 2, centerY, edge.a.z + edge.dz * (a + b) / 2], [b - a, height, depth], tone, Math.min(.075, height * .43), [0, -Math.atan2(edge.dz, edge.dx), 0]);
  };
  for (const edge of edges) {
    band(edge, floorY + .095, .18, .20, cream);
    band(edge, eaveY - .055, .24, kind === 'cottage' ? .26 : .32, cream);
    if (kind !== 'cottage') band(edge, floorY + Math.min(.36, wallHeight * .18), .10, .17, mix(roofTone, 15));
  }
  const corners: Corner[] = [];
  polygon.forEach((p, index) => {
    const before = edges[(index + edges.length - 1) % edges.length], after = edges[index];
    if (cross(before.a, p, after.b) <= EPS) return;
    const nx = before.outX + after.outX, nz = before.outZ + after.outZ, length = Math.hypot(nx, nz);
    if (length > .01) corners.push({ p, before, after, outX: nx / length, outZ: nz / length, index });
  });
  const safeAtCorner = (corner: Corner, center: Point2, radius: number) => {
    // 非邻边包括凹口的对边，洞边也参与净空；圆塔不能跨接窄臂或填天井。
    const clearance = radius * 1.25 + .06;
    if (edges.some(edge => edge !== corner.before && edge !== corner.after && distance(center, edge.a, edge.b) < clearance)) return false;
    return !(footprint.holes || []).some(ring => ring.some((p, i) => distance(center, p, ring[(i + 1) % ring.length]) < clearance));
  };
  if (kind === 'cottage') {
    for (const corner of [...corners].sort((a, b) => b.p.z - a.p.z || a.p.x - b.p.x).slice(0, 6)) {
      const radius = Math.min(.16, corner.before.length * .13, corner.after.length * .13), p = { x: corner.p.x + corner.outX * .015, z: corner.p.z + corner.outZ * .015 };
      if (radius < .08 || !safeAtCorner(corner, p, radius) || touchesOpening(p, radius, floorY, eaveY)) continue;
      cylinder([p.x, floorY + wallHeight / 2, p.z], radius, wallHeight, cream, radius, 20);
      ball([p.x, floorY + .10, p.z], [radius * 1.14, .11, radius * 1.14], cream);
      ball([p.x, eaveY - .015, p.z], [radius * 1.16, .12, radius * 1.16], cream);
    }
  } else {
    const towerBase = Math.max(floorY, eaveY - 2.75), towerTop = eaveY + .17;
    const mainDoor = doors.find(opening => edges.some(edge => openingOnEdge(opening, edge))), doorMiddle = mainDoor ? { x: (mainDoor.start.x + mainDoor.end.x) / 2, z: (mainDoor.start.z + mainDoor.end.z) / 2 } : null;
    const candidates: Tower[] = [];
    for (const corner of corners) {
      const desired = Math.min(kind === 'star_castle' ? .68 : .70, corner.before.length * .42, corner.after.length * .42);
      const radii: number[] = [];
      for (let radius = desired; radius >= .50 - EPS; radius -= .04) radii.push(Math.max(.50, radius));
      if (desired >= .50 && radii[radii.length - 1] > .50 + EPS) radii.push(.50);
      for (const radius of radii) {
        const center = { x: corner.p.x + corner.outX * radius * .45, z: corner.p.z + corner.outZ * radius * .45 };
        if (!safeAtCorner(corner, center, radius) || touchesOpening(center, radius * 1.25, towerBase, towerTop + .18)) continue;
        const distanceToDoor = doorMiddle ? Math.hypot(center.x - doorMiddle.x, center.z - doorMiddle.z) : 0;
        candidates.push({ ...corner, center, radius, score: doorMiddle ? -distanceToDoor : center.z }); break;
      }
    }
    const wanted = clamp(Math.floor(options.maxTowers ?? (kind === 'star_castle' ? 4 : 2)), 0, 4), selected: Tower[] = [];
    candidates.sort((a, b) => b.score - a.score || b.center.z - a.center.z || a.center.x - b.center.x);
    while (selected.length < wanted) {
      const available = candidates.filter(candidate => !selected.includes(candidate) && selected.every(other => Math.hypot(candidate.center.x - other.center.x, candidate.center.z - other.center.z) > (candidate.radius + other.radius) * 1.35 + .12));
      if (!available.length) break;
      // 前两座优先真实大门两侧；后续角塔分散到其余合格凸角。
      if (selected.length >= 2) available.sort((a, b) => Math.min(...selected.map(t => Math.hypot(b.center.x - t.center.x, b.center.z - t.center.z))) - Math.min(...selected.map(t => Math.hypot(a.center.x - t.center.x, a.center.z - t.center.z))));
      selected.push(available[0]);
    }
    selected.forEach((tower, index) => {
      const { center: p, radius: r } = tower, bodyHeight = towerTop - towerBase, cap = index % 2 ? lilac : roofTone, capRadius = r * 1.25;
      if (towerBase > floorY + .1 && !touchesOpening(tower.p, .13, floorY, towerBase)) cylinder([tower.p.x, floorY + (towerBase - floorY) / 2, tower.p.z], .13, towerBase - floorY, cream, .13, 16);
      cylinder([p.x, towerBase + bodyHeight / 2, p.z], r, bodyHeight, cream, r * .98, 24);
      ball([p.x, towerBase + .10, p.z], [r * 1.10, .14, r * 1.10], cream, 20);
      cylinder([p.x, towerBase + .22, p.z], r * 1.025, .15, mix(cap, 16), r * 1.025, 24);
      ball([p.x, towerTop - .035, p.z], [capRadius, .185, capRadius], milk, 20);
      // 分层软陶檐口与塔身稀疏砖缝拥有完整圆周，背视也不露平面。
      cylinder([p.x, towerTop + .035, p.z], capRadius * .97, .16, cap, capRadius * .97, 28);
      for (let row = 0; row < 3; row++) for (let part = 0; part < 6; part++) {
        const angle = (part / 6 + row % 2 / 12) * Math.PI * 2, rr = r * .985;
        box([p.x + Math.sin(angle) * rr, towerBase + .55 + row * .55, p.z + Math.cos(angle) * rr], [.22, .12, .045], row % 2 ? '#F6E4CB' : '#EFDAC1', .025, [0, angle, 0]);
      }
      const capHeight = kind === 'star_castle' ? 1.0 : .94;
      for (let i = 0; i < 8; i++) {
        const a = i / 8, b = (i + 1) / 8, radiusAt = (t: number) => .025 + (capRadius - .025) * Math.pow(1 - t, 1.13);
        cylinder([p.x, towerTop + .10 + (a + b) / 2 * capHeight, p.z], radiusAt(a), capHeight / 8 + .008, cap, radiusAt(b), 24);
      }
      ball([p.x, towerTop + .10 + capHeight, p.z], [.07, .085, .07], cap, 16);
      // 塔帽瓦檐只作浅浮雕，不在锥顶叠出独立厚块。
      for (let row = 0; row < 3; row++) {
        const t = .16 + row * .25, rr = .025 + (capRadius - .025) * Math.pow(1 - t, 1.13);
        cylinder([p.x, towerTop + .10 + t * capHeight, p.z], rr + .022, .035, mix(cap, row % 2 ? 6 : -5), rr + .018, 28);
      }
      // 大号心/星是玩具徽章，不伪造一扇没有真实开口的塔窗。
      profile(kind === 'star_castle' ? starProfile() : heartProfile(), [p.x, towerBase + bodyHeight * .54, p.z + r * .985], [.30, .30, .065], kind === 'star_castle' ? butter : blush);
      const crownY = towerTop + capHeight + .22;
      if (kind === 'star_castle') {
        cylinder([p.x, crownY, p.z], .23, .035, butter, .23, 24);
        ball([p.x, crownY, p.z], [.15, .15, .15], '#FFF0B8', 20);
        profile(starProfile(), [p.x, crownY + .15, p.z + .10], [.23, .23, .045], butter);
      } else {
        cylinder([p.x, crownY + .13, p.z], .022, .43, cream, .022, 12);
        box([p.x + .15, crownY + .22, p.z], [.30, .19, .065], index % 2 ? roofTone : lilac, .075);
        ball([p.x, crownY + .365, p.z], [.047, .047, .047], butter, 12);
      }
      towerCount++;
    });
  }

  // 门楼围住真实大门：圆柱全部在洞口两侧，拱顶全部位于实际洞顶上方。
  for (const door of doors.filter(opening => edges.some(edge => openingOnEdge(opening, edge))).slice(0, kind === 'cottage' ? 1 : 2)) {
    const edge = edges.find(value => openingOnEdge(door, value)); if (!edge) continue;
    const dx = door.end.x - door.start.x, dz = door.end.z - door.start.z, width = Math.hypot(dx, dz); if (width < .3) continue;
    const ux = dx / width, uz = dz / width, middle = { x: (door.start.x + door.end.x) / 2, z: (door.start.z + door.end.z) / 2 }, doorTop = floorY + door.sill + door.height;
    const postRadius = kind === 'cottage' ? .10 : .14;
    let available = eaveY - doorTop - .08;
    const doorInterval = openingOnEdge(door, edge)!;
    for (const other of openings) {
      if (other === door) continue;
      const interval = openingOnEdge(other, edge);
      if (interval && interval.min < doorInterval.max + postRadius * 2 && interval.max > doorInterval.min - postRadius * 2 && floorY + other.sill >= doorTop) available = Math.min(available, floorY + other.sill - doorTop - .10);
    }
    const posts = [-1, 1].map(side => ({ x: middle.x + side * ux * (width / 2 + postRadius + .035) + edge.outX * .095, z: middle.z + side * uz * (width / 2 + postRadius + .035) + edge.outZ * .095 }));
    if (posts.some(p => openings.some(other => other !== door && floorY + other.sill < doorTop + .16 && floorY + other.sill + other.height > floorY + door.sill && distance(p, other.start, other.end) < postRadius + .055))) continue;
    for (const p of posts) {
      cylinder([p.x, floorY + door.sill + (door.height + .08) / 2, p.z], postRadius, door.height + .08, cream, postRadius, 20);
      ball([p.x, doorTop + .03, p.z], [postRadius * 1.15, .12, postRadius * 1.15], cream);
    }
    if (available < .16) continue;
    const rise = Math.min(kind === 'cottage' ? .30 : .42, available), arch: ProfilePoint[] = [];
    for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI; arch.push({ x: Math.cos(a) * .5, y: .10 + Math.sin(a) * .90 }); }
    for (let i = 20; i >= 0; i--) { const a = i / 20 * Math.PI; arch.push({ x: Math.cos(a) * .39, y: .10 + Math.sin(a) * .55 }); }
    const yaw = -Math.atan2(uz, ux), faceX = middle.x + edge.outX * .12, faceZ = middle.z + edge.outZ * .12;
    profile(arch, [faceX, doorTop + .025, faceZ], [width + postRadius * 3 + .08, rise, .18], cream, [0, yaw, 0]);
    if (kind !== 'cottage' && available > .36) profile(kind === 'star_castle' ? starProfile() : heartProfile(), [faceX, doorTop + rise * .48, faceZ], [.25, .25, .09], kind === 'star_castle' ? butter : blush, [0, yaw, 0]);
  }
  return { towerCount, decorationCount };
}
