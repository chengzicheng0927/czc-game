import type { Point2 } from '../building/domain';

export interface LandscapeBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface LandscapeZone extends LandscapeBounds { center: Point2; width: number; depth: number }
export interface HomeLandscapeLayout {
  house: LandscapeBounds;
  yard: LandscapeZone;
  garden: LandscapeZone & { scale: number };
  island: { x: number; z: number; radius: number };
}
const zone = (x: number, z: number, width: number, depth: number): LandscapeZone => ({ center: { x, z }, width, depth, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });

/** 小屋、前院和右侧真实园圃共享同一块主岛；布局不改墙体、家具或地块规则。 */
export function createHomeLandscapeLayout(house: LandscapeBounds, placed: Point2[] = []): HomeLandscapeLayout {
  const width = Math.max(.5, house.maxX - house.minX), centerX = (house.minX + house.maxX) / 2;
  // 院子独立留白至少3.5m深；右侧种植区容纳原3×3地块，扩容时不挤占院子。
  const yard = zone(centerX, house.maxZ + .55 + 3.5 / 2, Math.max(6.6, Math.min(9.2, width + 1.0)), 3.5);
  const garden = { ...zone(Math.max(house.maxX + .9, yard.maxX + .55) + 4.8 / 2, house.maxZ - .65, 4.8, 5.1), scale: .78 };
  const minX = Math.min(house.minX - 1.2, yard.minX - .8), maxX = Math.max(house.maxX + 1.2, garden.maxX + .8);
  const minZ = Math.min(house.minZ - 1.5, garden.minZ - .7), maxZ = Math.max(yard.maxZ + .9, garden.maxZ + .8);
  const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
  const corners = [{ x: minX, z: minZ }, { x: minX, z: maxZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }];
  let radius = Math.max(9.5, ...corners.map(p => Math.hypot(p.x - x, p.z - z) + .45));
  for (const point of placed) if (Number.isFinite(point.x) && Number.isFinite(point.z)) radius = Math.max(radius, Math.hypot(point.x - x, point.z - z) + 1);
  return { house: { ...house }, yard, garden, island: { x, z, radius } };
}
