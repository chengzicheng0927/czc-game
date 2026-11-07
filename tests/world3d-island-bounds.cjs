'use strict';
// MC-076：指定主岛真实草坪/云层网格与整屋相机边界。GL替身不代表浏览器视觉验收。
// 本文件只使用内存fixture，不启动服务/浏览器，不读取私人账号或存档。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

function glFixture() {
  let serial = 0, bound = null;
  const resources = { buffers: new Set(), shaders: new Set(), programs: new Set() };
  const record = { uploads: [], draws: [], viewport: [], deleted: [], lost: 0, uniforms: new Map() };
  const allocate = kind => { const value = { kind, id: ++serial }; resources[kind].add(value); return value; };
  const release = (kind, value) => { assert.ok(resources[kind].delete(value), 'GPU资源只能释放一次'); record.deleted.push(value); };
  const gl = {
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, TRIANGLES: 4, FLOAT: 5126,
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    DEPTH_TEST: 2929, LEQUAL: 515, CULL_FACE: 2884, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    BLEND: 3042, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
    createShader: () => allocate('shaders'), createProgram: () => allocate('programs'), createBuffer: () => allocate('buffers'),
    deleteShader: value => release('shaders', value), deleteProgram: value => release('programs', value), deleteBuffer: value => release('buffers', value),
    shaderSource(shader, source) { assert.ok(resources.shaders.has(shader)); assert.ok(source.length > 50); shader.source = source; },
    compileShader(shader) { assert.ok(shader.source); shader.compiled = true; },
    getShaderParameter(shader, flag) { assert.equal(flag, gl.COMPILE_STATUS); return !!shader.compiled; },
    attachShader(program, shader) { assert.ok(resources.programs.has(program)); assert.ok(shader.compiled); (program.shaders ||= []).push(shader); },
    linkProgram(program) { assert.equal(program.shaders.length, 2); program.linked = true; },
    getProgramParameter(program, flag) { assert.equal(flag, gl.LINK_STATUS); return !!program.linked; },
    getAttribLocation(program, name) { assert.ok(program.linked); return { aPosition: 0, aNormal: 1, aColor: 2 }[name]; },
    getUniformLocation(program, name) { assert.ok(program.linked); return name; },
    bindBuffer(target, buffer) { assert.equal(target, gl.ARRAY_BUFFER); assert.ok(resources.buffers.has(buffer)); bound = buffer; },
    bufferData(target, values, usage) {
      assert.equal(target, gl.ARRAY_BUFFER); assert.ok(resources.buffers.has(bound)); assert.ok(values.length > 0);
      for (const n of values) assert.ok(Number.isFinite(n), '上传顶点必须有限');
      bound.length = values.length; record.uploads.push({ buffer: bound, length: values.length, usage });
    },
    useProgram(program) { assert.ok(resources.programs.has(program)); assert.ok(program.linked); },
    viewport(...args) { args.forEach(n => assert.ok(Number.isFinite(n))); record.viewport.push(args); },
    uniformMatrix4fv(location, transpose, value) { assert.equal(transpose, false); assert.equal(value.length, 16); for (const n of value) assert.ok(Number.isFinite(n)); record.uniforms.set(location, Array.from(value)); },
    uniform3fv(location, value) { assert.equal(value.length, 3); for (const n of value) assert.ok(Number.isFinite(n)); record.uniforms.set(location, Array.from(value)); },
    uniform1f(location, value) { assert.ok(Number.isFinite(value)); record.uniforms.set(location, value); },
    enableVertexAttribArray(index) { assert.ok(Number.isInteger(index) && index >= 0); },
    vertexAttribPointer(index, size, type, normalized, stride, offset) { assert.equal(size, 3); assert.equal(type, gl.FLOAT); assert.equal(stride, 36); assert.ok(offset >= 0 && offset <= 24); },
    drawArrays(mode, start, count) { assert.equal(mode, gl.TRIANGLES); assert.ok(start >= 0 && count > 0); assert.ok((start + count) * 9 <= bound.length); record.draws.push({ start, count, buffer: bound }); },
    enable() {}, disable() {}, depthFunc() {}, clearColor() {}, clear() {}, blendFunc() {}, depthMask() {},
    getExtension(name) { assert.equal(name, 'WEBGL_lose_context'); return { loseContext() { record.lost++; } }; }
  };
  return { gl, resources, record };
}

