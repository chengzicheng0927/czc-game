import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Plane } from '@babylonjs/core/Maths/math.plane.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PolygonMeshBuilder } from '@babylonjs/core/Meshes/polygonMesh.js';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh.js';
import { Layer } from '@babylonjs/core/Layers/layer.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateTiledBox } from '@babylonjs/core/Meshes/Builders/tiledBoxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Rendering/outlineRenderer.js';
import type { BuildingDocument, Furniture, Point2, Vec3, Wall } from './domain';
import { furnitureDimensions, type FurnitureCatalog } from './catalog';
import { createClayModels } from '../content/clay-models.js';
import { buildIslandEnvironment, type IslandEnvironmentSpec } from '../content/island-environment';
import { deriveSpaces, type Space } from './domain';
import earcut from 'earcut';
import { AvatarGeometry, buildAvatarFrame, buildStaticAvatar, avatarVertexShader, avatarFragmentShader } from '../content/avatar-model';
import { addOpeningDetails, heartProfile, openingProfile, paintExteriorWall, paintRoofPattern, paintWallpaper, starProfile, type ProfilePoint } from '../content/exterior-details';
import { createRoofSurface } from '../content/roof-surface';
import { mergeRoofFootprints, roofEaveHeight } from '../content/roof-footprints';
import { createRoofVertexData } from './roof-mesh';
import { buildToyArchitecture, type ArchitectureOpening } from '../content/toy-architecture';
import { describeGarden, gardenLayout } from '../content/garden-environment.js';

export type BuildMode = 'select' | 'wall' | 'door' | 'window' | 'furniture';
export type SelectionKind = 'wall' | 'opening' | 'furniture' | 'none';
export interface RendererCallbacks {
  onGround?(point: Point2): void;
  onHoverGround?(point: Point2): void;
  onWall?(wallId: string, offset: number): void;
  onSelect?(kind: SelectionKind, id: string | null): void;
  onMove?(id: string, position: Vec3): void;
  onGardenPlot?(index: number): void;
}
export interface GardenSurfaceSnapshot {
  state: Record<string, unknown>;
  gardenStatuses: unknown[];
  selectedPlot?: number;
  visitor?: { x: number; y: number; bee?: boolean } | null;
}
export interface AvatarStageHandle {
  setLook(look: Record<string, unknown>): void;
  setAction(action: string): void;
  setGroupMode(enabled: boolean): void;
  setOrbit(angle: number, elevation: number): void;
  resize(width: number, height: number, dpr?: number): void;
  dispose(): void;
}
type AvatarStageState = {
  scene: Scene; camera: ArcRotateCamera; mesh: Mesh; material: ShaderMaterial;
  canvas: HTMLCanvasElement; hud: HTMLCanvasElement; target: RenderTargetTexture | null;
  look: Record<string, unknown>; action: string; group: boolean; angle: number; elevation: number;
  geometry: AvatarGeometry; width: number; height: number; dpr: number;
  pending: boolean; disposed: boolean; lastAt: number; vertices: number; observer: ResizeObserver;
};
type Meta = { kind: Exclude<SelectionKind, 'none'>; id: string; wallId?: string };
type PrimitivePoint = [number, number, number];
type PointerGesture = {
  pointerId: number; x: number; y: number; moved: boolean; hit: Meta | null;
  position?: Vector3; grab?: Point2; point?: Point2;
  gardenPlot?: number;
};
type ThumbnailSubject =
  | { kind: 'furniture'; defId: string; item?: { color?: string; artId?: string } }
  | { kind: 'resident'; id: string }
  | { kind: 'avatar'; look: Record<string, unknown>; yaw: number };
type ClayHost = { scene: Scene; material(tone: string, alpha?: number): StandardMaterial; cloudMaterial?(tone: string): StandardMaterial; addShadow(mesh: AbstractMesh): void };

const MeshBuilder = { CreateBox, CreateTiledBox, CreateSphere, CreateCylinder, CreateLineSystem, CreatePlane };

const colorValue = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/** 将内容的几何描述交给 Babylon，模型本身不再负责矩阵、着色器与拾取。 */
class ClayAdapter {
  readonly meshes: Mesh[] = [];
  private count = 0;
  constructor(private owner: ClayHost, private parent: TransformNode, private ghost = false) {}

  private finish(mesh: Mesh, p: PrimitivePoint, color: string, rotation?: number[]) {
    // 所有内容几何统一属性布局，避免三角屋顶与Babylon基础体合并时缺少UV。
    if (!mesh.isVerticesDataPresent(VertexBuffer.UVKind)) mesh.setVerticesData(VertexBuffer.UVKind, new Float32Array(mesh.getTotalVertices() * 2));
    for (const kind of mesh.getVerticesDataKinds()) if (![VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind].includes(kind)) mesh.removeVerticesData(kind);
    mesh.position.set(...p);
    if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    mesh.material = this.owner.material(color, this.ghost ? .42 : 1);
    mesh.parent = this.parent;
    mesh.isPickable = !this.ghost;
    this.meshes.push(mesh);
    return mesh;
  }
  box(p: PrimitivePoint, size: PrimitivePoint, color: string, radius = .04, rotation?: number[]) {
    const dimensions = size.map(value => Math.max(.002, value));
    const bevel = Math.max(0, Math.min(radius, Math.min(...dimensions) * .44));
    const mesh = bevel > .001 ? MeshBuilder.CreateTiledBox(`clay-box-${this.count++}`, {
      width: dimensions[0], height: dimensions[1], depth: dimensions[2], tileSize: Math.max(...dimensions) / 5, updatable: true,
    }, this.owner.scene) : MeshBuilder.CreateBox(`clay-box-${this.count++}`, {
      width: dimensions[0], height: dimensions[1], depth: dimensions[2],
    }, this.owner.scene);
    if (bevel > .001) {
      // 在Babylon生成的分段箱体上修饰圆角；不持有另一套几何缓存或渲染管线。
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      const maximum = new Vector3(dimensions[0] / 2 - bevel, dimensions[1] / 2 - bevel, dimensions[2] / 2 - bevel), minimum = maximum.negate();
      for (let i = 0; i < positions.length; i += 3) {
        const point = Vector3.FromArray(positions, i), inner = Vector3.Clamp(point, minimum, maximum);
        const normal = point.subtract(inner).normalize(), rounded = inner.add(normal.scale(bevel));
        rounded.toArray(positions, i); normal.toArray(normals, i);
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions); mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
    return this.finish(mesh, p, color, rotation);
  }
  sphere(p: PrimitivePoint, size: PrimitivePoint, color: string, segments = 12, _rings = 8, rotation?: number[]) {
    const mesh = MeshBuilder.CreateSphere(`clay-sphere-${this.count++}`, {
      diameter: 2, segments: Math.max(6, Math.min(20, segments)),
    }, this.owner.scene);
    mesh.scaling.set(Math.max(.002, size[0]), Math.max(.002, size[1]), Math.max(.002, size[2]));
    return this.finish(mesh, p, color, rotation);
  }
  cloudSphere(p: PrimitivePoint, size: PrimitivePoint, color: string, segments = 20, rings = 12) {
    const mesh = this.sphere(p, size, color, segments, rings);
    mesh.material = this.owner.cloudMaterial?.(color) || mesh.material;
    return mesh;
  }
  cylinder(p: PrimitivePoint, radius: number, height: number, color: string, topRadius?: number, segments = 16, rotation?: number[]) {
    return this.finish(MeshBuilder.CreateCylinder(`clay-cylinder-${this.count++}`, {
      diameterBottom: Math.max(.002, radius * 2), diameterTop: Math.max(0, (topRadius ?? radius) * 2),
      height: Math.max(.002, height), tessellation: Math.max(6, Math.min(32, segments)),
    }, this.owner.scene), p, color, rotation);
  }
  roof(p: PrimitivePoint, width: number, depth: number, height: number, color: string) {
    // 三角柱只是一种内容形状；法线、材质和GPU资源仍由Babylon管理。
    const mesh = new Mesh(`clay-roof-${this.count++}`, this.owner.scene);
    const positions = [
      -width / 2, 0, -depth / 2, width / 2, 0, -depth / 2, 0, height, -depth / 2,
      -width / 2, 0, depth / 2, width / 2, 0, depth / 2, 0, height, depth / 2,
    ];
    const indices = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 0, 1, 4, 0, 4, 3];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const vertexData = new VertexData();
    vertexData.positions = positions; vertexData.indices = indices; vertexData.normals = normals;
    vertexData.applyToMesh(mesh); mesh.convertToFlatShadedMesh();
    return this.finish(mesh, p, color);
  }
  profile(points: ProfilePoint[], p: PrimitivePoint, size: PrimitivePoint, color: string, rotation?: number[]) {
    const mesh = new Mesh(`clay-profile-${this.count++}`, this.owner.scene);
    const ring = points.filter((point, index) => !index || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > .000001);
    const positions: number[] = [], indices: number[] = [], uv: number[] = [];
    for (const side of [-1, 1]) for (const point of ring) {
      positions.push(point.x * size[0], point.y * size[1], side * size[2] / 2); uv.push(point.x + .5, point.y);
    }
    const faces = earcut(ring.flatMap(point => [point.x, point.y]), [], 2), count = ring.length;
    for (let i = 0; i < faces.length; i += 3) {
      indices.push(faces[i + 2], faces[i + 1], faces[i]);
      indices.push(faces[i] + count, faces[i + 1] + count, faces[i + 2] + count);
    }
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count, base = positions.length / 3;
      // 斜面UV以真实横向/进深展开，款式纹样不会沿屋脊被拉成色带。
      positions.push(ring[i].x * size[0], ring[i].y * size[1], -size[2] / 2,
        ring[next].x * size[0], ring[next].y * size[1], -size[2] / 2,
        ring[next].x * size[0], ring[next].y * size[1], size[2] / 2,
        ring[i].x * size[0], ring[i].y * size[1], size[2] / 2);
      uv.push(ring[i].x + .5, 0, ring[next].x + .5, 0, ring[next].x + .5, 1, ring[i].x + .5, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uv;
    data.applyToMesh(mesh); mesh.convertToFlatShadedMesh();
    return this.finish(mesh, p, color, rotation);
  }
  merge(metadata: Meta | null) {
    const groups = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of this.meshes) {
      const material = mesh.material as StandardMaterial;
      const rows = groups.get(material) || []; rows.push(mesh); groups.set(material, rows);
    }
    const result: Mesh[] = [];
    for (const [material, parts] of groups) {
      const mesh = parts.length > 1 ? Mesh.MergeMeshes(parts, true, true, undefined, false, false) : parts[0];
      if (!mesh) continue;
      mesh.parent = this.parent; mesh.material = material; mesh.metadata = metadata;
      const cloud = material.metadata?.claySurface === 'cloud';
      mesh.isPickable = !this.ghost && !cloud; mesh.receiveShadows = !cloud;
      if (!this.ghost && !cloud) this.owner.addShadow(mesh);
      result.push(mesh);
    }
    return result;
  }
}

