import type { Point2, Wall } from '../building/domain';

export interface RoofFootprint { polygon: Point2[]; holes?: Point2[][] }

// 输入只来自deriveSpaces的无重叠面；这里消去内部分隔边，不引入第二套空间规则。
const epsilon = 1e-7;
const tau = Math.PI * 2;
type Edge = { start: Point2; end: Point2 };
type BoundaryEdge = { from: string; to: string; start: Point2; end: Point2 };
const pointKey = (point: Point2) => `${Math.round(point.x / epsilon)},${Math.round(point.z / epsilon)}`;
const samePoint = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z) <= epsilon;
const copy = (point: Point2): Point2 => ({ x: point.x, z: point.z });

function signedArea(ring: Point2[]) {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function cleanRing(input: Point2[]): Point2[] {
  if (!Array.isArray(input)) throw new Error('屋顶边界必须是完整的闭合空间。');
  const points: Point2[] = [];
  for (const point of input) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new Error('屋顶边界坐标必须是有限数字。');
    if (!points.length || !samePoint(point, points[points.length - 1])) points.push(copy(point));
  }
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3 || Math.abs(signedArea(points)) <= epsilon) throw new Error('屋顶边界不能退化为线段。');
  return points;
}

function simplify(ring: Point2[]) {
  const result = ring.slice();
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index++) {
      const a = result[(index + result.length - 1) % result.length], b = result[index], c = result[(index + 1) % result.length];
      const dx = b.x - a.x, dz = b.z - a.z, ex = c.x - b.x, ez = c.z - b.z;
      if (Math.abs(dx * ez - dz * ex) <= epsilon * Math.max(1, Math.hypot(dx, dz), Math.hypot(ex, ez)) && dx * ex + dz * ez >= 0) {
        result.splice(index, 1); changed = true; break;
      }
    }
  }
  // 固定起点，输出不随房间遍历顺序改变；不改变外边/洞的方向。
  let first = 0;
  result.forEach((point, index) => {
    if (point.x < result[first].x || point.x === result[first].x && point.z < result[first].z) first = index;
  });
  return result.slice(first).concat(result.slice(0, first)).map(copy);
}

function pointOnEdge(point: Point2, edge: Edge): number | null {
  const dx = edge.end.x - edge.start.x, dz = edge.end.z - edge.start.z, squared = dx * dx + dz * dz;
  const distance = Math.sqrt(squared);
  if (Math.abs(dx * (point.z - edge.start.z) - dz * (point.x - edge.start.x)) > epsilon * distance) return null;
  const t = ((point.x - edge.start.x) * dx + (point.z - edge.start.z) * dz) / squared;
  return t >= -epsilon / distance && t <= 1 + epsilon / distance ? Math.max(0, Math.min(1, t)) : null;
}

function inside(point: Point2, ring: Point2[]) {
  let included = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index], b = ring[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) included = !included;
  }
  return included;
}

/** 只由占地外环/洞边的实际支承墙决定檐口；调用方另加楼层elevation。 */
export function roofEaveHeight(footprint: RoofFootprint, walls: readonly Pick<Wall, 'start' | 'end' | 'height'>[]): number {
  let highest: number | null = null;
  for (const ring of [footprint.polygon, ...(footprint.holes || [])]) for (let index = 0; index < ring.length; index++) {
    const a = ring[index], b = ring[(index + 1) % ring.length], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length <= epsilon) continue;
    for (const wall of walls) {
      if (!Number.isFinite(wall.height) || wall.height <= 0) continue;
      const distance = (point: Point2) => Math.abs(dx * (point.z - a.z) - dz * (point.x - a.x)) / length;
      if (distance(wall.start) > epsilon || distance(wall.end) > epsilon) continue;
      const offset = (point: Point2) => ((point.x - a.x) * dx + (point.z - a.z) * dz) / length;
      const first = offset(wall.start), last = offset(wall.end);
      const overlap = Math.min(length, Math.max(first, last)) - Math.max(0, Math.min(first, last));
      if (overlap > epsilon) highest = highest === null ? wall.height : Math.max(highest, wall.height);
    }
  }
  return highest === null ? 2.8 : highest;
}

