import { furnitureDimensions, type Dimensions, type FurnitureCatalog, type FurnitureDefinition } from './catalog';

export type { Dimensions, FurnitureCatalog, FurnitureDefinition } from './catalog';
export { furnitureDimensions } from './catalog';

export interface Point2 { x: number; z: number }
export interface Vec3 extends Point2 { y: number }
export interface Floor { id: string; name: string; elevation: number }
export interface Wall {
  id: string; floorId: string; start: Point2; end: Point2;
  height: number; thickness: number; color: string;
  pattern?: 'solid' | 'dots' | 'stripes';
  artId?: string;
}
export interface Opening {
  id: string; wallId: string; kind: 'door' | 'window';
  /** 从墙start到开口左边缘的米数，sill为开口底部离楼面高度。 */
  offset: number; width: number; height: number; sill: number;
}
export interface Furniture {
  id: string; defId: string; floorId: string; position: Vec3;
  /** 绕Y轴的弧度；position.y是实体底部相对楼层的高度。 */
  rotation: number; dimensions: Dimensions;
  color?: string; legacyRoomId?: string; artId?: string;
}
export interface LegacyRoomMapping {
  id: string; floorId: string; type: string;
  /** 只保留生活内容的房间关联；origin是旧矩形的左后角，不参与生成新墙体。 */
  origin: Point2; width: number; depth: number;
}
export interface BuildingDocument {
  schema: 2; revision: number; floors: Floor[]; walls: Wall[];
  openings: Opening[]; furniture: Furniture[];
  migration?: { source: 'legacy-v1'; sourceHash: string; rooms: LegacyRoomMapping[] };
}
export interface Space { id: string; floorId: string; polygon: Point2[]; holes?: Point2[][]; area: number; legacyRoomId?: string }
export type BuildingCommand =
  | { type: 'wall.add'; wall: Wall }
  | { type: 'opening.add'; opening: Opening }
  | { type: 'furniture.add'; furniture: Furniture }
  | { type: 'furniture.move'; id: string; position: Vec3; rotation?: number }
  | { type: 'wall.decorate'; wallIds: string[]; artId: string | null }
  | { type: 'wall.finish'; wallIds: string[]; color: string; pattern: 'solid' | 'dots' | 'stripes' }
  | { type: 'entity.remove'; id: string }
  | { type: 'floor.add'; floor: Floor };

const EPSILON = 1e-7;
const WORLD_LIMIT = 1000;
const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
type RecordValue = Record<string, unknown>;
function fail(message: string): never { throw new Error(message); }
function need(condition: unknown, message: string): asserts condition { if (!condition) fail(message); }
function record(value: unknown): value is RecordValue {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function shape(value: unknown, keys: string[], optional: string[] = []): asserts value is RecordValue {
  need(record(value), '建筑记录必须是普通对象。');
  need(Object.keys(value).every(key => keys.includes(key)), '建筑记录含未识别字段。');
  need(keys.every(key => optional.includes(key) || own(value, key)), '建筑记录缺少必要字段。');
}
function safeTree(value: unknown, depth = 0, count = { value: 0 }): void {
  need(depth <= 20 && ++count.value <= 250000, '建筑记录过于复杂。');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { need(Number.isFinite(value), '建筑坐标必须是有限数字。'); return; }
  if (typeof value === 'string') { need(value.length <= 20000, '建筑文本超过限制。'); return; }
  need(Array.isArray(value) || record(value), '建筑记录含不支持的数据。');
  need(Object.keys(value).length <= 20000, '建筑记录超过限制。');
  for (const key of Object.keys(value)) {
    need(!['__proto__', 'constructor', 'prototype'].includes(key), '建筑记录含危险字段。');
    safeTree((value as RecordValue)[key], depth + 1, count);
  }
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_:-]{1,128}$/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
}
function numeric(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return numeric(value, minimum, maximum) && Number.isInteger(value);
}
function hex(value: unknown): value is string { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value); }
function point(value: unknown): asserts value is Point2 {
  shape(value, ['x', 'z']);
  need(numeric(value.x, -WORLD_LIMIT, WORLD_LIMIT) && numeric(value.z, -WORLD_LIMIT, WORLD_LIMIT), '墙体坐标超出地块范围。');
}
function vector(value: unknown): asserts value is Vec3 {
  shape(value, ['x', 'y', 'z']);
  need(numeric(value.x, -WORLD_LIMIT, WORLD_LIMIT) && numeric(value.z, -WORLD_LIMIT, WORLD_LIMIT) &&
    numeric(value.y, 0, 100), '家具位置超出地块范围。');
}
function size(value: unknown): asserts value is Dimensions {
  shape(value, ['width', 'height', 'depth']);
  need([value.width, value.height, value.depth].every(dimension => numeric(dimension, .01, 30)), '家具尺寸无效。');
}
function distance(a: Point2, b: Point2): number { return Math.hypot(b.x - a.x, b.z - a.z); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function round(value: number): number { return Math.round(value * 1e6) / 1e6; }
function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
  return result.toString(16).padStart(8, '0');
}

