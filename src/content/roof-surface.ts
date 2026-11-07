import earcut from 'earcut';
import type { Point2 } from '../building/domain';

export interface RoofFootprint { polygon: Point2[]; holes?: Point2[][] }
export interface RoofSurfaceOptions {
  pitch?: number;
  sampleSize?: number;
  style?: string;
  maxTriangles?: number;
}
export interface RoofSurface {
  /** 世界米制坐标；Y为相对墙顶的高度，不含屋面厚度。 */
  positions: number[];
  indices: number[];
  normals: number[];
  uvs: number[];
  /** 外环逆时针，内洞顺时针；不含细分生成的临时顶点。 */
  rings: Point2[][];
  heightAt(point: Point2): number;
  peak: Point2 & { height: number };
  triangleCount: number;
}
type Triangle = [number, number, number];
type Edge = { a: number; b: number; length: number; faces: number };
type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type TriangleBounds = Bounds & { triangle: number };
type Tree = Bounds & { left?: Tree; right?: Tree; triangles?: number[] };
const EPS = 1e-8;
const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
const cross = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const area = (ring: Point2[]) => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p.x * q.z - q.x * p.z; }, 0) / 2;
const same = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z) <= EPS;

function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function onSegment(p: Point2, a: Point2, b: Point2): boolean {
  return p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.z >= Math.min(a.z, b.z) - EPS && p.z <= Math.max(a.z, b.z) + EPS && segmentDistance(p, a, b) <= EPS;
}
function segmentsMeet(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - EPS || Math.max(c.x, d.x) < Math.min(a.x, b.x) - EPS || Math.max(a.z, b.z) < Math.min(c.z, d.z) - EPS || Math.max(c.z, d.z) < Math.min(a.z, b.z) - EPS) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}
function inRing(p: Point2, ring: Point2[], includeBoundary = true): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (onSegment(p, a, b)) return includeBoundary;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function cleanRing(source: Point2[]): Point2[] {
  if (!Array.isArray(source) || source.length > 4096) throw new RangeError('Roof footprint must have 3–4096 vertices per ring.');
  const ring: Point2[] = [];
  for (const value of source) {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z) || Math.max(Math.abs(value.x), Math.abs(value.z)) > 1e6) throw new RangeError('Roof footprint coordinates must be finite world positions.');
    const point = { x: value.x, z: value.z };
    if (!ring.length || !same(ring[ring.length - 1], point)) ring.push(point);
  }
  if (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
  // 只移除位于相邻两点之间的冗余共线点，不吞掉回折或真实凹角。
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) if (onSegment(ring[i], ring[(i + ring.length - 1) % ring.length], ring[(i + 1) % ring.length])) { ring.splice(i, 1); changed = true; break; }
  }
  if (ring.length < 3 || Math.abs(area(ring)) <= EPS * EPS) throw new RangeError('Roof footprint has no usable area.');
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
    if (segmentsMeet(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) throw new RangeError('Roof footprint must not intersect itself.');
  }
  return ring;
}
function footprintRings(space: RoofFootprint): Point2[][] {
  if (!space || !Array.isArray(space.polygon) || (space.holes && !Array.isArray(space.holes)) || (space.holes?.length || 0) > 128) throw new RangeError('Invalid roof footprint.');
  const rings = [cleanRing(space.polygon), ...(space.holes || []).map(cleanRing)];
  if (rings.reduce((n, ring) => n + ring.length, 0) > 4096) throw new RangeError('Roof footprint exceeds the vertex budget.');
  rings.forEach((ring, i) => { if ((area(ring) > 0) !== (i === 0)) ring.reverse(); });
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const a = rings[i], b = rings[j];
    for (let ai = 0; ai < a.length; ai++) for (let bi = 0; bi < b.length; bi++) if (segmentsMeet(a[ai], a[(ai + 1) % a.length], b[bi], b[(bi + 1) % b.length])) throw new RangeError('Roof holes must not touch or cross another boundary.');
    if (i === 0 ? !inRing(b[0], a, false) : inRing(b[0], a, false) || inRing(a[0], b, false)) throw new RangeError('Roof holes must be disjoint and inside the outer boundary.');
  }
  return rings;
}
function triangleEdges(triangles: Triangle[], points: Point2[]): Map<string, Edge> {
  const edges = new Map<string, Edge>();
  for (const triangle of triangles) for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3], key = edgeKey(a, b), existing = edges.get(key);
    if (existing) existing.faces++;
    else edges.set(key, { a, b, length: Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z), faces: 1 });
  }
  return edges;
}
function refine(triangles: Triangle[], points: Point2[], sampleSize: number, limit: number): Triangle[] {
  // 全局边表确保两个邻面总是共享同一个中点，预算收紧也不会产生T接缝。
  for (let pass = 0; pass < 32; pass++) {
    let remaining = limit - triangles.length;
    if (remaining <= 0) break;
    const candidates = [...triangleEdges(triangles, points).entries()].filter(([, edge]) => edge.length > sampleSize * (1 + 1e-10)).sort((a, b) => b[1].length - a[1].length || a[1].a - b[1].a || a[1].b - b[1].b);
    const midpoints = new Map<string, number>();
    for (const [key, edge] of candidates) {
      if (edge.faces > remaining) continue;
      const a = points[edge.a], b = points[edge.b]; midpoints.set(key, points.length); points.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }); remaining -= edge.faces;
    }
    if (!midpoints.size) break;
    const next: Triangle[] = [];
    const quad = (a: number, b: number, c: number, d: number) => {
      // 两条候选对角线中选较短者，减少边界附近的狭长三角形。
      if (Math.hypot(points[a].x - points[c].x, points[a].z - points[c].z) < Math.hypot(points[b].x - points[d].x, points[b].z - points[d].z)) next.push([a, b, c], [a, c, d]);
      else next.push([a, b, d], [b, c, d]);
    };
    for (const [a, b, c] of triangles) {
      const ab = midpoints.get(edgeKey(a, b)), bc = midpoints.get(edgeKey(b, c)), ca = midpoints.get(edgeKey(c, a));
      const count = Number(ab !== undefined) + Number(bc !== undefined) + Number(ca !== undefined);
      if (!count) next.push([a, b, c]);
      else if (count === 3) next.push([a, ab!, ca!], [ab!, b, bc!], [ca!, bc!, c], [ab!, bc!, ca!]);
      else if (count === 1) {
        if (ab !== undefined) next.push([a, ab, c], [ab, b, c]);
        else if (bc !== undefined) next.push([b, bc, a], [bc, c, a]);
        else next.push([c, ca!, b], [ca!, a, b]);
      } else if (ca === undefined) { next.push([b, bc!, ab!]); quad(a, ab!, bc!, c); }
      else if (ab === undefined) { next.push([c, ca, bc!]); quad(b, bc!, ca, a); }
      else { next.push([a, ab, ca]); quad(c, ca, ab, b); }
    }
    triangles = next;
  }
  return triangles;
}
function buildTree(rows: TriangleBounds[]): Tree {
  const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const row of rows) { bounds.minX = Math.min(bounds.minX, row.minX); bounds.minZ = Math.min(bounds.minZ, row.minZ); bounds.maxX = Math.max(bounds.maxX, row.maxX); bounds.maxZ = Math.max(bounds.maxZ, row.maxZ); }
  if (rows.length <= 8) return { ...bounds, triangles: rows.map(row => row.triangle) };
  const xAxis = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ;
  rows.sort((a, b) => xAxis ? a.minX + a.maxX - b.minX - b.maxX : a.minZ + a.maxZ - b.minZ - b.maxZ);
  const half = Math.floor(rows.length / 2);
  return { ...bounds, left: buildTree(rows.slice(0, half)), right: buildTree(rows.slice(half)) };
}