const YARD_OPTIONS = Object.freeze({ origin: [0, 0, .3], scale: 1.2, palette: { roof: '#c86e87', pink: '#efb1c0' } });
const plain = value => JSON.parse(JSON.stringify(value));
function context2d() {
  const calls = { composites: 0 };
  return new Proxy({ calls, globalAlpha: 1,
    measureText: value => ({ width: String(value).length * 7 }),
    drawImage() { calls.composites++; }
  }, { get(target, key) { if (key in target) return target[key]; if (typeof key === 'symbol') return undefined; return () => {}; }, set(target, key, value) { target[key] = value; return true; } });
}
function setup() {
  const surfaces = [], document = { hidden: false, addEventListener() {}, createElement(tag) {
    assert.equal(tag, 'canvas'); const gpu = glFixture(), listeners = new Map();
    const canvas = { width: 0, height: 0, style: {}, listeners, gpu,
      getContext(type, options) { assert.equal(type, 'webgl'); assert.equal(options.preserveDrawingBuffer, true); return gpu.gl; },
      addEventListener(name, fn) { assert.ok(!listeners.has(name)); listeners.set(name, fn); },
      removeEventListener(name, fn) { assert.equal(listeners.get(name), fn); listeners.delete(name); }
    }; surfaces.push(canvas); return canvas;
  } };
  const context = vm.createContext({ console, document, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); context.window = context;
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/yard.js',
    'js/render/room-space.js', 'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/prototype-yard3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init();
  G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.inventory.yard_bench = 1; });
  G.sys.garden = { capacity: () => G.data.gardenConfig.expandedPlots, status: index => ({ index, crop: null, stage: 0, mature: false, locked: false }) };
  const built = G.sys.building.buildRoom(0, 0, 'bedroom'); assert.ok(built.ok, built.message);
  const upper = G.sys.building.buildRoom(3, 2, 'living'); assert.ok(upper.ok, upper.message);
  const item = G.sys.decorating.place('bed_basic', built.roomId, 88, 130, null, .68); assert.ok(item.ok, item.message);
  const yardItem = G.sys.yard.place('yard_bench', 280, 110); assert.ok(yardItem.ok, yardItem.message);
  const nativeYard = G.prototypeYard3D, yardCalls = [];
  G.prototypeYard3D = { assets: nativeYard.assets, build(geometry, options) {
    const before = geometry.data.length / 9, metadata = nativeYard.build(geometry, options);
    yardCalls.push({ options: plain(options), before, after: geometry.data.length / 9 }); return metadata;
  } };
  let stateWrites = 0; const update = G.store.update;
  G.store.update = function (...args) { stateWrites++; return update.apply(this, args); };
  const stateBefore = JSON.stringify(G.state), inventoryBefore = JSON.stringify(G.state.inventory);
  function rooms() { return G.state.house.floors.flatMap((floor, floorIdx) => floor.slots.map((id, slotIdx) => ({ id, floorIdx, slotIdx, x: -480 + slotIdx * 320, y: -220 - floorIdx * 220, data: id ? G.state.house.rooms[id] : null }))); }
  function environment(patch) {
    return Object.assign({ state: G.state, rooms: rooms(), width: 1280, height: 720, dpr: 1,
      camera: { x: 50, y: -190, scale: .72 }, garden: G.render.layout.garden(), attic: G.render.layout.attic(),
      view: { floor: 'all', view: 'cutaway', previewFourFloors: false }, peers: [], neighbors: [], residentFrame: [], hidePlayer: true, reducedMotion: true }, patch || {});
  }
  function expectedYard() {
    const geometry = new G.world3dMath.Geometry(), metadata = nativeYard.build(geometry, plain(YARD_OPTIONS));
    return { vertices: new Float32Array(geometry.data), metadata };
  }
  function unchanged() { assert.equal(stateWrites, 0, '渲染/原型院景不能调用store.update'); assert.equal(JSON.stringify(G.state), stateBefore); assert.equal(JSON.stringify(G.state.inventory), inventoryBefore); }
  function world() { const value = new G.World3D(); assert.ok(value.ready, '检查必须经过真实WebGL renderer'); return value; }
  return { G, surfaces, roomId: built.roomId, uid: item.uid, yardUid: yardItem.uid, nativeYard, yardCalls, environment, expectedYard, unchanged, world };
}
function vector(actual, expected, epsilon = .000001) { assert.equal(actual.length, expected.length); actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= epsilon, value + ' 应接近 ' + expected[index])); }
function equalMesh(actual, expected) {
  assert.equal(actual.length, expected.length, '真实原型片段必须具有完整顶点数量');
  for (let i = 0; i < expected.length; i++) if (actual[i] !== expected[i]) assert.fail('原型网格在float ' + i + ' 不同：' + actual[i] + ' ≠ ' + expected[i]);
}
function findSegment(all, expected) {
  if (!expected.length || expected.length > all.length) return -1;
  for (let start = 0; start <= all.length - expected.length; start += 9) {
    let match = true;
    for (let i = 0; i < 9; i++) if (all[start + i] !== expected[i]) { match = false; break; }
    if (!match) continue;
    for (let i = 9; i < expected.length; i++) if (all[start + i] !== expected[i]) { match = false; break; }
    if (match) return start / 9;
  }
  return -1;
}
function bridgeMesh(G) {
  const geometry = new G.world3dMath.Geometry();
  for (let i = 0; i < 8; i++) geometry.box([6.1 + i * .17, .16, 3.18], [.21, .1, .9], '#e4c8a4', .055);
  return new Float32Array(geometry.data);
}
function assertGardenAndIds(env, world) {
  const plots = world.hits.filter(hit => hit.kind === 'plot'); assert.equal(plots.length, 9, '正式右侧花园九格保持');
  assert.deepEqual(Array.from(plots, hit => hit.index).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const garden = env.G.render.layout.garden();
  for (const plot of garden.plots) { const hit = plots.find(value => value.index === plot.index); vector(hit.p, [plot.cropX / 100, .15, 1.45 + (plot.y + plot.h / 2) / 75]); }
  assert.ok(findSegment(world.vertices, bridgeMesh(env.G)) >= 0, '八块真实花园桥梁的坐标、颜色及完整网格继续存在');
  const roomItems = world.hits.filter(hit => hit.kind === 'item'), yardItems = world.hits.filter(hit => hit.kind === 'yard-item');
  assert.equal(roomItems.length, 1); assert.equal(roomItems[0].uid, env.uid); assert.equal(roomItems[0].roomId, env.roomId);
  assert.equal(yardItems.length, 1); assert.equal(yardItems[0].uid, env.yardUid);
  assert.deepEqual(Array.from(world.hits.filter(hit => hit.uid), hit => hit.uid).sort(), [env.uid, env.yardUid].sort(), '静态原型树/花/邮箱不伪造可编辑家具UID或命中');
}
function islandMesh(G, x, z, radius, y = 0) {
  const geometry = new G.world3dMath.Geometry(); G.world3dModels.island(geometry, x, z, radius, y); return new Float32Array(geometry.data);
}
function boundsOf(vertices, filter) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let count = 0;
  for (let i = 0; i < vertices.length; i += 9) {
    if (filter && !filter(vertices, i)) continue; count++;
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], vertices[i + k]); max[k] = Math.max(max[k], vertices[i + k]); }
  }
  assert.ok(count > 100, '边界必须来自真实完整几何顶点'); return { min, max, count };
}
function topSurfaceColor(vertices) {
  let index = 0;
  for (let i = 0; i < vertices.length; i += 9) if (vertices[i + 1] > vertices[index + 1]) index = i;
  return Array.from(vertices.subarray(index + 6, index + 9));
}
function grassBounds(vertices, color) { return boundsOf(vertices, (values, i) => color.every((v, k) => values[i + 6 + k] === v)); }
function near(actual, expected, epsilon = .000003) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function contains(bounds, point, epsilon = .00001) { return point.every((v, k) => v >= bounds.min[k] - epsilon && v <= bounds.max[k] + epsilon); }
function grassSupports(vertices, x, z) {
  // 对真实草坪顶盖三角形做XZ重心判断，不能仅凭岛屿AABB声称合法角落有承托。
  for (let i = 0; i < vertices.length; i += 27) {
    const a = i, b = i + 9, c = i + 18;
    if ([a, b, c].some(offset => Math.abs(vertices[offset + 1] - .06) > .000003 || vertices[offset + 4] < .99)) continue;
    const ax = vertices[a], az = vertices[a + 2], bx = vertices[b], bz = vertices[b + 2], cx = vertices[c], cz = vertices[c + 2];
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(denominator) < .00000001) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator, w = 1 - u - v;
    if (u >= -.000001 && v >= -.000001 && w >= -.000001) return true;
  }
  return false;
}