export function createEmptyDocument(): BuildingDocument {
  return { schema: 2, revision: 0, floors: [{ id: 'floor_0', name: '一楼', elevation: 0 }], walls: [], openings: [], furniture: [] };
}

/** 校验/导入返回独立文档，绝不修补已有schema2记录。 */
export function validateDocument(raw: unknown, catalog?: FurnitureCatalog): BuildingDocument {
  safeTree(raw);
  shape(raw, ['schema', 'revision', 'floors', 'walls', 'openings', 'furniture', 'migration'], ['migration']);
  need(raw.schema === 2, typeof raw.schema === 'number' && raw.schema > 2 ? '这是较新版本的建筑，暂时无法打开。' : '建筑版本不受支持。');
  need(integer(raw.revision, 0, Number.MAX_SAFE_INTEGER), '建筑修订号无效。');
  need(Array.isArray(raw.floors) && raw.floors.length >= 1 && raw.floors.length <= 32, '楼层数量超出限制。');
  need(Array.isArray(raw.walls) && raw.walls.length <= 2000, '墙体数量超出限制。');
  need(Array.isArray(raw.openings) && raw.openings.length <= 4000, '门窗数量超出限制。');
  need(Array.isArray(raw.furniture) && raw.furniture.length <= 3000, '家具数量超出限制。');
  const ids = new Set<string>(), floorIds = new Set<string>(), walls = new Map<string, Wall>();
  function identity(value: unknown): asserts value is string {
    need(id(value) && !ids.has(value), '建筑实体编号无效或重复。'); ids.add(value);
  }
  for (const floor of raw.floors) {
    shape(floor, ['id', 'name', 'elevation']); identity(floor.id); floorIds.add(floor.id);
    need(typeof floor.name === 'string' && floor.name.trim().length > 0 && floor.name.length <= 40 && !/[\x00-\x1f\x7f]/.test(floor.name), '楼层名称无效。');
    need(numeric(floor.elevation, -100, 200), '楼层高度超出范围。');
  }
  for (const wall of raw.walls) {
    shape(wall, ['id', 'floorId', 'start', 'end', 'height', 'thickness', 'color', 'artId', 'pattern'], ['artId', 'pattern']); identity(wall.id);
    need(typeof wall.floorId === 'string' && floorIds.has(wall.floorId), '墙体引用了不存在的楼层。');
    point(wall.start); point(wall.end);
    need(distance(wall.start, wall.end) >= .1 && distance(wall.start, wall.end) <= 200, '墙体长度须在0.1至200米之间。');
    need(numeric(wall.height, .2, 20) && numeric(wall.thickness, .02, 2) && hex(wall.color), '墙体高度、厚度或颜色无效。');
    if (own(wall, 'artId')) need(id(wall.artId), '墙面作品关联编号无效。');
    if (own(wall, 'pattern')) need(['solid', 'dots', 'stripes'].includes(wall.pattern as string), '墙纸花纹无效。');
    walls.set(wall.id, wall as unknown as Wall);
  }
  const wallList = [...walls.values()];
  for (let first = 0; first < wallList.length; first++) for (let second = first + 1; second < wallList.length; second++) {
    const a = wallList[first], b = wallList[second];
    if (a.floorId !== b.floorId) continue;
    const direction = difference(a.end, a.start), length = distance(a.start, a.end);
    if (Math.abs(cross(direction, difference(b.start, a.start))) > EPSILON * length ||
      Math.abs(cross(direction, difference(b.end, a.start))) > EPSILON * length) continue;
    const projection = (point: Point2): number => ((point.x - a.start.x) * direction.x + (point.z - a.start.z) * direction.z) / length;
    const from = projection(b.start), to = projection(b.end);
    need(Math.min(length, Math.max(from, to)) - Math.max(0, Math.min(from, to)) <= EPSILON, '同一楼层不能重复叠画相同墙段。');
  }
  const openingsByWall = new Map<string, Opening[]>();
  for (const opening of raw.openings) {
    shape(opening, ['id', 'wallId', 'kind', 'offset', 'width', 'height', 'sill']); identity(opening.id);
    need(typeof opening.wallId === 'string' && walls.has(opening.wallId), '门窗引用了不存在的墙。');
    const wall = walls.get(opening.wallId)!;
    need(opening.kind === 'door' || opening.kind === 'window', '请选择门或窗。');
    need(numeric(opening.offset, 0, 200) && numeric(opening.width, .1, 20) &&
      numeric(opening.height, .1, 20) && numeric(opening.sill, 0, 20), '门窗尺寸或位置无效。');
    need(opening.offset + opening.width <= distance(wall.start, wall.end) + EPSILON &&
      opening.sill + opening.height <= wall.height + EPSILON, '门窗必须完全位于墙面之内。');
    need(opening.kind !== 'door' || opening.sill === 0, '门必须从楼面开始。');
    const existing = openingsByWall.get(opening.wallId) || [];
    for (const other of existing) {
      const overlapsHorizontally = opening.offset < other.offset + other.width - EPSILON && other.offset < opening.offset + opening.width - EPSILON;
      const overlapsVertically = opening.sill < other.sill + other.height - EPSILON && other.sill < opening.sill + opening.height - EPSILON;
      need(!overlapsHorizontally || !overlapsVertically, '同一墙上的门窗不能重叠。');
    }
    existing.push(opening as unknown as Opening); openingsByWall.set(opening.wallId, existing);
  }
  for (const furniture of raw.furniture) {
    shape(furniture, ['id', 'defId', 'floorId', 'position', 'rotation', 'dimensions', 'color', 'legacyRoomId', 'artId'], ['color', 'legacyRoomId', 'artId']);
    identity(furniture.id);
    need(id(furniture.defId), '家具内容编号无效。');
    need(!catalog || own(catalog, furniture.defId) && !!catalog[furniture.defId], '这件家具不在当前内容目录中。');
    need(typeof furniture.floorId === 'string' && floorIds.has(furniture.floorId), '家具引用了不存在的楼层。');
    vector(furniture.position); size(furniture.dimensions);
    need(numeric(furniture.rotation, -Math.PI * 100, Math.PI * 100), '家具朝向无效。');
    const halfX = (Math.abs(Math.cos(furniture.rotation)) * furniture.dimensions.width + Math.abs(Math.sin(furniture.rotation)) * furniture.dimensions.depth) / 2;
    const halfZ = (Math.abs(Math.sin(furniture.rotation)) * furniture.dimensions.width + Math.abs(Math.cos(furniture.rotation)) * furniture.dimensions.depth) / 2;
    need(Math.abs(furniture.position.x) + halfX <= WORLD_LIMIT && Math.abs(furniture.position.z) + halfZ <= WORLD_LIMIT && furniture.position.y + furniture.dimensions.height <= 100, '家具整体超出地块或高度范围。');
    if (own(furniture, 'color')) need(hex(furniture.color), '家具颜色无效。');
    if (own(furniture, 'legacyRoomId')) need(id(furniture.legacyRoomId), '旧房间关联编号无效。');
    if (own(furniture, 'artId')) need(id(furniture.artId), '画作关联编号无效。');
  }
  if (own(raw, 'migration')) {
    const migration = raw.migration;
    shape(migration, ['source', 'sourceHash', 'rooms']);
    need(migration.source === 'legacy-v1' && typeof migration.sourceHash === 'string' && /^[\da-f]{8}$/.test(migration.sourceHash), '建筑迁移凭据无效。');
    need(Array.isArray(migration.rooms) && migration.rooms.length <= 32, '旧房间映射无效。');
    const roomIds = new Set<string>();
    for (const room of migration.rooms) {
      shape(room, ['id', 'floorId', 'type', 'origin', 'width', 'depth']);
      need(id(room.id) && !roomIds.has(room.id), '旧房间映射编号重复。'); roomIds.add(room.id);
      need(typeof room.floorId === 'string' && floorIds.has(room.floorId) && id(room.type), '旧房间映射引用无效。');
      point(room.origin);
      need(numeric(room.width, .1, 200) && numeric(room.depth, .1, 200), '旧房间映射尺寸无效。');
    }
  }
  return clone(raw as unknown as BuildingDocument);
}