/** 连续薄屋面：精确轮廓三角化与共形细分，绝不以包围矩形填平凹口或天井。 */
export function createRoofSurface(space: RoofFootprint, options: RoofSurfaceOptions = {}): RoofSurface {
  const pitch = options.pitch ?? .62, sampleSize = options.sampleSize ?? .24, limit = options.maxTriangles ?? 12000;
  if (!Number.isFinite(pitch) || pitch <= 0 || pitch > 8 || !Number.isFinite(sampleSize) || sampleSize <= 0 || !Number.isInteger(limit) || limit < 4 || limit > 65536) throw new RangeError('Invalid roof pitch, sampling size or triangle budget.');
  const rings = footprintRings(space), points = rings.flatMap(ring => ring.map(p => ({ ...p }))), holes: number[] = [];
  for (let i = 1, count = rings[0].length; i < rings.length; count += rings[i++].length) holes.push(count);
  const flat = points.flatMap(p => [p.x, p.z]), base = earcut(flat, holes, 2);
  let triangles: Triangle[] = [];
  for (let i = 0; i < base.length; i += 3) if (Math.abs(cross(points[base[i]], points[base[i + 1]], points[base[i + 2]])) > EPS * EPS) triangles.push([base[i], base[i + 1], base[i + 2]]);
  const expectedArea = Math.abs(area(rings[0])) - rings.slice(1).reduce((n, ring) => n + Math.abs(area(ring)), 0);
  const coveredArea = triangles.reduce((n, t) => n + Math.abs(cross(points[t[0]], points[t[1]], points[t[2]])) / 2, 0);
  if (!triangles.length || Math.abs(coveredArea - expectedArea) > Math.max(EPS, expectedArea * 1e-8)) throw new RangeError('Roof footprint could not be triangulated completely.');
  if (triangles.length + 2 > limit) throw new RangeError('Roof triangle budget is too small for this footprint.');
  // 即使调用方刻意给出粗采样，也保留一个真实内点，三角屋面不会退化成平板。
  const largest = triangles.reduce((best, t, i) => Math.abs(cross(points[t[0]], points[t[1]], points[t[2]])) > Math.abs(cross(points[triangles[best][0]], points[triangles[best][1]], points[triangles[best][2]])) ? i : best, 0);
  const [a, b, c] = triangles[largest], center = points.length;
  points.push({ x: (points[a].x + points[b].x + points[c].x) / 3, z: (points[a].z + points[b].z + points[c].z) / 3 });
  triangles.splice(largest, 1, [a, b, center], [b, c, center], [c, a, center]);
  triangles = refine(triangles, points, Math.max(.02, sampleSize), limit);
  const distances = points.map(p => {
    let nearest = Infinity;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) nearest = Math.min(nearest, segmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
    return nearest <= EPS ? 0 : nearest;
  });
  const maxDistance = Math.max(...distances), rounded = ['round', 'starry', 'cloud', 'mushroom', 'strawberry'].includes((options.style || 'triangle').replace(/^roof_/, ''));
  let heights = distances.map(distance => pitch * (rounded && maxDistance ? maxDistance * Math.sin(distance / maxDistance * Math.PI / 2) : distance));
  // 仅轻揉一次内部脊点；屋檐和洞边严格为0，不制造宽平台或轮廓外挤出。
  const neighbors = points.map(() => new Set<number>());
  for (const [a, b, c] of triangles) for (const [from, to] of [[a, b], [b, c], [c, a]]) { neighbors[from].add(to); neighbors[to].add(from); }
  heights = heights.map((height, i) => !distances[i] ? 0 : height * .9 + [...neighbors[i]].reduce((sum, id) => sum + heights[id], 0) / neighbors[i].size * .1);
  const positions = points.flatMap((p, i) => [p.x, heights[i], p.z]), indices: number[] = [], normals = positions.map(() => 0), uvs = points.flatMap(p => [p.x, p.z]);
  const rows: TriangleBounds[] = [];
  for (let i = 0; i < triangles.length; i++) {
    let [a, b, c] = triangles[i];
    if (cross(points[a], points[b], points[c]) > 0) [b, c] = [c, b];
    triangles[i] = [a, b, c]; indices.push(a, b, c);
    const ux = points[b].x - points[a].x, uy = heights[b] - heights[a], uz = points[b].z - points[a].z;
    const vx = points[c].x - points[a].x, vy = heights[c] - heights[a], vz = points[c].z - points[a].z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const id of [a, b, c]) { normals[id * 3] += nx; normals[id * 3 + 1] += ny; normals[id * 3 + 2] += nz; }
    rows.push({ triangle: i, minX: Math.min(points[a].x, points[b].x, points[c].x), minZ: Math.min(points[a].z, points[b].z, points[c].z), maxX: Math.max(points[a].x, points[b].x, points[c].x), maxZ: Math.max(points[a].z, points[b].z, points[c].z) });
  }
  for (let i = 0; i < points.length; i++) {
    const length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    if (!length) { normals[i * 3] = 0; normals[i * 3 + 1] = 1; normals[i * 3 + 2] = 0; }
    else { normals[i * 3] /= length; normals[i * 3 + 1] /= length; normals[i * 3 + 2] /= length; }
  }
  const tree = buildTree(rows);
  const query = (node: Tree, point: Point2): number | null => {
    if (point.x < node.minX - EPS || point.x > node.maxX + EPS || point.z < node.minZ - EPS || point.z > node.maxZ + EPS) return null;
    if (node.triangles) for (const id of node.triangles) {
      const [a, b, c] = triangles[id], denominator = cross(points[a], points[b], points[c]);
      const wa = cross(point, points[b], points[c]) / denominator, wb = cross(points[a], point, points[c]) / denominator, wc = 1 - wa - wb;
      if (wa >= -EPS && wb >= -EPS && wc >= -EPS) return Math.max(0, wa * heights[a] + wb * heights[b] + wc * heights[c]);
    }
    return node.left && node.right ? query(node.left, point) ?? query(node.right, point) : null;
  };
  const peakIndex = heights.reduce((best, height, i) => height > heights[best] ? i : best, 0);
  return {
    positions, indices, normals, uvs, rings, triangleCount: triangles.length, peak: { ...points[peakIndex], height: heights[peakIndex] },
    heightAt(point) {
      // 没有屋面的外部/洞内返回0；调用方装饰锚点应来自peak或真实footprint。
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z) || !inRing(point, rings[0]) || rings.slice(1).some(ring => inRing(point, ring, false))) return 0;
      return query(tree, point) ?? 0;
    },
  };
}