const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('实际主岛完整土层/草坪/云层逐值匹配指定center[-.6,.9]与radius7.25，草坪右界6.65', () => {
  const env = setup(), world = env.world(), context = context2d();
  try {
    assert.equal(world.render(context, env.environment(), { photo: true }), true);
    const expected = islandMesh(env.G, -.6, .9, 7.25, 0), actual = world.vertices.subarray(0, expected.length);
    equalMesh(actual, expected);
    const terrain = boundsOf(actual), grass = grassBounds(actual, topSurfaceColor(expected));
    near(grass.min[0], -7.85); near(grass.max[0], 6.65);
    near(grass.min[2], .9 - 7.25); near(grass.max[2], .9 + 7.25);
    assert.ok(terrain.min[1] < -1.4 && terrain.max[1] > .05, '主岛保留真实下垂土层与厚云层，不能只放大平面草坪');
    assert.ok(terrain.min[0] < grass.min[0] && terrain.max[0] > grass.max[0], '云层仍包住草坪外缘');
    env.unchanged();
  } finally { world.destroy(); }
});

test('主岛扩大不移动右侧9格花园、独立花园岛或8块桥，原型院景仍固定origin/scale且两岛草坪留缝', () => {
  const env = setup(), world = env.world();
  try {
    world.render(context2d(), env.environment(), { photo: true });
    const main = islandMesh(env.G, -.6, .9, 7.25, 0), garden = islandMesh(env.G, 10, 1.45 + 143 / 75, 3.25, -.02);
    const start = findSegment(world.vertices, garden); assert.ok(start >= 0, '实际右花园岛仍是原中心和原半径的完整几何');
    const actualGarden = world.vertices.subarray(start * 9, start * 9 + garden.length); equalMesh(actualGarden, garden);
    const mainGrass = grassBounds(world.vertices.subarray(0, main.length), topSurfaceColor(main)), gardenGrass = grassBounds(actualGarden, topSurfaceColor(garden));
    near(mainGrass.max[0], 6.65); near(gardenGrass.min[0], 6.75); assert.ok(gardenGrass.min[0] - mainGrass.max[0] > .09, '指定主岛草坪不侵入右花园岛草坪');
    // 两块r3左右草坪延展是正式yard合法角落的地基，主圆扩大不能将它们删掉。
    const extensions = [-4.3, 4.3].map(x => {
      const expected = islandMesh(env.G, x, 3.4, 3, 0), index = findSegment(world.vertices, expected);
      assert.ok(index >= 0, '保留实际左右r3延展岛的完整草坪/土层/厚云网格：x=' + x);
      const actual = world.vertices.subarray(index * 9, index * 9 + expected.length); equalMesh(actual, expected); return actual;
    });
    const yardBounds = env.G.data.yardConfig.bounds;
    assert.deepEqual(plain(yardBounds), { left: -650, right: 650, top: 20, bottom: 270 });
    for (const x of [yardBounds.left, yardBounds.right]) for (const y of [yardBounds.top, yardBounds.bottom]) {
      const groundX = x / 100, groundZ = 1.45 + y / 75, extension = extensions[x < 0 ? 0 : 1];
      assert.ok(grassSupports(extension, groundX, groundZ), '正式yard合法角落(' + x + ',' + y + ')必须由实际r3草坪顶盖三角形承托');
    }
    assertGardenAndIds(env, world);
    assert.equal(env.yardCalls.length, 1); assert.deepEqual(env.yardCalls[0].options, plain(YARD_OPTIONS));
    const pure = env.expectedYard(), metadata = world.yardEnvironment;
    assert.equal(metadata.scale, 1.2); assert.deepEqual(plain(metadata.origin), [0, 0, .3]);
    equalMesh(world.vertices.subarray(metadata.vertexStart * 9, (metadata.vertexStart + metadata.vertexCount) * 9), pure.vertices);
    env.unchanged();
  } finally { world.destroy(); }
});

