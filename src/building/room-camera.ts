import type { Point2 } from './domain';
export type RoomView = 'admire' | 'place';
export type RoomBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
/** 根据实际可用视口取景。相机状态不进入建筑文档和存档。 */
export function roomCameraFrame(bounds: RoomBounds, view: RoomView, aspect: number) {
  const width = Math.max(1, bounds.maxX - bounds.minX), depth = Math.max(1, bounds.maxZ - bounds.minZ);
  const beta = view === 'place' ? .04 : .78;
  const projectedWidth = view === 'place' ? width : width * .91 + depth * .43;
  const projectedHeight = view === 'place' ? depth : (depth * .91 + width * .43) * Math.cos(beta) + 2.35 * Math.sin(beta);
  const span = Math.max(projectedHeight * 1.28, projectedWidth * 1.28 / Math.max(.25, aspect));
  return { alpha: view === 'place' ? Math.PI / 2 : Math.PI / 2 - .43, beta, radius: Math.max(5, span / (2 * Math.tan(.4))), x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
}
export function boundsOf(points: Point2[]): RoomBounds {
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) };
}