/** 合并同层相邻空间的屋顶占地；保留洞和仅角点相接的独立屋体。 */
export function mergeRoofFootprints(spaces: Array<{ polygon: Point2[]; holes?: Point2[][] }>): RoofFootprint[] {
  const edges: Edge[] = [];
  for (const space of spaces) {
    for (const [index, input] of [space.polygon, ...(space.holes || [])].entries()) {
      const ring = cleanRing(input), positive = signedArea(ring) > 0;
      if (positive !== (index === 0)) ring.reverse();
      ring.forEach((point, cursor) => edges.push({ start: point, end: ring[(cursor + 1) % ring.length] }));
    }
  }
  if (!edges.length) return [];
  const vertices = new Map<string, Point2>();
  edges.forEach(edge => { for (const point of [edge.start, edge.end]) if (!vertices.has(pointKey(point))) vertices.set(pointKey(point), point); });

  // 先按所有共线端点切分；一面长墙与邻房的两面短墙也能逐段互相消去。
  const boundary = new Map<string, BoundaryEdge>();
  for (const edge of edges) {
    const cuts = new Map<string, { point: Point2; t: number }>();
    for (const [key, point] of vertices) {
      const t = pointOnEdge(point, edge); if (t !== null) cuts.set(key, { point, t });
    }
    const ordered = [...cuts.entries()].sort((a, b) => a[1].t - b[1].t);
    for (let index = 1; index < ordered.length; index++) {
      const [from, first] = ordered[index - 1], [to, last] = ordered[index];
      if (from === to || samePoint(first.point, last.point)) continue;
      const key = `${from}|${to}`, opposite = `${to}|${from}`;
      if (boundary.has(opposite)) boundary.delete(opposite);
      else {
        if (boundary.has(key)) throw new Error('屋顶占地输入包含重复或重叠的空间边。');
        boundary.set(key, { from, to, start: first.point, end: last.point });
      }
    }
  }
  const remaining = [...boundary.values()], outgoing = new Map<string, number[]>();
  remaining.forEach((edge, index) => {
    const values = outgoing.get(edge.from) || []; values.push(index); outgoing.set(edge.from, values);
  });
  const successor = remaining.map(edge => {
    const reverse = Math.atan2(edge.start.z - edge.end.z, edge.start.x - edge.end.x);
    const candidates = outgoing.get(edge.to) || [];
    if (!candidates.length) throw new Error('屋顶占地边界没有形成闭环。');
    // 保持实体位于左侧：从来路的反向沿顺时针找第一条出边。
    // 两栋房只在一个角点碰到时，各自转回自己的边，不能串成蝴蝶多边形。
    return candidates.slice().sort((a, b) => {
      const angle = (index: number) => {
        const next = remaining[index], heading = Math.atan2(next.end.z - next.start.z, next.end.x - next.start.x);
        return (reverse - heading + tau) % tau;
      };
      return angle(a) - angle(b) || a - b;
    })[0];
  });
  const visited = new Set<number>(), rings: Point2[][] = [];
  for (let first = 0; first < remaining.length; first++) {
    if (visited.has(first)) continue;
    const ring: Point2[] = []; let cursor = first;
    do {
      if (visited.has(cursor)) throw new Error('屋顶占地边界发生交叉，不能生成连续屋面。');
      visited.add(cursor); ring.push(copy(remaining[cursor].start)); cursor = successor[cursor];
    } while (cursor !== first);
    const cleaned = simplify(ring);
    if (cleaned.length >= 3 && Math.abs(signedArea(cleaned)) > epsilon) rings.push(cleaned);
  }
  const outers = rings.filter(ring => signedArea(ring) > 0).map(polygon => ({ polygon } as RoofFootprint));
  for (const hole of rings.filter(ring => signedArea(ring) < 0)) {
    const owner = outers.filter(value => inside(hole[0], value.polygon)).sort((a, b) => signedArea(a.polygon) - signedArea(b.polygon))[0];
    if (!owner) throw new Error('屋顶孔洞没有对应的外边界。');
    (owner.holes || (owner.holes = [])).push(hole);
  }
  const stable = (ring: Point2[]) => ring.map(pointKey).join(';');
  outers.forEach(value => value.holes?.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)) || stable(a).localeCompare(stable(b))));
  return outers.sort((a, b) => signedArea(b.polygon) - signedArea(a.polygon) || stable(a.polygon).localeCompare(stable(b.polygon)));
}