test('四层真实整屋安全框包含扩大后的完整terrain/房屋/右花园，fit后的实体顶点可见且不靠旧半径裁切', () => {
  const env = setup(), ambientClouds = [], cloud = env.G.world3dModels.cloud;
  // 仅排除没有交互和地基的背景气氛云；主岛/花园底下的厚云层仍全部参加边界检查。
  env.G.world3dModels.cloud = function (geometry, ...args) { const start = geometry.data.length / 9; const result = cloud(geometry, ...args); ambientClouds.push({ start, end: geometry.data.length / 9 }); return result; };
  const world = env.world(), settings = env.environment({ constrainCamera: true });
  try {
    world.render(context2d(), settings, { photo: true }); assert.equal(env.G.state.house.floors.length, 4, '安全框用真实四层fixture');
    const spec = world.cameraSpec(settings, 'overview');
    const main = islandMesh(env.G, -.6, .9, 7.25), garden = islandMesh(env.G, 10, 1.45 + 143 / 75, 3.25, -.02);
    for (const mesh of [main, garden]) for (let i = 0; i < mesh.length; i += 9) assert.ok(contains(spec.bounds, [mesh[i], mesh[i + 1], mesh[i + 2]]), '真实草坪、土层或厚云层不能落到安全框之外');
    const highestFloor = env.G.world3dMath.floorY(3);
    assert.ok(contains(spec.bounds, [3.2, highestFloor + 2.2, -1.43]), '最高层实际房屋实体进入整屋边界');
    assert.ok(spec.bounds.min[0] < -8 && spec.bounds.max[0] > 13, '边界同时包含左移扩大的主岛云层和原右花园');
    world.fitCamera(settings); world.render(context2d(), settings, { photo: true });
    for (let i = 0; i < world.vertices.length; i += 9) {
      const vertex = i / 9; if (ambientClouds.some(range => vertex >= range.start && vertex < range.end)) continue;
      const point = [world.vertices[i], world.vertices[i + 1], world.vertices[i + 2]];
      assert.ok(contains(spec.bounds, point), '真实terrain/院景/房屋实体必须被整屋frame bounds包含');
      const projected = world.project(point);
      assert.ok(projected.x >= -.01 && projected.x <= settings.width + .01 && projected.y >= -.01 && projected.y <= settings.height + .01, '实际fit不能裁掉已纳入安全框的实体顶点');
    }
    env.unchanged();
  } finally { world.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组主岛真实几何与整屋边界检查通过（GL替身，不代替实际相机与像素验收）。');