/** 当前楼层的可编辑世界。所有持久化和规则动作由controller发命令完成。 */
export class BuildingRenderer {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private readonly shadows: ShadowGenerator;
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly avatarMaterials = new WeakMap<Scene, ShaderMaterial>();
  private readonly avatarStages = new Set<AvatarStageState>();
  private readonly wallArtMaterials = new Map<string, StandardMaterial>();
  private readonly wallTileSizes = new WeakMap<StandardMaterial, number>();
  private readonly callbacks: RendererCallbacks;
  private readonly models: ReturnType<typeof createClayModels>;
  private readonly visualState: Record<string, unknown> = {};
  private readonly contentData: Record<string, unknown>;
  private readonly thumbnailCache = new Map<string, HTMLCanvasElement>();
  private readonly thumbnailPending = new Map<string, Promise<HTMLCanvasElement>>();
  private readonly thumbnailRequests = new WeakMap<HTMLCanvasElement, number>();
  private readonly visibilityWaiters = new Set<() => void>();
  private thumbnailQueue: Promise<void> = Promise.resolve();
  private thumbnailPixels = 0;
  private thumbnailSerial = 0;
  private thumbnailRendering = false;
  private artKey = '';
  private visualRevision = 0;
  private documentKey = '';
  private sceneBuilds = 0;
  private environmentKey = '';
  private environmentBuilds = 0;
  private actorKey = '';
  private actorRevision = 0;
  private exteriorKey = '';
  private highestRoofFloor = -Infinity;
  private roofTop = 0;
  private actorsRoot: TransformNode | null = null;
  private grid: LinesMesh | null = null;
  private view: 'exterior' | 'cutaway' = 'exterior';
  private preferredView: 'exterior' | 'cutaway' = 'exterior';
  private allFloors = false;
  private islandSpec: IslandEnvironmentSpec = { x: 0, z: 0, y: 0, radius: 6 };
  private spaces: Space[] = [];
  private readonly furnitureRoots = new Map<string, TransformNode>();
  private document: BuildingDocument | null = null;
  private activeFloorId = '';
  private floorY = 0;
  private mode: BuildMode = 'select';
  private readOnly = false;
  private contentRoot: TransformNode | null = null;
  private groundRoot: TransformNode | null = null;
  private gardenRoot: TransformNode | null = null;
  private gardenLabelMaterials: StandardMaterial[] = [];
  private gardenKey = '';
  private surface: 'garden' | null = null;
  private houseCamera: { alpha: number; beta: number; radius: number; target: Vector3; screen: Vector2 } | null = null;
  private preview: Mesh | null = null;
  private ghost: TransformNode | null = null;
  private placementId: string | null = null;
  private selected: { kind: SelectionKind; id: string | null } = { kind: 'none', id: null };
  private gesture: PointerGesture | null = null;
  private pointers = new Set<number>();
  private disposed = false;
  private lastPaint = 0;
  private resizeObserver: ResizeObserver;
  private cutaway = false;
  private bounds = { minX: -10, maxX: 10, minZ: -8, maxZ: 8 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly catalog: FurnitureCatalog,
    callbacks: RendererCallbacks = {},
    contentData: Record<string, unknown> = {},
  ) {
    this.callbacks = callbacks;
    this.contentData = contentData;
    this.models = createClayModels(contentData, this.visualState);
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, powerPreference: 'low-power' }, true);
    this.engine.setHardwareScalingLevel(1 / Math.min(1.5, window.devicePixelRatio || 1));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString('#DCEAE8FF');
    this.buildSky();
    this.scene.ambientColor = new Color3(.015, .01, .015);
    this.camera = new ArcRotateCamera('building-camera', Math.PI / 2 - .43, .76, 20, new Vector3(0, .6, 0), this.scene);
    this.camera.lowerRadiusLimit = 3; this.camera.upperRadiusLimit = 160;
    this.camera.lowerBetaLimit = .04; this.camera.upperBetaLimit = 1.46;
    this.camera.minZ = .05; this.camera.maxZ = 500;
    this.camera.wheelPrecision = 36; this.camera.panningSensibility = 90;
    this.camera.inertia = .65; this.camera.attachControl(canvas, true);
    const hemisphere = new HemisphericLight('cream-sky', new Vector3(0, 1, 0), this.scene);
    hemisphere.intensity = .8; hemisphere.groundColor = Color3.FromHexString('#E3CFBB');
    const sun = new DirectionalLight('warm-sun', new Vector3(-.6, -1, .45), this.scene);
    sun.position = new Vector3(12, 22, -12); sun.intensity = .28;
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.useBlurExponentialShadowMap = true; this.shadows.blurKernel = 20;
    this.shadows.bias = .0008; this.shadows.normalBias = .03; this.shadows.setDarkness(.2);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('contextmenu', this.contextMenu);
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.resizeObserver = new ResizeObserver(() => { this.engine.resize(); if (this.document) this.resetCamera(); }); this.resizeObserver.observe(canvas);
    this.engine.runRenderLoop(this.renderFrame);
    canvas.dataset.renderer = 'babylon'; canvas.dataset.ready = 'true';
  }

  material(tone: string, alpha = 1) {
    const color = colorValue(tone, '#E8A9BA'), key = color + ':' + alpha;
    let material = this.materials.get(key);
    if (!material) {
      material = new StandardMaterial('clay-' + key, this.scene);
      material.diffuseColor = Color3.FromHexString(color);
      material.specularColor = new Color3(.075, .065, .06); material.specularPower = 32;
      material.alpha = alpha; material.backFaceCulling = false;
      this.materials.set(key, material);
    }
    return material;
  }
  cloudMaterial(tone: string) {
    const color = colorValue(tone, '#FFFFFF'), key = 'cloud:' + color;
    let material = this.materials.get(key);
    if (!material) {
      material = new StandardMaterial(key, this.scene);
      // 云保留柔和体积受光，底面不被地面的褐色反照染成土块。
      const base = Color3.FromHexString(color);
      material.diffuseColor = base.scale(.6); material.emissiveColor = base.scale(.4);
      material.specularColor = new Color3(.015, .015, .02); material.backFaceCulling = false;
      material.metadata = { claySurface: 'cloud' };
      this.materials.set(key, material);
    }
    return material;
  }
  private toyMaterial(tone: string, alpha = 1) {
    const color = colorValue(tone, '#FFF2DA'), key = 'toy:' + color + ':' + alpha;
    let material = this.materials.get(key);
    if (!material) {
      material = new StandardMaterial(key, this.scene); const base = Color3.FromHexString(color);
      material.diffuseColor = base.scale(.88); material.emissiveColor = base.scale(.12);
      material.specularColor = new Color3(.18, .16, .16); material.specularPower = 60;
      material.alpha = alpha; material.backFaceCulling = false; this.materials.set(key, material);
    }
    return material;
  }
  private toyAdapter(parent: TransformNode) {
    return new ClayAdapter({scene:this.scene,material:(tone,alpha)=>this.toyMaterial(tone,alpha),cloudMaterial:tone=>this.cloudMaterial(tone),addShadow:mesh=>this.addShadow(mesh)},parent);
  }
  private toyTexture(material: StandardMaterial) {
    material.diffuseColor = new Color3(.88, .88, .88); material.emissiveColor = new Color3(.12, .12, .12);
    material.emissiveTexture = material.diffuseTexture; material.specularColor = new Color3(.14, .12, .12); material.specularPower = 60;
    return material;
  }
  addShadow(mesh: AbstractMesh) { this.shadows.addShadowCaster(mesh, false); }

  setDocument(doc: BuildingDocument, activeFloorId: string, allFloors = false) {
    this.allFloors = allFloors;
    const key = JSON.stringify([activeFloorId, allFloors, doc, this.visualRevision, this.actorRevision, this.exteriorKey, this.cutaway, this.view]);
    this.document = doc;
    if (key === this.documentKey) return;
    this.cancelGesture();
    this.activeFloorId = activeFloorId;
    this.floorY = doc.floors.find(floor => floor.id === activeFloorId)?.elevation || 0;
    const oldTargetY = this.camera.target.y;
    const previousFloor = this.canvas.dataset.floorId;
    this.disposeRoot(this.contentRoot); this.disposeRoot(this.actorsRoot);
    this.contentRoot = new TransformNode('building-content', this.scene);
    this.actorsRoot = new TransformNode('island-friends', this.scene);
    this.furnitureRoots.clear();
    this.updateBounds(); this.buildGround();
    this.canvas.dataset.roofCount = '0'; this.canvas.dataset.roofTriangleCount = '0'; this.canvas.dataset.towerCount = '0'; this.roofTop = 0;
    const selectedY = this.floorY, allSpaces: Space[] = [];
    const floors = this.view === 'exterior' || allFloors ? doc.floors : doc.floors.filter(floor => floor.id === activeFloorId);
    const floorSpaces = floors.map(floor => ({ floor, spaces: deriveSpaces(doc, floor.id) }));
    this.highestRoofFloor = Math.max(-Infinity, ...floorSpaces.filter(entry => entry.spaces.length).map(entry => entry.floor.elevation));
    for (const { floor, spaces } of floorSpaces) {
      this.activeFloorId = floor.id; this.floorY = floor.elevation;
      this.spaces = spaces; allSpaces.push(...spaces);
      this.buildFloorsAndRoofs(spaces);
      for (const wall of doc.walls.filter(value => value.floorId === floor.id)) this.buildWall(wall);
      for (const item of doc.furniture.filter(value => value.floorId === floor.id)) this.buildFurniture(item);
    }
    this.activeFloorId = activeFloorId; this.floorY = selectedY; this.spaces = allSpaces;
    this.buildActors(allSpaces);
    this.select(this.selected.kind, this.selected.id);
    this.clearPreview(); this.updateGhost();
    if (previousFloor !== activeFloorId) {
      this.camera.target.y += this.floorY + .6 - oldTargetY;
      this.resetCamera();
    }
    this.canvas.dataset.floorId = activeFloorId;
    const visibleIds = new Set(floors.map(floor => floor.id));
    this.canvas.dataset.wallCount = String(doc.walls.filter(value => visibleIds.has(value.floorId)).length);
    this.canvas.dataset.openingCount = String(doc.openings.filter(value => doc.walls.some(wall => wall.id === value.wallId && visibleIds.has(wall.floorId))).length);
    this.canvas.dataset.furnitureCount = String(doc.furniture.filter(value => visibleIds.has(value.floorId)).length);
    this.canvas.dataset.sceneBuilds = String(++this.sceneBuilds);
    this.canvas.dataset.view = this.view;
    this.canvas.dataset.visibleFloorCount = String(floors.length);
    if (this.surface === 'garden') for (const root of [this.contentRoot, this.groundRoot, this.actorsRoot]) root?.setEnabled(false);
    this.documentKey = key;
  }

  setMode(mode: BuildMode) {
    if (this.readOnly && mode !== 'select') return;
    if (mode !== 'select') this.setSurface(null);
    this.cancelGesture(); this.mode = mode;
    const nextView = mode === 'select' ? this.preferredView : 'cutaway';
    const changedView = this.view !== nextView; this.view = nextView;
    if (mode === 'select') this.camera.attachControl(this.canvas, true); else this.camera.detachControl();
    this.canvas.style.cursor = mode === 'select' ? 'grab' : 'crosshair';
    if (mode !== 'wall') this.clearPreview();
    this.grid?.setEnabled(mode === 'wall' || mode === 'furniture');
    if (changedView && this.document) { this.setDocument(this.document, this.activeFloorId, this.allFloors); this.resetCamera(); }
    this.updateGhost();
  }
  setPlacement(defId: string | null) { if (this.readOnly) return; this.placementId = defId; this.updateGhost(); }
  setReadOnly(enabled: boolean) {
    this.cancelGesture(); this.readOnly = enabled;
    this.canvas.dataset.readOnly = String(enabled);
    if (enabled) {
      this.placementId = null; this.clearPreview(); this.setMode('select'); this.updateGhost();
    }
  }
  setContentState(state: Record<string, unknown>) {
    const house = state.house as { exterior?: Record<string, unknown> } | undefined;
    this.visualState.exterior = house?.exterior || {};
    this.exteriorKey = JSON.stringify(house?.exterior || {});
    this.visualState.avatar = state.avatar;
    this.visualState.hidePlayer = !!state.hidePlayer;
    const residents = Array.isArray(state.residents) ? state.residents : Object.entries((state.residents || {}) as Record<string, { movedIn: boolean; roomId: string }>).filter(([, value]) => value.movedIn).map(([id, value]) => ({ id, roomId: value.roomId }));
    this.visualState.residents = residents;
    const avatar = state.avatar as Record<string, unknown> | undefined;
    const actorKey = JSON.stringify([!!state.hidePlayer, avatar && ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'].map(key => avatar[key]), residents]);
    if (actorKey !== this.actorKey) { this.actorKey = actorKey; this.actorRevision++; }
    const arts = (Array.isArray(state.customArts) ? state.customArts : []) as Array<{ id: string; pixels: string }>;
    const key = JSON.stringify(arts.map(art => [art.id, art.pixels]));
    this.visualState.customArts = arts;
    if (key === this.artKey) return;
    this.artKey = key; this.visualRevision++;
    for (const image of this.thumbnailCache.values()) image.width = image.height = 1;
    this.thumbnailCache.clear(); this.thumbnailPixels = 0;
    for (const material of this.wallArtMaterials.values()) material.dispose(false, true);
    this.wallArtMaterials.clear();
  }
  setCutaway(enabled: boolean) {
    this.cutaway = enabled;
    if (this.document) this.setDocument(this.document, this.activeFloorId, this.allFloors);
  }
  setView(view: 'exterior' | 'cutaway') {
    const previous = this.view;
    this.preferredView = view; this.view = this.mode === 'select' ? view : 'cutaway';
    if (this.document) this.setDocument(this.document, this.activeFloorId, this.allFloors);
    if (previous !== this.view) this.resetCamera();
  }
  setSurface(surface: 'garden' | null, snapshot?: GardenSurfaceSnapshot): boolean {
    if (!surface) {
      if (this.surface !== 'garden') return true;
      this.cancelGesture(); this.surface = null; this.gardenRoot?.setEnabled(false);
      for (const root of [this.contentRoot, this.groundRoot, this.actorsRoot]) root?.setEnabled(true);
      const camera = this.houseCamera; this.houseCamera = null;
      if (camera) { this.camera.alpha = camera.alpha; this.camera.beta = camera.beta; this.camera.radius = camera.radius; this.camera.target.copyFrom(camera.target); this.camera.targetScreenOffset.copyFrom(camera.screen); }
      this.clearCameraMomentum(); this.canvas.dataset.surface = 'house'; this.lastPaint = 0; return true;
    }
    if (this.mode !== 'select' || !snapshot?.state || !Array.isArray(snapshot.gardenStatuses)) return false;
    const config = this.contentData.gardenConfig as { expandLv: number; expandedPlots: number; basePlots: number } | undefined;
    if (!config) return false;
    const count = Number(snapshot.state.level) >= config.expandLv ? config.expandedPlots : config.basePlots;
    const description = describeGarden({ surface: 'garden', state: snapshot.state, data: this.contentData, garden: gardenLayout(count), gardenStatuses: snapshot.gardenStatuses, selectedPlot: snapshot.selectedPlot, visitor: snapshot.visitor });
    if (!description) return false;
    if (description.key !== this.gardenKey) {
      this.disposeRoot(this.gardenRoot);
      for (const material of this.gardenLabelMaterials) material.dispose(false, true); this.gardenLabelMaterials = [];
      this.gardenRoot = new TransformNode('original-garden-surface', this.scene);
      const environment = new ClayAdapter(this, this.gardenRoot);
      description.buildEnvironment(environment, this.models); environment.merge(null);
      for (const plot of description.plots) {
        const root = new TransformNode('garden-plot-' + plot.index, this.scene), geometry = new ClayAdapter(this, root);
        description.buildPlot(geometry, this.models, plot.index);
        const meshes = geometry.merge(null); root.parent = this.gardenRoot;
        for (const mesh of meshes) mesh.metadata = { kind: 'gardenPlot', index: plot.index };
        // 原描述的命中范围覆盖土面至完整植株，空地也能可靠点中。
        const hit = description.hits.find((value: { kind: string; index?: number }) => value.kind === 'plot' && value.index === plot.index)!;
        const hitMesh = MeshBuilder.CreateBox('garden-plot-hit-' + plot.index, { width: hit.size[0], height: hit.size[1], depth: hit.size[2] }, this.scene);
        hitMesh.position.set(hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]); hitMesh.parent = root;
        hitMesh.visibility = 0; hitMesh.metadata = { kind: 'gardenPlot', index: plot.index };
      }
      for (const label of description.labels) if (label.kind === 'plot' && typeof label.index === 'number') this.gardenLabel({ index: label.index, text: label.text, p: label.p });
      this.gardenKey = description.key; this.canvas.dataset.gardenBuilds = String(Number(this.canvas.dataset.gardenBuilds || 0) + 1);
    }
    if (this.surface !== 'garden') {
      this.cancelGesture();
      this.houseCamera = { alpha: this.camera.alpha, beta: this.camera.beta, radius: this.camera.radius, target: this.camera.target.clone(), screen: this.camera.targetScreenOffset.clone() };
      this.surface = 'garden'; this.clearPreview(); this.ghost?.setEnabled(false); this.resetCamera();
    }
    for (const root of [this.contentRoot, this.groundRoot, this.actorsRoot]) root?.setEnabled(false);
    this.gardenRoot?.setEnabled(true); this.canvas.dataset.surface = 'garden'; this.canvas.dataset.gardenPlotCount = String(description.plots.length); this.lastPaint = 0; return true;
  }
  private clearCameraMomentum() {
    this.camera.inertialAlphaOffset = this.camera.inertialBetaOffset = this.camera.inertialRadiusOffset = 0;
    this.camera.inertialPanningX = this.camera.inertialPanningY = 0;
  }
  private gardenLabel(label: { index: number; text: string; p: number[] }) {
    const texture = new DynamicTexture('garden-label-' + label.index, { width: 320, height: 64 }, this.scene, false);
    const context = texture.getContext() as unknown as CanvasRenderingContext2D; context.clearRect(0, 0, 320, 64); context.fillStyle = '#FFF5E3'; context.fillRect(2, 5, 316, 54);
    context.strokeStyle = '#D5ADBC'; context.lineWidth = 3; context.strokeRect(2, 5, 316, 54);
    context.fillStyle = '#73505B'; context.font = '600 28px "PingFang SC","Microsoft YaHei",sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label.text, 160, 33); texture.hasAlpha = true; texture.update(true);
    const material = new StandardMaterial('garden-label-material-' + label.index, this.scene); material.diffuseTexture = texture; material.emissiveColor = Color3.White(); material.disableLighting = true; material.backFaceCulling = false; material.useAlphaFromDiffuseTexture = true;
    this.gardenLabelMaterials.push(material);
    const mesh = MeshBuilder.CreatePlane('garden-plot-label-' + label.index, { width: 1.28, height: .256, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    mesh.position.set(label.p[0], label.p[1], label.p[2]); mesh.billboardMode = Mesh.BILLBOARDMODE_ALL; mesh.material = material; mesh.parent = this.gardenRoot; mesh.metadata = { kind: 'gardenPlot', index: label.index };
  }
  select(kind: SelectionKind, id: string | null) {
    this.selected = { kind, id };
    for (const mesh of this.contentRoot?.getChildMeshes() || []) {
      const meta = mesh.metadata as Meta | null;
      mesh.renderOutline = !!(id && meta?.kind === kind && meta.id === id);
      mesh.outlineColor = Color3.FromHexString('#B23D68'); mesh.outlineWidth = .035;
    }
  }
  previewWall(start: Point2, end: Point2, height = 2.8) {
    if (this.readOnly) return;
    this.clearPreview();
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (length < .01) return;
    this.preview = MeshBuilder.CreateBox('wall-draft', { width: length, height, depth: .18 }, this.scene);
    this.preview.position.set((start.x + end.x) / 2, this.floorY + height / 2, (start.z + end.z) / 2);
    this.preview.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
    this.preview.material = this.material('#C75B82', .38); this.preview.isPickable = false;
  }
  clearPreview() { this.preview?.dispose(); this.preview = null; }
  resetCamera() {
    if (this.surface === 'garden') {
      this.camera.target.set(0, .48, .05); this.camera.alpha = Math.PI / 2 - .18; this.camera.beta = Math.PI / 2 - .62;
      this.camera.radius = Math.max(17.5, 17.5 / Math.min(1, this.engine.getAspectRatio(this.camera)));
      this.camera.targetScreenOffset.set(0, this.camera.radius * .055); this.clearCameraMomentum(); return;
    }
    const island = this.islandSpec;
    const worldTop = Math.max(island.y + 3.2, ...(this.document?.walls || []).map(wall => wall.height + (this.document!.floors.find(floor => floor.id === wall.floorId)?.elevation || 0)));
    const houseHeight = this.view === 'exterior' ? Math.max(worldTop, this.roofTop) - island.y : 3.2;
    this.camera.target.set(island.x, this.view === 'exterior' ? island.y + Math.max(.5, houseHeight * .26) : this.floorY + .5, island.z + .1);
    const castle = ['roof_castle','roof_starry'].includes(String((this.visualState.exterior as Record<string,unknown>)?.roof));
    this.camera.alpha = Math.PI / 2 - (this.view === 'exterior' && castle ? .22 : .43);
    this.camera.beta = this.view === 'exterior' && castle ? 1.08 : .91;
    this.camera.radius = Math.min(150, Math.max(13, island.radius * 3, (houseHeight + 1.8) * 1.65) / Math.min(1, this.engine.getAspectRatio(this.camera)));
    // 留出底部导航，完整看到土层和云托，桌面/竖屏用同一画面比例。
    this.camera.targetScreenOffset.set(0, this.camera.radius * (houseHeight > 7 ? .045 : .07));
    this.camera.inertialAlphaOffset = this.camera.inertialBetaOffset = this.camera.inertialRadiusOffset = 0;
  }
  topView() {
    this.camera.beta = .04; this.camera.alpha = Math.PI / 2;
    this.camera.inertialAlphaOffset = this.camera.inertialBetaOffset = 0;
  }
  project(point: Point2 & { y?: number }) {
    const rect = this.canvas.getBoundingClientRect();
    this.scene.updateTransformMatrix(true);
    const projected = Vector3.Project(new Vector3(point.x, point.y ?? this.floorY + .02, point.z), Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()));
    return { x: projected.x * rect.width / this.engine.getRenderWidth(), y: projected.y * rect.height / this.engine.getRenderHeight() };
  }
  screenshot() { this.scene.render(); return this.canvas.toDataURL('image/png'); }

  groundAt(clientX: number, clientY: number) { return this.groundPoint({ clientX, clientY } as PointerEvent); }
  private nativeAvatarMaterial(scene: Scene) {
    let material = this.avatarMaterials.get(scene);
    if (!material) {
      material = new ShaderMaterial('original-eggy-clay', scene, { vertexSource: avatarVertexShader, fragmentSource: avatarFragmentShader }, {
        attributes: ['position', 'normal', 'color'], uniforms: ['world', 'worldViewProjection', 'uEye'],
      });
      material.backFaceCulling = false;
      material.onBindObservable.add(() => {
        if (scene.activeCamera) material!.getEffect()?.setVector3('uEye', scene.activeCamera.globalPosition);
      });
      this.avatarMaterials.set(scene, material);
    }
    return material;
  }
  private avatarVertexData(data: Float32Array) {
    const count = data.length / 9, positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 4), indices = new Uint32Array(count);
    for (let index = 0; index < count; index++) {
      positions.set(data.subarray(index * 9, index * 9 + 3), index * 3);
      normals.set(data.subarray(index * 9 + 3, index * 9 + 6), index * 3);
      colors.set(data.subarray(index * 9 + 6, index * 9 + 9), index * 4); colors[index * 4 + 3] = 1; indices[index] = index;
    }
    const vertexData = new VertexData(); vertexData.positions = positions; vertexData.normals = normals; vertexData.colors = colors; vertexData.indices = indices;
    return vertexData;
  }
  private nativeAvatarMesh(look: Record<string, unknown>, scene: Scene, scale = 1) {
    const mesh = new Mesh('original-eggy-avatar', scene);
    this.avatarVertexData(buildStaticAvatar(look, scale)).applyToMesh(mesh);
    mesh.material = this.nativeAvatarMaterial(scene); mesh.isPickable = false; mesh.receiveShadows = true;
    if (scene === this.scene) this.addShadow(mesh);
    return mesh;
  }
  createAvatarStage(canvas: HTMLCanvasElement, hud: HTMLCanvasElement): AvatarStageHandle {
    const scene = new Scene(this.engine); scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new ArcRotateCamera('original-avatar-stage-camera', 0, 1, 9, new Vector3(0, .88, 0), scene);
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA; camera.minZ = .01; camera.maxZ = 50; scene.activeCamera = camera;
    const mesh = new Mesh('original-avatar-stage-people', scene), material = this.nativeAvatarMaterial(scene);
    mesh.material = material; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true;
    const stage = {
      scene, camera, mesh, material, canvas, hud, target: null, look: {}, action: 'waddle', group: false,
      angle: .15, elevation: .22, geometry: new AvatarGeometry(), width: 320, height: 260, dpr: Math.min(2, window.devicePixelRatio || 1),
      pending: false, disposed: false, lastAt: -Infinity, vertices: 0,
    } as AvatarStageState;
    stage.observer = new ResizeObserver(() => this.resizeAvatarStage(stage, canvas.clientWidth || 320, canvas.clientHeight || 260));
    stage.observer.observe(canvas); this.avatarStages.add(stage);
    const dispose = () => {
      if (stage.disposed) return; stage.disposed = true; stage.observer.disconnect(); this.avatarStages.delete(stage);
      stage.target?.dispose(); stage.scene.dispose();
    };
    return {
      setLook: look => { stage.look = structuredClone(look); },
      setAction: action => { if (['waddle', 'wave', 'bounce', 'idle'].includes(action)) stage.action = action; },
      setGroupMode: enabled => { stage.group = enabled; },
      setOrbit: (angle, elevation) => { stage.angle = angle; stage.elevation = Math.max(.05, Math.min(.6, elevation)); },
      resize: (width, height, dpr) => this.resizeAvatarStage(stage, width, height, dpr),
      dispose,
    };
  }
  private resizeAvatarStage(stage: AvatarStageState, width: number, height: number, dpr = Math.min(2, window.devicePixelRatio || 1)) {
    stage.width = Math.max(1, width); stage.height = Math.max(1, height); stage.dpr = Math.max(1, Math.min(2, dpr));
    const w = Math.round(stage.width * stage.dpr), h = Math.round(stage.height * stage.dpr);
    if (stage.canvas.width !== w || stage.canvas.height !== h) {
      stage.canvas.width = stage.hud.width = w; stage.canvas.height = stage.hud.height = h;
      stage.target?.dispose(); stage.target = null;
    }
  }
  private scheduleAvatarStage(stage: AvatarStageState, now: number) {
    if (stage.pending || stage.disposed || !stage.canvas.isConnected || now - stage.lastAt < (stage.group ? 50 : 1000 / 30)) return;
    stage.pending = true; stage.lastAt = now;
    const task = this.thumbnailQueue.then(() => this.renderAvatarStage(stage, now));
    this.thumbnailQueue = task.then(() => undefined, () => undefined);
    void task.catch(error => { if (!stage.disposed) stage.canvas.dataset.renderError = error instanceof Error ? error.message : String(error); }).finally(() => { stage.pending = false; });
  }
  private async renderAvatarStage(stage: AvatarStageState, now: number) {
    if (stage.disposed || this.disposed || document.hidden || !stage.canvas.isConnected) return;
    this.resizeAvatarStage(stage, stage.canvas.clientWidth || stage.width, stage.canvas.clientHeight || stage.height);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = buildAvatarFrame(stage.geometry, stage.look, reduced ? 'idle' : stage.action, reduced ? 0 : now / 1000, stage.group);
    const data = this.avatarVertexData(frame.data);
    if (stage.vertices !== frame.data.length / 9) { data.applyToMesh(stage.mesh, true); stage.vertices = frame.data.length / 9; }
    else {
      stage.mesh.updateVerticesData(VertexBuffer.PositionKind, data.positions!);
      stage.mesh.updateVerticesData(VertexBuffer.NormalKind, data.normals!);
      stage.mesh.updateVerticesData(VertexBuffer.ColorKind, data.colors!);
      stage.mesh.refreshBoundingInfo();
    }
    const aspect = stage.width / stage.height;
    const viewH = stage.group ? Math.max(2.7, 5.6 / (2 * aspect * .94)) : 1.35;
    const elevation = stage.group ? Math.max(stage.elevation, .5) : stage.elevation;
    stage.camera.setTarget(new Vector3(0, stage.group ? .68 : .78, 0));
    stage.camera.setPosition(new Vector3(Math.sin(stage.angle) * Math.cos(elevation) * 9, Math.sin(elevation) * 9 + (stage.group ? 1.05 : .88), Math.cos(stage.angle) * Math.cos(elevation) * 9));
    stage.camera.orthoLeft = -aspect * viewH; stage.camera.orthoRight = aspect * viewH;
    stage.camera.orthoTop = viewH; stage.camera.orthoBottom = -viewH;
    await stage.scene.whenReadyAsync();
    if (stage.disposed || this.disposed || document.hidden) return;
    if (!stage.target) {
      stage.target = new RenderTargetTexture('original-avatar-stage-target', { width: stage.canvas.width, height: stage.canvas.height }, stage.scene, false, true);
      stage.target.activeCamera = stage.camera; stage.target.renderList = [stage.mesh]; stage.target.clearColor = new Color4(0, 0, 0, 0);
    }
    const frameTarget = stage.target, width = stage.canvas.width, height = stage.canvas.height;
    this.thumbnailRendering = true;
    try {
      stage.scene.updateTransformMatrix(true); stage.material.setVector3('uEye', stage.camera.globalPosition); frameTarget.render();
      const pending = frameTarget.readPixels(); if (!pending) throw new Error('暂时无法读回原形象舞台。');
      const pixels = await pending, bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
      // resize可能在GPU异步读回期间替换RTT；只丢弃旧帧，不把旧像素写进新尺寸。
      if (stage.disposed || this.disposed || stage.target !== frameTarget || stage.canvas.width !== width || stage.canvas.height !== height || bytes.length !== width * height * 4) return;
      const stride = width * 4, image = new ImageData(width, height);
      for (let y = 0; y < height; y++) image.data.set(bytes.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
      const context = stage.canvas.getContext('2d'); if (!context) throw new Error('原形象舞台画布暂不可用。');
      context.putImageData(image, 0, 0); stage.canvas.dataset.renderer = 'babylon-original-avatar'; delete stage.canvas.dataset.renderError;
      this.drawAvatarStageHud(stage, frame.people);
    } finally {
      this.thumbnailRendering = false;
      if (!this.disposed) { this.engine.restoreDefaultFramebuffer(); this.engine.wipeCaches(true); this.scene.resetCachedMaterial(); }
    }
  }
  private drawAvatarStageHud(stage: AvatarStageState, people: Array<{ name: string; anchor: number[] }>) {
    const context = stage.hud.getContext('2d'); if (!context) return;
    const width = stage.width, height = stage.height;
    context.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0); context.clearRect(0, 0, width, height);
    const project = (point: number[]) => {
      const projected = Vector3.Project(Vector3.FromArray(point), Matrix.Identity(), stage.scene.getTransformMatrix(), stage.camera.viewport.toGlobal(stage.canvas.width, stage.canvas.height));
      return { x: projected.x / stage.dpr, y: projected.y / stage.dpr };
    };
    if (stage.group) for (const person of people) {
      const anchor = project(person.anchor); context.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = context.measureText(person.name).width + 12;
      context.fillStyle = 'rgba(236, 72, 153, 0.90)'; context.beginPath(); context.roundRect(anchor.x - textWidth / 2, anchor.y - 4, textWidth, 18, 9); context.fill();
      context.fillStyle = '#FFFFFF'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(person.name, anchor.x, anchor.y + 5);
    } else if (stage.action === 'wave' && people[0]) {
      const head = project(people[0].anchor), text = '咔咔～今天也超可爱，来串门呀✨';
      context.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = context.measureText(text).width + 22, bubbleHeight = 28;
      context.fillStyle = 'rgba(255, 249, 245, 0.94)'; context.strokeStyle = '#F3AEC9'; context.lineWidth = 1.5;
      context.beginPath(); context.roundRect(head.x - textWidth / 2, head.y - bubbleHeight - 6, textWidth, bubbleHeight, 12); context.fill(); context.stroke();
      context.fillStyle = '#592E3E'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, head.x, head.y - bubbleHeight / 2 - 6);
    }
  }

  drawThumbnail(canvas: HTMLCanvasElement, defId: string, item?: { color?: string; artId?: string }) {
    return this.paintThumbnail(canvas, { kind: 'furniture', defId, item });
  }
  drawCharacter(canvas: HTMLCanvasElement, residentId: string) {
    return this.paintThumbnail(canvas, { kind: 'resident', id: residentId });
  }
  drawAvatar(canvas: HTMLCanvasElement, look: Record<string, unknown>, options: number | { yaw?: number; facing?: number } = {}) {
    const value = typeof options === 'number' ? options : options.yaw ?? (options.facing === -1 ? -Math.PI / 4 : options.facing === 1 ? Math.PI / 4 : 0);
    const yaw = Number.isFinite(value) ? Math.atan2(Math.sin(value), Math.cos(value)) : 0;
    return this.paintThumbnail(canvas, { kind: 'avatar', look, yaw });
  }

  private async paintThumbnail(canvas: HTMLCanvasElement, subject: ThumbnailSubject): Promise<void> {
    const ticket = ++this.thumbnailSerial;
    this.thumbnailRequests.set(canvas, ticket);
    const width = Math.max(1, Math.min(512, canvas.width || 128)), height = Math.max(1, Math.min(512, canvas.height || 128));
    const key = JSON.stringify([subject, width, height, this.visualRevision]);
    canvas.dataset.renderState = 'loading'; delete canvas.dataset.renderError;
    try {
      if (this.disposed) throw new Error('立体画面已关闭。');
      let source = this.thumbnailCache.get(key);
      if (source) {
        this.thumbnailCache.delete(key); this.thumbnailCache.set(key, source);
      } else {
        let pending = this.thumbnailPending.get(key);
        if (!pending) {
          pending = this.thumbnailQueue.then(() => this.renderThumbnail(subject, width, height)).then(image => {
            this.thumbnailCache.set(key, image); this.thumbnailPixels += image.width * image.height;
            while (this.thumbnailCache.size > 64 || this.thumbnailPixels > 2_000_000) {
              const oldest = this.thumbnailCache.keys().next().value as string;
              const old = this.thumbnailCache.get(oldest)!;
              this.thumbnailCache.delete(oldest); this.thumbnailPixels -= old.width * old.height;
              old.width = old.height = 1;
            }
            return image;
          });
          this.thumbnailPending.set(key, pending);
          this.thumbnailQueue = pending.then(() => undefined, () => undefined);
          void pending.finally(() => this.thumbnailPending.delete(key)).catch(() => {});
        }
        source = await pending;
      }
      if (this.disposed || this.thumbnailRequests.get(canvas) !== ticket) return;
      const context = canvas.getContext('2d'); if (!context) throw new Error('无法打开缩略图画布。');
      context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height);
      canvas.dataset.renderState = 'ready'; canvas.dataset.renderer = 'babylon-content';
    } catch (error) {
      if (this.thumbnailRequests.get(canvas) !== ticket) return;
      const reason = error instanceof Error ? error.message : '立体内容绘制失败。';
      canvas.dataset.renderState = 'error'; canvas.dataset.renderError = reason; canvas.title = reason;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#8D5268';
        context.font = `${Math.max(10, Math.min(15, canvas.width / 8))}px sans-serif`;
        context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('画面暂不可用', canvas.width / 2, canvas.height / 2);
      }
    }
  }

  private async renderThumbnail(subject: ThumbnailSubject, width: number, height: number) {
    if (document.hidden && !this.disposed) await new Promise<void>(resolve => this.visibilityWaiters.add(resolve));
    if (this.disposed) throw new Error('立体画面已关闭。');
    // 临时Scene与RTT共享主Engine，不改变主相机、canvas尺寸或存档。
    const scene = new Scene(this.engine), localMaterials = new Map<string, StandardMaterial>();
    let target: RenderTargetTexture | null = null;
    try {
      scene.clearColor = new Color4(0, 0, 0, 0);
      const sky = new HemisphericLight('content-sky', new Vector3(-.3, 1, .6), scene); sky.intensity = .96;
      sky.intensity = .62; sky.groundColor = Color3.FromHexString('#B79AA8');
      const sun = new DirectionalLight('content-sun', new Vector3(-.5, -.9, -.6), scene); sun.intensity = .34;
      const camera = new ArcRotateCamera('content-camera', Math.PI / 2 - .43, 1.05, 5, Vector3.Zero(), scene);
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA; camera.minZ = .01; camera.maxZ = 100;
      scene.activeCamera = camera;
      const root = new TransformNode('content-model', scene);
      const host: ClayHost = { scene, addShadow() {}, material: (tone, alpha = 1) => {
        const color = colorValue(tone, '#E8A9BA'), key = color + ':' + alpha;
        let value = localMaterials.get(key);
        if (!value) {
          value = new StandardMaterial('content-clay-' + key, scene); value.diffuseColor = Color3.FromHexString(color);
          value.specularColor = new Color3(.075, .065, .06); value.specularPower = 32; value.alpha = alpha; value.backFaceCulling = false;
          localMaterials.set(key, value);
        }
        return value;
      } };
      const adapter = new ClayAdapter(host, root);
      if (subject.kind === 'furniture') {
        const def = this.catalog[subject.defId]; if (!def) throw new Error('找不到这件家具的造型。');
        const size = furnitureDimensions(def);
        this.models.furniture(adapter, def, subject.item || {}, [0, 0, 0], [size.width, size.height, size.depth]);
      } else if (subject.kind === 'resident') {
        const residents = this.contentData.residents as Array<{ id: string }> | undefined;
        const definition = residents?.find(value => value.id === subject.id);
        if (!definition) throw new Error('找不到这位朋友的造型。');
        this.models.character(adapter, null, [0, 0, 0], 1, definition);
      }
      const meshes = subject.kind === 'avatar' ? [this.nativeAvatarMesh(subject.look, scene)] : adapter.merge(null);
      if (subject.kind === 'avatar') meshes[0].parent = root;
      if (!meshes.length) throw new Error('这份内容没有可绘制的模型。');
      if (subject.kind === 'avatar') root.rotation.y = -subject.yaw;
      for (const mesh of meshes) mesh.computeWorldMatrix(true);
      const bounds = root.getHierarchyBoundingVectors(true), centre = bounds.min.add(bounds.max).scale(.5);
      const size = bounds.max.subtract(bounds.min); camera.setTarget(centre);
      camera.radius = Math.max(3, size.length() * 3); const view = camera.getViewMatrix(true);
      let halfWidth = .1, halfHeight = .1;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = Vector3.TransformCoordinates(new Vector3(x, y, z), view);
        halfWidth = Math.max(halfWidth, Math.abs(point.x)); halfHeight = Math.max(halfHeight, Math.abs(point.y));
      }
      halfHeight = Math.max(halfHeight, halfWidth / (width / height)) * 1.13;
      camera.orthoTop = halfHeight; camera.orthoBottom = -halfHeight;
      camera.orthoRight = halfHeight * width / height; camera.orthoLeft = -camera.orthoRight;
      target = new RenderTargetTexture('content-thumbnail', { width, height }, scene, false, true);
      target.activeCamera = camera; target.renderList = meshes; target.clearColor = new Color4(0, 0, 0, 0);
      await scene.whenReadyAsync();
      if (document.hidden && !this.disposed) await new Promise<void>(resolve => this.visibilityWaiters.add(resolve));
      if (this.disposed) throw new Error('立体画面已关闭。');
      this.thumbnailRendering = true;
      scene.updateTransformMatrix(true); target.render();
      const pending = target.readPixels(); if (!pending) throw new Error('无法读回内容画面。');
      const pixels = await pending;
      const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
      if (bytes.length !== width * height * 4) throw new Error('内容画面的像素尺寸不匹配。');
      const image = new ImageData(width, height), stride = width * 4;
      // WebGL framebuffer从左下角读起，Canvas ImageData从左上角写起。
      for (let y = 0; y < height; y++) image.data.set(bytes.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
      const output = document.createElement('canvas'); output.width = width; output.height = height;
      const context = output.getContext('2d'); if (!context) throw new Error('无法生成内容画面。');
      context.putImageData(image, 0, 0); return output;
    } finally {
      this.thumbnailRendering = false; target?.dispose(); scene.dispose();
      this.engine.restoreDefaultFramebuffer(); this.engine.wipeCaches(true); this.scene.resetCachedMaterial();
    }
  }

  private buildSky() {
    const texture = new DynamicTexture('cloud-sea-sky', { width: 512, height: 512 }, this.scene, false);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(210, 110, 15, 256, 256, 410);
    gradient.addColorStop(0, '#F0F1D9'); gradient.addColorStop(.55, '#DDECE8'); gradient.addColorStop(1, '#CCE1E7');
    context.fillStyle = gradient; context.fillRect(0, 0, 512, 512); texture.update();
    const layer = new Layer('soft-cloud-sea', null, this.scene, true); layer.texture = texture;
  }
  private disposeRoot(root: TransformNode | null) {
    for (const mesh of root?.getChildMeshes() || []) this.shadows.removeShadowCaster(mesh, false);
    root?.dispose(false);
  }
  private updateBounds() {
    const points: Point2[] = [];
    for (const wall of this.document?.walls || []) points.push(wall.start, wall.end);
    for (const item of this.document?.furniture || []) points.push(item.position);
    this.bounds = {
      minX: Math.min(-2.1, ...points.map(p => p.x)), maxX: Math.max(2.1, ...points.map(p => p.x)),
      minZ: Math.min(-1.7, ...points.map(p => p.z)), maxZ: Math.max(1.7, ...points.map(p => p.z)),
    };
    const b = this.bounds, x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    const groundY = Math.min(0, ...(this.document?.floors || []).map(floor => floor.elevation));
    const door = this.document?.openings.find(opening => opening.kind === 'door' && this.document!.walls.some(wall => wall.id === opening.wallId && this.document!.floors.find(floor => floor.id === wall.floorId)?.elevation === groundY));
    const wall = door && this.document?.walls.find(value => value.id === door.wallId);
    let entry: Point2 | undefined;
    if (door && wall) {
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z), ratio = (door.offset + door.width / 2) / length;
      entry = { x: wall.start.x + (wall.end.x - wall.start.x) * ratio, z: wall.start.z + (wall.end.z - wall.start.z) * ratio };
    }
    this.islandSpec = { x, z: z + .25, y: groundY, radius: Math.max(5.5, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 2.5), entry };
  }
  private buildGround() {
    const key = JSON.stringify(this.islandSpec);
    if (key === this.environmentKey && this.groundRoot) {
      if (this.grid) this.grid.position.y = this.floorY - this.islandSpec.y;
      this.grid?.setEnabled(this.mode === 'wall' || this.mode === 'furniture'); return;
    }
    this.disposeRoot(this.groundRoot); this.groundRoot = new TransformNode('cloud-island-environment', this.scene);
    const adapter = new ClayAdapter(this, this.groundRoot);
    buildIslandEnvironment(adapter, this.models, this.islandSpec); adapter.merge(null);
    for (const mesh of this.groundRoot.getChildMeshes()) mesh.isPickable = false;
    const { x, z, y, radius } = this.islandSpec, lines: Vector3[][] = [];
    for (let px = Math.ceil(x - radius); px <= x + radius; px++) {
      const half = Math.sqrt(Math.max(0, radius * radius - (px - x) ** 2));
      if (half > .1) lines.push([new Vector3(px, y + .022, z - half), new Vector3(px, y + .022, z + half)]);
    }
    for (let pz = Math.ceil(z - radius); pz <= z + radius; pz++) {
      const half = Math.sqrt(Math.max(0, radius * radius - (pz - z) ** 2));
      if (half > .1) lines.push([new Vector3(x - half, y + .022, pz), new Vector3(x + half, y + .022, pz)]);
    }
    this.grid = MeshBuilder.CreateLineSystem('gentle-building-grid', { lines }, this.scene);
    this.grid.color = Color3.FromHexString('#759579'); this.grid.alpha = .25;
    this.grid.parent = this.groundRoot; this.grid.isPickable = false;
    this.grid.position.y = this.floorY - this.islandSpec.y;
    this.grid.setEnabled(this.mode === 'wall' || this.mode === 'furniture');
    this.canvas.dataset.environment = 'clay-cloud-island';
    this.canvas.dataset.environmentBuilds = String(++this.environmentBuilds);
    this.environmentKey = key;
  }
  private polygon(name: string, space: Space, height: number, thickness: number, tone: string) {
    const builder = new PolygonMeshBuilder(name, space.polygon.map(point => new Vector2(point.x, point.z)), this.scene, earcut);
    for (const hole of space.holes || []) builder.addHole(hole.map(point => new Vector2(point.x, point.z)));
    const mesh = builder.build(false, thickness);
    mesh.position.y = height; mesh.material = this.material(tone); mesh.parent = this.contentRoot;
    mesh.isPickable = false; mesh.receiveShadows = true; this.addShadow(mesh); return mesh;
  }
  private inside(point: Point2, ring: Point2[]) {
    let included = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) included = !included;
    }
    return included;
  }
  private decoratedMaterial(key: string, paint: (context: CanvasRenderingContext2D) => void, alpha = 1, pixelated = false) {
    const existing = this.wallArtMaterials.get(key); if (existing) return existing;
    const texture = new DynamicTexture(key + '-texture', { width: 512, height: 512 }, this.scene, true, pixelated ? Texture.NEAREST_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE);
    paint(texture.getContext() as unknown as CanvasRenderingContext2D);
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE; texture.update(true);
    const material = new StandardMaterial(key, this.scene);
    material.diffuseColor = Color3.White(); material.diffuseTexture = texture;
    material.specularColor = new Color3(.05, .04, .04); material.alpha = alpha;
    material.backFaceCulling = false; this.wallArtMaterials.set(key, material); return material;
  }
  private roofMaterial(style: string, tone: string) {
    return this.toyTexture(this.decoratedMaterial('exterior-roof:' + style + ':' + tone, context => paintRoofPattern(context, style, tone)));
  }
  private continuousRoof(footprint: Parameters<typeof createRoofSurface>[0], top: number, tone: string, style: string, budget: number) {
    const surface = createRoofSurface(footprint, { style, pitch: style === 'roof_castle' ? .32 : style === 'roof_starry' ? .4 : style === 'roof_oriental' ? .48 : .62, maxTriangles: budget });
    const root = new TransformNode('continuous-roof-' + style, this.scene), adapter = this.toyAdapter(root);
    root.parent = this.contentRoot;
    const base = top + .06, thickness = .08;
    // 大跨度保持同一比例缩放，不能把屋脊截成平顶，也避免大宅长出过高的屋盖。
    const castle = style === 'roof_castle' || style === 'roof_starry';
    const heightScale = Math.min(1, (style === 'roof_castle' ? .10 : style === 'roof_starry' ? .22 : 1.3) / Math.max(.001, surface.peak.height));
    const peak = { ...surface.peak, height: surface.peak.height * heightScale };
    const buildSheet = (underside: boolean) => {
      const mesh = new Mesh(underside ? 'roof-cream-underside' : 'roof-clay-surface', this.scene);
      const data = createRoofVertexData(surface, { baseHeight: base, heightScale, thickness, underside });
      data.applyToMesh(mesh); mesh.parent = root;
      mesh.material = underside ? this.toyMaterial('#FFF0D8') : castle ? this.toyMaterial(style === 'roof_starry' ? '#F0E9FA' : '#FFF3DB') : this.roofMaterial(style, tone);
      mesh.isPickable = false; mesh.receiveShadows = true; this.addShadow(mesh);
    };
    buildSheet(false); buildSheet(true);
    // 细檐沿真实外边界和天井连续绕行；不把二维屋顶轮廓挤成厚实阁楼。
    for (const ring of surface.rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      const rotation = [0, -Math.atan2(b.z - a.z, b.x - a.x), 0];
      const x = (a.x + b.x) / 2 + (b.z - a.z) / length * .08;
      const z = (a.z + b.z) / 2 - (b.x - a.x) / length * .08;
      adapter.box([x, base - .045, z], [length + .14, .07, .18], '#FFF0D8', .03, rotation);
      adapter.box([x, base - .005, z], [length + .14, .035, .20], tone, .015, rotation);
      if(castle) {
        const count = Math.max(1, Math.min(10, Math.floor(length / .8)));
        for(let index=0;index<count;index++) {
          const t=(index+.5)/count;
          adapter.box([a.x+(b.x-a.x)*t,base+.17,a.z+(b.z-a.z)*t],[.30,.26,.30],style==='roof_starry'?'#F6EFFA':'#FFF3DB',.10);
        }
      }
    }
    const at = (point: Point2, raise = 0): PrimitivePoint => [point.x, base + surface.heightAt(point) * heightScale + raise, point.z];
    if (style === 'roof_strawberry') {
      for (let i = -2; i <= 2; i++) adapter.sphere([peak.x + i * .07, base + peak.height + .04, peak.z], [.24, .035, .12], i % 2 ? '#A9C39B' : '#B7CDA7', 12, 6);
      adapter.cylinder([peak.x, base + peak.height + .15, peak.z], .035, .2, '#88A580', .025, 8, [0, 0, -.24]);
    } else if (style === 'roof_starry') {
      adapter.profile(starProfile(), [peak.x, base + peak.height + .04, peak.z], [.24, .24, .03], '#F6DDA3', [Math.PI / 2, 0, 0]);
    } else if (style === 'roof_cloud' || style === 'roof_mushroom') {
      const ring = surface.rings[0], stride = Math.max(1, Math.ceil(ring.length / 16));
      for (let i = 0; i < ring.length; i += stride) adapter.sphere(at(ring[i], .035), [.13, .065, .13], style === 'roof_mushroom' ? '#FFF0D8' : tone, 12, 6);
    } else if (style === 'roof_oriental') {
      for (const point of surface.rings[0]) adapter.sphere(at(point, .04), [.075, .085, .075], tone, 12, 6);
    }
    const exterior = this.visualState.exterior as Record<string, unknown>, chimney = String(exterior.chimney || 'normal');
    if (chimney !== 'none') {
      const xs = footprint.polygon.map(p => p.x), zs = footprint.polygon.map(p => p.z);
      const rear = { x: Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * .26, z: Math.min(...zs) + (Math.max(...zs) - Math.min(...zs)) * .25 };
      const anchor = surface.heightAt(rear) * heightScale > Math.max(.12, peak.height * .5) ? rear : peak;
      const [x, y, z] = at(anchor), body = chimney === 'heart' ? '#DFA9BC' : '#E9CBB7';
      adapter.box([x, y + .2, z], [.28, .45, .30], body, .045);
      adapter.box([x, y + .44, z], [.38, .09, .4], '#FFF0D8', .035);
      adapter.box([x, y + .49, z], [.23, .016, .24], '#9B7B79', .01);
      for (let row = 0; row < 2; row++) adapter.box([x, y + .12 + row * .16, z + .155], [.27, .012, .01], '#C6A18F', .004);
      for (let i = 0; i < 3; i++) {
        if (chimney === 'heart') adapter.profile(heartProfile(), [x + i * .07, y + .58 + i * .2, z], [.14 + i * .025, .13 + i * .025, .06], '#F4C4D2');
        else adapter.cloudSphere([x + i * .07, y + .57 + i * .19, z], [.09 + i * .025, .055 + i * .015, .07 + i * .015], '#FFFDF8', 12, 6);
      }
    }
    adapter.merge(null);
    for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
    this.roofTop = Math.max(this.roofTop, base + peak.height + (chimney === 'none' ? .35 : 1.05));
    this.canvas.dataset.roofTriangleCount = String(Number(this.canvas.dataset.roofTriangleCount || 0) + surface.triangleCount * 2);
  }
  private buildFloorsAndRoofs(spaces: Space[]) {
    for (const space of spaces) this.polygon('room-floor-' + space.id, space, this.floorY + .018, .22, '#EEDCBD');
    if (this.view !== 'exterior' || !spaces.length) return;
    const walls = this.document!.walls.filter(wall => wall.floorId === this.activeFloorId);
    const exterior = this.visualState.exterior as Record<string, unknown>, style = String(exterior.roof || 'roof_triangle');
    const tone = colorValue(exterior.roofColor, '#C86E87'), footprints = mergeRoofFootprints(spaces);
    const openings = this.document!.openings.flatMap(opening => {
      const wall = walls.find(value => value.id === opening.wallId); if (!wall) return [];
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      const point = (distance: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * distance / length, z: wall.start.z + (wall.end.z - wall.start.z) * distance / length });
      return [{ kind: opening.kind, start: point(opening.offset), end: point(opening.offset + opening.width), sill: opening.sill, height: opening.height }];
    });
    for (const footprint of footprints) {
      const top = this.floorY + roofEaveHeight(footprint, walls);
      const root = new TransformNode('toy-house-architecture', this.scene), adapter = this.toyAdapter(root); root.parent = this.contentRoot;
      const kind = this.floorY < this.highestRoofFloor - .001 ? 'cottage' : style === 'roof_castle' ? 'castle' : style === 'roof_starry' ? 'star_castle' : 'cottage';
      const architecture = buildToyArchitecture(adapter, footprint, { floorY: this.floorY, eaveY: top, kind, roofColor: tone,
        doors: openings.filter(value => value.kind === 'door') as ArchitectureOpening[], windows: openings.filter(value => value.kind === 'window') as ArchitectureOpening[] });
      if(kind!=='cottage') {
        const front=footprint.polygon.map((a,index)=>({a,b:footprint.polygon[(index+1)%footprint.polygon.length]})).sort((left,right)=>(right.a.z+right.b.z)-(left.a.z+left.b.z))[0];
        const length=Math.hypot(front.b.x-front.a.x,front.b.z-front.a.z),nx=(front.b.z-front.a.z)/length,nz=-(front.b.x-front.a.x)/length;
        const x=(front.a.x+front.b.x)/2+nx*.19,z=(front.a.z+front.b.z)/2+nz*.19,yaw=Math.atan2(nx,nz);
        adapter.box([x,top+.12,z],[.14,.27,.14],'#FFF7E8',.05);
        adapter.sphere([x,top+.36,z],[.35,.35,.08],'#FFF7E8',20,12,[0,yaw,0]);
        adapter.profile(kind==='star_castle'?starProfile():heartProfile(),[x+nx*.09,top+.14,z+nz*.09],[.44,.44,.07],kind==='star_castle'?'#F6D98B':'#EF9DBD',[0,yaw,0]);
      }
      adapter.merge(null); for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
      this.canvas.dataset.towerCount = String(Number(this.canvas.dataset.towerCount || 0) + architecture.towerCount);
      this.roofTop = Math.max(this.roofTop, top + (architecture.towerCount ? 1.5 : .3));
      if (this.floorY < this.highestRoofFloor - .001) continue;
      const vertices = footprint.polygon.length + (footprint.holes || []).reduce((sum, ring) => sum + ring.length, 0);
      this.continuousRoof(footprint, top, tone, style, Math.max(vertices * 4, 256, Math.floor(16000 / footprints.length)));
    }
    if (this.floorY >= this.highestRoofFloor - .001) this.canvas.dataset.roofCount = String(Number(this.canvas.dataset.roofCount || 0) + footprints.length);
    this.canvas.dataset.roofGeometry = 'continuous-surface';
  }
  private spaceAnchor(space: Space): Point2 {
    const rings = [space.polygon, ...(space.holes || [])], vertices: number[] = [], holes: number[] = [];
    rings.forEach((ring, index) => { if (index) holes.push(vertices.length / 2); ring.forEach(point => vertices.push(point.x, point.z)); });
    const triangles = earcut(vertices, holes, 2);
    let largest = -1, best: Point2 = space.polygon[0];
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i] * 2, b = triangles[i + 1] * 2, c = triangles[i + 2] * 2;
      const area = Math.abs((vertices[b] - vertices[a]) * (vertices[c + 1] - vertices[a + 1]) - (vertices[c] - vertices[a]) * (vertices[b + 1] - vertices[a + 1]));
      if (area > largest) { largest = area; best = { x: (vertices[a] + vertices[b] + vertices[c]) / 3, z: (vertices[a + 1] + vertices[b + 1] + vertices[c + 1]) / 3 }; }
    }
    return best;
  }
  private buildActors(spaces: Space[]) {
    const { x, z, radius } = this.islandSpec;
    let count = 0;
    const add = (name: string, look: unknown, definition: unknown, position: Point2, elevation = this.islandSpec.y) => {
      const root = new TransformNode(name, this.scene), adapter = new ClayAdapter(this, root);
      if (!definition && look) this.nativeAvatarMesh(look as Record<string, unknown>, this.scene, .67).parent = root;
      else { this.models.character(adapter, look, [0, 0, 0], .67, definition); adapter.merge(null); }
      root.parent = this.actorsRoot; root.position.set(position.x, elevation + .025, position.z);
      root.rotation.y = -.15;
      for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
      count++;
    };
    const front = this.bounds.maxZ + 1;
    if (this.visualState.avatar && !this.visualState.hidePlayer) add('my-avatar', this.visualState.avatar, null, { x: x - radius * .08, z: front });
    const residents = this.visualState.residents as Array<{ id: string; roomId: string }> | undefined;
    const definitions = this.contentData.residents as Array<{ id: string }> | undefined;
    (residents || []).forEach((resident, index) => {
      const definition = definitions?.find(value => value.id === resident.id); if (!definition) return;
      const space = spaces.find(value => value.id === resident.roomId || value.legacyRoomId === resident.roomId);
      const position = this.view === 'cutaway' && space ? this.spaceAnchor(space) : { x: x + (index % 5 - 2) * .62, z: front + .65 + Math.floor(index / 5) * .45 };
      add('friend-' + resident.id, null, definition, position, this.view === 'cutaway' && space ? this.document!.floors.find(floor => floor.id === space.floorId)!.elevation : this.islandSpec.y);
    });
    this.canvas.dataset.characterCount = String(count);
  }

  private wallMaterial(wall: Wall) {
    const exterior = this.visualState.exterior as Record<string, unknown>;
    const baseTone = this.view === 'exterior' ? colorValue(exterior.wallColor, wall.color) : wall.color;
    const alpha = this.cutaway ? .38 : 1;
    // 外墙按已选真实外观；墙纸及像素作品只用于进入屋内后的内墙。
    if (this.view === 'exterior') {
      const style = String(exterior.wall || 'wall_wood'), key = `wall-exterior:${style}:${baseTone}:${alpha}`;
      const material = this.decoratedMaterial(key, context => paintExteriorWall(context, style, baseTone), alpha);
      if(style==='wall_toy')this.toyTexture(material);
      this.wallTileSizes.set(material, 5.12); return material;
    }
    const arts = this.visualState.customArts as Array<{ id: string; pixels: string }> | undefined;
    const art = wall.artId && arts?.find(value => value.id === wall.artId);
    const config = this.contentData.creativeConfig as { size: number; symbols: string; palette: string[] } | undefined;
    if (art && config?.size && config.palette && config.symbols) {
      const key = `wall-art:${wall.artId}:${baseTone}:${this.visualRevision}:${alpha}`;
      const material = this.decoratedMaterial(key, context => {
        context.fillStyle = baseTone; context.fillRect(0, 0, 512, 512);
        const cell = 512 / config.size;
        for (let y = 0; y < config.size; y++) for (let x = 0; x < config.size; x++) {
          const index = config.symbols.indexOf(art.pixels[y * config.size + x]); if (index < 0 || !config.palette[index]) continue;
          context.fillStyle = config.palette[index]; context.fillRect(x * cell, y * cell, cell, cell);
        }
      }, alpha, true);
      this.wallTileSizes.set(material, 1.2); return material;
    }
    const pattern = wall.pattern || 'solid';
    if (pattern === 'solid') return this.material(baseTone, alpha);
    const material = this.decoratedMaterial(`wallpaper:${pattern}:${baseTone}:${alpha}`, context => paintWallpaper(context, pattern, baseTone), alpha);
    this.wallTileSizes.set(material, 1.2); return material;
  }

  private buildWall(wall: Wall) {
    const root = new TransformNode('wall-' + wall.id, this.scene);
    root.parent = this.contentRoot; root.position.set(wall.start.x, this.floorY, wall.start.z);
    root.rotation.y = -Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    const openings = (this.document?.openings || []).filter(value => value.wallId === wall.id);
    const xs = [...new Set([0, length, ...openings.flatMap(value => [value.offset, value.offset + value.width])])].filter(value => value >= 0 && value <= length).sort((a, b) => a - b);
    const ys = [...new Set([0, wall.height, ...openings.flatMap(value => [value.sill, value.sill + value.height])])].filter(value => value >= 0 && value <= wall.height).sort((a, b) => a - b);
    for (let xi = 0; xi < xs.length - 1; xi++) for (let yi = 0; yi < ys.length - 1; yi++) {
      const x0 = xs[xi], x1 = xs[xi + 1], y0 = ys[yi], y1 = ys[yi + 1], x = (x0 + x1) / 2, y = (y0 + y1) / 2;
      if (x1 - x0 < .001 || y1 - y0 < .001 || openings.some(value => x > value.offset && x < value.offset + value.width && y > value.sill && y < value.sill + value.height)) continue;
      const mesh = MeshBuilder.CreateBox('wall-panel-' + wall.id, { width: x1 - x0, height: y1 - y0, depth: wall.thickness }, this.scene);
      mesh.position.set(x, y, 0); mesh.parent = root; mesh.metadata = { kind: 'wall', id: wall.id } satisfies Meta;
      const material = this.wallMaterial(wall); mesh.material = material;
      if (material.diffuseTexture) {
        // UV来自整段墙的米制坐标，门窗两侧的重复画作不会在每块墙片重新起头。
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!, uv = mesh.getVerticesData(VertexBuffer.UVKind)!, tileSize = this.wallTileSizes.get(material) || 1.2;
        for (let i = 0; i < positions.length / 3; i++) { uv[i * 2] = (x + positions[i * 3]) / tileSize; uv[i * 2 + 1] = (y + positions[i * 3 + 1]) / tileSize; }
        mesh.setVerticesData(VertexBuffer.UVKind, uv);
      }
      mesh.receiveShadows = true; this.addShadow(mesh);
    }
    for (const opening of openings) {
      const width = opening.width, height = opening.height, x = opening.offset + width / 2, y = opening.sill + height / 2;
      const depth = wall.thickness + .065, meta: Meta = { kind: 'opening', id: opening.id, wallId: wall.id };
      // 凹形/穿过多个空间的长墙，应在这扇窗所在处判断花箱朝外的方向。
      const center = { x: wall.start.x + (wall.end.x - wall.start.x) * x / length, z: wall.start.z + (wall.end.z - wall.start.z) * x / length };
      const normal = { x: -(wall.end.z - wall.start.z) / length, z: (wall.end.x - wall.start.x) / length };
      const plus = { x: center.x + normal.x * .12, z: center.z + normal.z * .12 };
      const plusInside = this.spaces.some(space => this.inside(plus, space.polygon) && !(space.holes || []).some(hole => this.inside(plus, hole)));
      const outward = plusInside ? -1 : 1, faceZ = outward * (depth / 2 + .035);
      const exterior = this.visualState.exterior as Record<string, unknown>;
      const style = String(opening.kind === 'window' ? exterior.window || 'win_square' : exterior.door || 'door_wood');
      const detailRoot = new TransformNode('opening-' + style + '-' + opening.id, this.scene), details = this.toyAdapter(detailRoot);
      addOpeningDetails(details, { x, sill: opening.sill, width, height, depth, faceZ, outward, kind: opening.kind, style });
      if (opening.kind === 'window') {
        const glass = details.profile(openingProfile(style), [x, opening.sill, 0], [width * .94, height * .94, .016], '#B9DEE8');
        glass.material = this.material('#B9DEE8', .55);
        // 浅蓝玻璃与两道小高光，让远景里的窗也能一眼认出来；窗洞仍由真实墙体开口形成。
        for (const face of [-1, 1]) for (const [dx, dy, size] of [[-.23, .73, .16], [-.1, .81, .09]]) {
          details.box([x + dx * width, opening.sill + dy * height, face * .027], [.025, height * size, .014], '#F7FCFF', .009, [0, 0, -.5]);
        }
        if (style === 'win_stained') {
          const panes: Array<{ points: ProfilePoint[]; tone: string }> = [
            { points: [{ x: -.43, y: .18 }, { x: -.43, y: .76 }, { x: 0, y: .49 }], tone: '#D9BAD8' },
            { points: [{ x: .43, y: .18 }, { x: .43, y: .76 }, { x: 0, y: .49 }], tone: '#AFD0BE' },
            { points: [{ x: -.43, y: .05 }, { x: .43, y: .05 }, { x: 0, y: .49 }], tone: '#E9BFAD' },
          ];
          for (const pane of panes) details.profile(pane.points, [x, opening.sill, .012 * outward], [width, height, .012], pane.tone).material = this.material(pane.tone, .38);
        }
        if (!['win_round', 'win_heart'].includes(style)) {
          const boxZ = outward * (depth / 2 + .16);
          details.box([x, opening.sill - .1, boxZ], [width + .03, .18, .23], '#C89676', .035);
          details.box([x, opening.sill - .005, boxZ], [width - .04, .025, .16], '#947459', .01);
          for (const [index, dx] of [-.27, 0, .27].entries()) this.models.flower(details, x + dx * width, boxZ, ['#FFFAF0', '#ED9FB8', '#F3D78C'][index], .48, opening.sill + .005);
        }
      } else {
        const pickPlane = MeshBuilder.CreatePlane('door-opening-pick', { width, height, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
        pickPlane.position.set(x, y, 0); pickPlane.parent = root; pickPlane.visibility = 0; pickPlane.metadata = meta;
      }
      details.merge(meta); detailRoot.parent = root;
    }
  }

  private buildFurniture(item: Furniture) {
    const def = this.catalog[item.defId]; if (!def || !this.contentRoot) return;
    const root = new TransformNode('furniture-' + item.id, this.scene);
    const adapter = new ClayAdapter(this, root);
    this.models.furniture(adapter, def, item, [0, 0, 0], [item.dimensions.width, item.dimensions.height, item.dimensions.depth]);
    adapter.merge({ kind: 'furniture', id: item.id });
    root.parent = this.contentRoot;
    root.position.set(item.position.x, this.floorY + item.position.y, item.position.z);
    root.rotation.y = -item.rotation;
    this.furnitureRoots.set(item.id, root);
  }
  private updateGhost() {
    this.ghost?.dispose(false); this.ghost = null;
    if (this.mode !== 'furniture' || !this.placementId || !this.catalog[this.placementId]) return;
    const def = this.catalog[this.placementId], dimensions = furnitureDimensions(def);
    const root = new TransformNode('furniture-placement-preview', this.scene);
    const adapter = new ClayAdapter(this, root, true);
    this.models.furniture(adapter, def, {}, [0, 0, 0], [dimensions.width, dimensions.height, dimensions.depth]);
    adapter.merge(null); root.position.y = this.floorY; root.setEnabled(false); this.ghost = root;
  }

  private screenPoint(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private groundPoint(event: PointerEvent): Point2 | null {
    if (this.surface === 'garden') return null;
    const point = this.screenPoint(event), ray = this.scene.createPickingRay(point.x, point.y, Matrix.Identity(), this.camera);
    const distance = ray.intersectsPlane(new Plane(0, 1, 0, -this.floorY));
    if (distance === null || distance < 0) return null;
    const world = ray.origin.add(ray.direction.scale(distance));
    if (Math.hypot(world.x - this.islandSpec.x, world.z - this.islandSpec.z) > this.islandSpec.radius * .98) return null;
    return { x: world.x, z: world.z };
  }
  private pick(event: PointerEvent, wallOnly = false) {
    const p = this.screenPoint(event);
    return this.scene.pick(p.x, p.y, mesh => {
      const meta = mesh.metadata as Meta | null;
      return !!meta && (!wallOnly || meta.kind === 'wall' || meta.kind === 'opening');
    });
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) { this.cancelGesture(); return; }
    if (this.surface === 'garden') {
      const point = this.screenPoint(event), pick = this.scene.pick(point.x, point.y, mesh => mesh.isEnabled() && mesh.metadata?.kind === 'gardenPlot');
      this.gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, hit: null, gardenPlot: pick?.pickedMesh?.metadata?.index };
      return;
    }
    const pick = this.pick(event, this.mode === 'door' || this.mode === 'window'), hit = (pick?.pickedMesh?.metadata || null) as Meta | null;
    const ground = this.groundPoint(event);
    this.gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, hit, point: ground || undefined };
    if (!this.readOnly && this.view === 'cutaway' && this.mode === 'select' && hit?.kind === 'furniture') {
      const root = this.furnitureRoots.get(hit.id);
      if (root && ground) {
        this.gesture.position = root.position.clone(); this.gesture.grab = { x: root.position.x - ground.x, z: root.position.z - ground.z };
        this.camera.detachControl(); this.callbacks.onSelect?.('furniture', hit.id); this.select('furniture', hit.id);
      }
    }
    if (!this.readOnly && (this.mode !== 'select' || hit?.kind === 'furniture')) {
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* 页面失焦时由cancel处理。 */ }
      event.preventDefault();
    }
  };
  private pointerMove = (event: PointerEvent) => {
    const ground = this.groundPoint(event);
    if (ground) {
      this.callbacks.onHoverGround?.(ground);
      if (this.ghost) { this.ghost.position.set(ground.x, this.floorY, ground.z); this.ghost.setEnabled(true); }
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
    if (!this.readOnly && gesture.moved && gesture.hit?.kind === 'furniture' && gesture.grab && ground) {
      const root = this.furnitureRoots.get(gesture.hit.id);
      if (root) root.position.set(ground.x + gesture.grab.x, gesture.position!.y, ground.z + gesture.grab.z);
      event.preventDefault();
    }
  };
  private pointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.mode === 'select') this.camera.attachControl(this.canvas, true);
    if (this.surface === 'garden') {
      if (!gesture.moved && Number.isInteger(gesture.gardenPlot)) this.callbacks.onGardenPlot?.(gesture.gardenPlot!);
      return;
    }
    if (!this.readOnly && gesture.hit?.kind === 'furniture' && gesture.position && gesture.moved) {
      const root = this.furnitureRoots.get(gesture.hit.id);
      if (root) {
        const position = { x: root.position.x, y: root.position.y - this.floorY, z: root.position.z };
        root.position.copyFrom(gesture.position); this.callbacks.onMove?.(gesture.hit.id, position);
      }
      return;
    }
    if (gesture.moved) return;
    if (this.mode === 'door' || this.mode === 'window') {
      const pick = this.pick(event, true), meta = pick?.pickedMesh?.metadata as Meta | null;
      const wallId = meta?.kind === 'wall' ? meta.id : meta?.wallId;
      const wall = this.document?.walls.find(value => value.id === wallId);
      if (wall && pick?.pickedPoint) {
        const dx = wall.end.x - wall.start.x, dz = wall.end.z - wall.start.z, length = Math.hypot(dx, dz);
        this.callbacks.onWall?.(wall.id, ((pick.pickedPoint.x - wall.start.x) * dx + (pick.pickedPoint.z - wall.start.z) * dz) / length);
      }
      return;
    }
    if (this.mode === 'select') {
      const meta = gesture.hit;
      this.select(meta?.kind || 'none', meta?.id || null); this.callbacks.onSelect?.(meta?.kind || 'none', meta?.id || null);
      if (!meta) { const point = this.groundPoint(event); if (point) this.callbacks.onGround?.(point); }
      return;
    }
    const ground = this.groundPoint(event); if (ground) this.callbacks.onGround?.(ground);
  };
  private cancelGesture() {
    const gesture = this.gesture;
    if (gesture?.position && gesture.hit?.kind === 'furniture') this.furnitureRoots.get(gesture.hit.id)?.position.copyFrom(gesture.position);
    this.gesture = null;
    if (this.mode === 'select') this.camera.attachControl(this.canvas, true);
  }
  private pointerCancel = (event: PointerEvent) => { this.pointers.delete(event.pointerId); this.cancelGesture(); };
  private contextMenu = (event: Event) => { event.preventDefault(); };
  private renderFrame = () => {
    const now = performance.now();
    if (this.disposed || document.hidden) return;
    const stageActive = [...this.avatarStages].some(stage => !stage.disposed && stage.canvas.isConnected);
    if (!this.thumbnailRendering && now - this.lastPaint >= (stageActive ? 200 : 1000 / 30)) { this.lastPaint = now; this.scene.render(); }
    for (const stage of this.avatarStages) this.scheduleAvatarStage(stage, now);
  };
  private visibilityChange = () => {
    if (document.hidden) { this.engine.stopRenderLoop(this.renderFrame); this.cancelGesture(); this.pointers.clear(); }
    else {
      this.lastPaint = 0; this.engine.runRenderLoop(this.renderFrame); this.engine.resize();
      for (const resume of this.visibilityWaiters) resume(); this.visibilityWaiters.clear();
    }
  };
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.engine.stopRenderLoop(this.renderFrame); this.resizeObserver.disconnect();
    for (const stage of this.avatarStages) { stage.disposed = true; stage.observer.disconnect(); stage.target?.dispose(); stage.scene.dispose(); }
    this.avatarStages.clear();
    this.canvas.removeEventListener('pointerdown', this.pointerDown); this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp); this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('contextmenu', this.contextMenu); document.removeEventListener('visibilitychange', this.visibilityChange);
    this.scene.dispose(); this.engine.dispose(); this.canvas.dataset.ready = 'false';
    for (const resume of this.visibilityWaiters) resume(); this.visibilityWaiters.clear();
    for (const image of this.thumbnailCache.values()) image.width = image.height = 1;
    this.thumbnailCache.clear(); this.thumbnailPending.clear();
  }
}