/** 所有命令先准备新副本，校验失败时调用方文档完全不变。 */
export function executeCommand(document: BuildingDocument, command: BuildingCommand, catalog?: FurnitureCatalog): BuildingDocument {
  const next = validateDocument(document, catalog);
  safeTree(command);
  need(record(command) && typeof command.type === 'string', '建筑操作无效。');
  switch (command.type) {
    case 'wall.add': shape(command, ['type', 'wall']); next.walls.push(clone(command.wall)); break;
    case 'opening.add': shape(command, ['type', 'opening']); next.openings.push(clone(command.opening)); break;
    case 'furniture.add': shape(command, ['type', 'furniture']); next.furniture.push(clone(command.furniture)); break;
    case 'floor.add': shape(command, ['type', 'floor']); next.floors.push(clone(command.floor)); break;
    case 'wall.finish': {
      shape(command, ['type', 'wallIds', 'color', 'pattern']);
      need(hex(command.color) && ['solid', 'dots', 'stripes'].includes(command.pattern), '请选择有效的墙纸颜色和花纹。');
      need(Array.isArray(command.wallIds) && command.wallIds.length > 0 && command.wallIds.length <= 2000 && new Set(command.wallIds).size === command.wallIds.length, '请选择实际存在的墙面。');
      for (const wallId of command.wallIds) {
        const wall = next.walls.find(wall => wall.id === wallId);
        need(wall, '要装饰的墙面已经不存在。');
        wall.color = command.color; wall.pattern = command.pattern; delete wall.artId;
      }
      break;
    }
    case 'wall.decorate': {
      shape(command, ['type', 'wallIds', 'artId']);
      need(Array.isArray(command.wallIds) && command.wallIds.length > 0 && command.wallIds.length <= 2000 && new Set(command.wallIds).size === command.wallIds.length, '请选择实际存在的墙面。');
      need(command.artId === null || id(command.artId), '墙面作品编号无效。');
      for (const wallId of command.wallIds) {
        const wall = next.walls.find(wall => wall.id === wallId);
        need(wall, '要装饰的墙面已经不存在。');
        if (command.artId === null) delete wall.artId;
        else wall.artId = command.artId;
      }
      break;
    }
    case 'furniture.move': {
      shape(command, ['type', 'id', 'position', 'rotation'], ['rotation']);
      const furniture = next.furniture.find(item => item.id === command.id);
      need(furniture, '要移动的家具已经不存在。');
      furniture.position = clone(command.position);
      if (command.rotation !== undefined) furniture.rotation = command.rotation;
      break;
    }
    case 'entity.remove': {
      shape(command, ['type', 'id']);
      need(id(command.id), '要删除的实体编号无效。');
      if (next.walls.some(wall => wall.id === command.id)) {
        next.walls = next.walls.filter(wall => wall.id !== command.id);
        next.openings = next.openings.filter(opening => opening.wallId !== command.id);
      } else if (next.furniture.some(furniture => furniture.id === command.id)) next.furniture = next.furniture.filter(furniture => furniture.id !== command.id);
      else if (next.openings.some(opening => opening.id === command.id)) next.openings = next.openings.filter(opening => opening.id !== command.id);
      else fail('要删除的实体已经不存在，楼层不能作为普通实体删除。');
      break;
    }
    default: fail('这项建筑操作暂不支持。');
  }
  need(next.revision < Number.MAX_SAFE_INTEGER, '建筑修订号已达到上限。');
  next.revision += 1;
  return validateDocument(next, catalog);
}

