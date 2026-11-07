import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { RoofSurface } from '../content/roof-surface';

/** 纯屋面使用数学坐标绕序；在这里一次转换为Babylon左手场景的正反面。 */
export function createRoofVertexData(surface: RoofSurface, options: { baseHeight: number; heightScale?: number; thickness?: number; underside?: boolean }) {
  const scale = options.heightScale ?? 1, thickness = options.thickness ?? .08;
  const data = new VertexData(), indices = surface.indices.slice(), normals: number[] = [];
  const positions = surface.positions.map((value, index) => index % 3 === 1 ? options.baseHeight + value * scale - (options.underside ? thickness : 0) : value);
  if (!options.underside) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  VertexData.ComputeNormals(positions, indices, normals);
  data.positions = positions; data.indices = indices; data.normals = normals;
  data.uvs = surface.uvs.map(value => value / 4);
  return data;
}