function cross(a: Point2, b: Point2): number { return a.x * b.z - a.z * b.x; }
function difference(a: Point2, b: Point2): Point2 { return { x: a.x - b.x, z: a.z - b.z }; }
function interpolate(a: Point2, b: Point2, ratio: number): Point2 { return { x: round(a.x + (b.x - a.x) * ratio), z: round(a.z + (b.z - a.z) * ratio) }; }
function signedArea(points: Point2[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]; return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}
function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let first = 0, previous = polygon.length - 1; first < polygon.length; previous = first++) {
    const a = polygon[first], b = polygon[previous];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function pointOnBoundary(point: Point2, polygon: Point2[]): boolean {
  return polygon.some((a, index) => {
    const b = polygon[(index + 1) % polygon.length], ab = difference(b, a), ap = difference(point, a);
    return Math.abs(cross(ab, ap)) < EPSILON && point.x >= Math.min(a.x, b.x) - EPSILON &&
      point.x <= Math.max(a.x, b.x) + EPSILON && point.z >= Math.min(a.z, b.z) - EPSILON && point.z <= Math.max(a.z, b.z) + EPSILON;
  });
}

/** 从墙中心线的平面图推导有界面，支持任意角度、T结点与相交墙。 */
export function deriveSpaces(document: BuildingDocument, floorId: string): Space[] {
  const doc = validateDocument(document), walls = doc.walls.filter(wall => wall.floorId === floorId);
  need(doc.floors.some(floor => floor.id === floorId), '要分析的楼层不存在。');
  const splits = walls.map(() => [0, 1]);
  for (let first = 0; first < walls.length; first++) for (let second = first + 1; second < walls.length; second++) {
    const a = walls[first], b = walls[second], r = difference(a.end, a.start), s = difference(b.end, b.start), q = difference(b.start, a.start), divisor = cross(r, s);
    if (Math.abs(divisor) > EPSILON) {
      const t = cross(q, s) / divisor, u = cross(q, r) / divisor;
      if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
        splits[first].push(Math.max(0, Math.min(1, t))); splits[second].push(Math.max(0, Math.min(1, u)));
      }
    } else if (Math.abs(cross(q, r)) < EPSILON) {
      // 共线墙端点也成为图结点；重复边在下面合并，不制造虚构房间。
      const parameter = (p: Point2, start: Point2, direction: Point2): number =>
        ((p.x - start.x) * direction.x + (p.z - start.z) * direction.z) / (direction.x ** 2 + direction.z ** 2);
      for (const endpoint of [b.start, b.end]) { const t = parameter(endpoint, a.start, r); if (t > 0 && t < 1) splits[first].push(t); }
      for (const endpoint of [a.start, a.end]) { const u = parameter(endpoint, b.start, s); if (u > 0 && u < 1) splits[second].push(u); }
    }
  }
  const nodes = new Map<string, Point2>(), adjacency = new Map<string, Set<string>>();
  const key = (p: Point2): string => `${round(p.x)},${round(p.z)}`;
  function connect(a: Point2, b: Point2): void {
    const aKey = key(a), bKey = key(b); if (aKey === bKey) return;
    nodes.set(aKey, a); nodes.set(bKey, b);
    if (!adjacency.has(aKey)) adjacency.set(aKey, new Set());
    if (!adjacency.has(bKey)) adjacency.set(bKey, new Set());
    adjacency.get(aKey)!.add(bKey); adjacency.get(bKey)!.add(aKey);
  }
  walls.forEach((wall, index) => {
    const ordered = splits[index].sort((a, b) => a - b).filter((value, part, values) => !part || value - values[part - 1] > EPSILON);
    for (let part = 1; part < ordered.length; part++) connect(interpolate(wall.start, wall.end, ordered[part - 1]), interpolate(wall.start, wall.end, ordered[part]));
  });
  // 无闭环的墙和连接两个闭环的单桥不围成空间；迭代DFS避免大图递归溢栈。
  const discovered = new Map<string, number>(), low = new Map<string, number>(), bridges: [string, string][] = [];
  let order = 0;
  for (const start of adjacency.keys()) {
    if (discovered.has(start)) continue;
    discovered.set(start, ++order); low.set(start, order);
    const stack: { node: string; parent?: string; neighbors: string[]; cursor: number }[] = [{ node: start, neighbors: [...adjacency.get(start)!], cursor: 0 }];
    while (stack.length) {
      const current = stack[stack.length - 1];
      if (current.cursor < current.neighbors.length) {
        const next = current.neighbors[current.cursor++];
        if (next === current.parent) continue;
        if (!discovered.has(next)) {
          discovered.set(next, ++order); low.set(next, order);
          stack.push({ node: next, parent: current.node, neighbors: [...adjacency.get(next)!], cursor: 0 });
        } else low.set(current.node, Math.min(low.get(current.node)!, discovered.get(next)!));
      } else {
        stack.pop();
        if (current.parent) {
          low.set(current.parent, Math.min(low.get(current.parent)!, low.get(current.node)!));
          if (low.get(current.node)! > discovered.get(current.parent)!) bridges.push([current.parent, current.node]);
        }
      }
    }
  }
  for (const [a, b] of bridges) { adjacency.get(a)!.delete(b); adjacency.get(b)!.delete(a); }
  const orderedNeighbors = new Map<string, string[]>();
  for (const [node, neighbors] of adjacency) {
    const center = nodes.get(node)!;
    orderedNeighbors.set(node, [...neighbors].sort((a, b) => {
      const first = nodes.get(a)!, second = nodes.get(b)!;
      return Math.atan2(first.z - center.z, first.x - center.x) - Math.atan2(second.z - center.z, second.x - center.x);
    }));
  }
  const visited = new Set<string>(), spaces: Space[] = [];
  for (const [start, neighbors] of orderedNeighbors) for (const neighbor of neighbors) {
    const initialEdge = `${start}|${neighbor}`;
    if (visited.has(initialEdge)) continue;
    let from = start, to = neighbor, closed = false;
    const polygon: Point2[] = [];
    for (let step = 0; step <= walls.length * 8 + 8; step++) {
      const edge = `${from}|${to}`;
      if (visited.has(edge)) { closed = edge === initialEdge; break; }
      visited.add(edge); polygon.push(nodes.get(from)!);
      const around = orderedNeighbors.get(to)!, incoming = around.indexOf(from);
      const onward = around[(incoming + around.length - 1) % around.length];
      from = to; to = onward;
    }
    const area = signedArea(polygon);
    if (!closed || polygon.length < 3 || area <= .01) continue;
    // 起点变化不改变空间编号；方向已经由半边遍历固定为正面积。
    const keys = polygon.map(key), minimum = keys.reduce((best, value, index) => value < keys[best] ? index : best, 0);
    const stable = keys.slice(minimum).concat(keys.slice(0, minimum)).join(';');
    const room = doc.migration?.rooms.find(legacy => legacy.floorId === floorId && pointInPolygon({ x: legacy.origin.x + legacy.width / 2, z: legacy.origin.z + legacy.depth / 2 }, polygon));
    spaces.push({ id: `space_${hash(`${floorId}:${stable}`)}`, floorId, polygon: polygon.map(point => ({ ...point })), area: round(area), ...(room ? { legacyRoomId: room.id } : {}) });
  }
  // 不相连的内环围成独立小空间，同时在外侧空间中形成洞，不能重复计算面积。
  const containers = new Map<Space, Space>();
  for (const inner of spaces) {
    const parent = spaces.filter(outer => outer !== inner && outer.area > inner.area + EPSILON &&
      inner.polygon.every(point => !pointOnBoundary(point, outer.polygon) && pointInPolygon(point, outer.polygon)))
      .sort((a, b) => a.area - b.area)[0];
    if (parent) containers.set(inner, parent);
  }
  for (const outer of spaces) {
    const children = spaces.filter(inner => containers.get(inner) === outer);
    if (children.length) {
      outer.holes = children.map(inner => inner.polygon.slice().reverse().map(point => ({ ...point })));
      outer.area = round(outer.area - children.reduce((total, inner) => total + Math.abs(signedArea(inner.polygon)), 0));
    }
    const room = doc.migration?.rooms.find(legacy => {
      const center = { x: legacy.origin.x + legacy.width / 2, z: legacy.origin.z + legacy.depth / 2 };
      return legacy.floorId === floorId && pointInPolygon(center, outer.polygon) &&
        !outer.holes?.some(hole => pointInPolygon(center, hole));
    });
    delete outer.legacyRoomId;
    if (room) outer.legacyRoomId = room.id;
  }
  return spaces.sort((a, b) => a.id.localeCompare(b.id));
}

function legacyNumber(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function legacyRecord(value: unknown): RecordValue { return record(value) ? value : {}; }
function legacyArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function migrationId(value: string): string { return value.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 96); }

/** 旧house只作为一次性来源，已有新建筑绝不由旧数据覆盖。 */
export function migrateLegacyHouse(save: unknown, catalog?: FurnitureCatalog): BuildingDocument {
  need(record(save), '需要完整的旧版小屋存档。');
  if (own(save, 'building')) return validateDocument(save.building, catalog);
  if (own(save, 'schema')) return validateDocument(save, catalog);
  const house = own(save, 'house') ? legacyRecord(save.house) : save;
  safeTree(house);
  if (own(save, 'version')) need(save.version === 1, '旧小屋存档版本不受支持。');
  need(Array.isArray(house.floors) && record(house.rooms), '旧版小屋缺少楼层或房间。');
  const result: BuildingDocument = { schema: 2, revision: 0, floors: [], walls: [], openings: [], furniture: [], migration: { source: 'legacy-v1', sourceHash: hash(JSON.stringify(house)), rooms: [] } };
  const roomWidth = 4, roomDepth = 3.2, wallHeight = 2.8;
  function catalogDefinition(defId: string): FurnitureDefinition { return catalog?.[defId] || { id: defId }; }
  function migrateItems(items: unknown[], floorId: string, roomId: string, origin: Point2, width: number, depth: number): void {
    const pendingParents: { entity: Furniture; parentId: string }[] = [];
    for (const raw of items) {
      const item = legacyRecord(raw);
      need(id(item.uid) && id(item.defId), '旧家具编号无效，无法无损迁移。');
      const def = catalogDefinition(item.defId), dimensions = furnitureDimensions(def);
      const legacyWidth = Math.max(1, Math.min(319, legacyNumber(def.w, 60)));
      const ratioX = Math.max(0, Math.min(1, legacyNumber(item.x, 0) / (320 - legacyWidth)));
      const ratioDepth = Math.max(0, Math.min(1, legacyNumber(item.depth, .75)));
      const position: Vec3 = {
        x: round(origin.x + dimensions.width / 2 + ratioX * Math.max(.1, width - dimensions.width)),
        y: 0,
        z: round(origin.z + dimensions.depth / 2 + (1 - ratioDepth) * Math.max(.1, depth - dimensions.depth)),
      };
      if (def.place === 'ceiling') position.y = Math.max(0, wallHeight - dimensions.height - .04);
      if (def.place === 'wall') {
        position.z = origin.z + .06;
        position.y = round(Math.max(.1, Math.min(wallHeight - dimensions.height, wallHeight - (legacyNumber(item.y, 70) + legacyNumber(def.h, 50)) * wallHeight / 220)));
      }
      const entity: Furniture = { id: item.uid, defId: item.defId, floorId, position, rotation: item.flip === true ? Math.PI : 0, dimensions, legacyRoomId: roomId };
      if (hex(item.color)) entity.color = item.color;
      if (id(item.artId)) entity.artId = item.artId;
      result.furniture.push(entity);
      if (typeof item.parent === 'string') pendingParents.push({ entity, parentId: item.parent });
    }
    for (const { entity, parentId } of pendingParents) {
      const parent = result.furniture.find(candidate => candidate.id === parentId && candidate.floorId === floorId && candidate.legacyRoomId === roomId);
      if (parent) { entity.position.y = round(parent.position.y + parent.dimensions.height); entity.position.z = parent.position.z; }
    }
  }
  function migrateRoom(roomId: string, roomRaw: unknown, floorId: string, origin: Point2, type: string): void {
    const room = legacyRecord(roomRaw), prefix = migrationId(roomId), color = hex(legacyRecord(room.wallpaper).color) ? legacyRecord(room.wallpaper).color as string : '#F4DDE7';
    const corners = [origin, { x: origin.x + roomWidth, z: origin.z }, { x: origin.x + roomWidth, z: origin.z + roomDepth }, { x: origin.x, z: origin.z + roomDepth }];
    for (let index = 0; index < 4; index++) {
      const wall: Wall = { id: `legacy_wall_${prefix}_${index}`, floorId, start: { ...corners[index] }, end: { ...corners[(index + 1) % 4] }, height: wallHeight, thickness: .16, color };
      const wallpaper = legacyRecord(room.wallpaper);
      if (['solid', 'dots', 'stripes'].includes(wallpaper.pattern as string)) wall.pattern = wallpaper.pattern as Wall['pattern'];
      if (wallpaper.pattern === 'custom' && id(wallpaper.artId)) wall.artId = wallpaper.artId;
      result.walls.push(wall);
    }
    result.openings.push({ id: `legacy_door_${prefix}`, wallId: `legacy_wall_${prefix}_2`, kind: 'door', offset: (roomWidth - .9) / 2, width: .9, height: 2.1, sill: 0 });
    result.migration!.rooms.push({ id: roomId, floorId, type, origin: { ...origin }, width: roomWidth, depth: roomDepth });
    migrateItems(legacyArray(room.items), floorId, roomId, origin, roomWidth, roomDepth);
  }
  const rooms = house.rooms as RecordValue;
  for (let floorIndex = 0; floorIndex < house.floors.length; floorIndex++) {
    const floorId = `legacy_floor_${floorIndex}`;
    result.floors.push({ id: floorId, name: `${floorIndex + 1}楼`, elevation: floorIndex * 3 });
    const slots = legacyArray(legacyRecord(house.floors[floorIndex]).slots);
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const roomId = slots[slotIndex]; if (roomId === null) continue;
      need(id(roomId) && own(rooms, roomId), '旧版房间引用无效。');
      const room = legacyRecord(rooms[roomId]);
      migrateRoom(roomId, room, floorId, { x: round((slotIndex - (slots.length - 1) / 2) * 4.25 - roomWidth / 2), z: -roomDepth / 2 }, typeof room.type === 'string' ? room.type : 'room');
    }
  }
  if (!result.floors.length) result.floors.push({ id: 'floor_0', name: '一楼', elevation: 0 });
  if (house.attic !== null && house.attic !== undefined && house.attic !== false) {
    const attic = legacyRecord(house.attic), floorId = 'legacy_attic';
    result.floors.push({ id: floorId, name: '阁楼', elevation: house.floors.length * 3 });
    migrateRoom('attic:observatory', attic.room, floorId, { x: -roomWidth / 2, z: -roomDepth / 2 }, 'observatory');
  }
  const yardItems = legacyArray(legacyRecord(house.yard).items);
  if (yardItems.length) {
    const floorId = 'legacy_yard';
    result.floors.push({ id: floorId, name: '前院', elevation: 0 });
    for (const raw of yardItems) {
      const item = legacyRecord(raw); need(id(item.uid) && id(item.defId), '旧前院家具编号无效。');
      const entity: Furniture = { id: item.uid, defId: item.defId, floorId, position: { x: round(legacyNumber(item.x, 0) / 80), y: 0, z: round(4 + (legacyNumber(item.y, 20) - 20) / 65) }, rotation: item.flip === true ? Math.PI : 0, dimensions: furnitureDimensions(catalogDefinition(item.defId)), legacyRoomId: 'yard' };
      if (hex(item.color)) entity.color = item.color;
      if (id(item.artId)) entity.artId = item.artId;
      result.furniture.push(entity);
    }
  }
  return validateDocument(result, catalog);
}
