'use strict';
// MC-076：原型院景真实网格接入、既有花园/家具边界与缓存。GL替身不代表浏览器视觉验收。
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
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('正式home确实上传原型完整院景网格：逐顶点/法线/颜色比对独立纯module输出及固定变换', () => {
  const env = setup(), world = env.world(), context = context2d();
  try {
    assert.equal(world.render(context, env.environment(), { photo: true }), true);
    assert.equal(env.yardCalls.length, 1); assert.deepEqual(env.yardCalls[0].options, plain(YARD_OPTIONS));
    const expected = env.expectedYard(), metadata = world.yardEnvironment; assert.equal(metadata?.source, 'prototype');
    assert.deepEqual(plain(metadata.origin), YARD_OPTIONS.origin); assert.equal(metadata.scale, YARD_OPTIONS.scale);
    assert.equal(metadata.vertexStart, env.yardCalls[0].before); assert.equal(metadata.vertexCount, env.yardCalls[0].after - env.yardCalls[0].before);
    assert.ok(metadata.vertexCount > 1000, '不能以少量边框或锚点代替原型实体院景');
    const actual = world.vertices.subarray(metadata.vertexStart * 9, (metadata.vertexStart + metadata.vertexCount) * 9);
    equalMesh(actual, expected.vertices); assert.deepEqual(plain(metadata.bounds), plain(expected.metadata.bounds)); assert.deepEqual(plain(metadata.anchors), plain(expected.metadata.anchors));
    assert.equal(context.calls.composites, 1); assert.ok(env.surfaces[0].gpu.record.draws.length > 0); env.unchanged();
  } finally { world.destroy(); }
});

test('原型静态院景接入后保留右侧九格和八块桥，真实房间/庭院UID及库存均不变', () => {
  const env = setup(), world = env.world();
  try {
    world.render(context2d(), env.environment(), { photo: true }); assertGardenAndIds(env, world); env.unchanged();
    const inventory = env.G.state.inventory;
    assert.equal(inventory.yard_mailbox || 0, 0); assert.equal(inventory.yard_tree || 0, 0); assert.equal(inventory.yard_flowerbed || 0, 0, '原型静态花坛不赠送或消耗用户家具');
  } finally { world.destroy(); }
});

test('转动真实house相机只更新矩阵和draw，不重建原型网格、不重复调用module或上传', () => {
  const env = setup(), world = env.world(), context = context2d(), settings = env.environment();
  try {
    world.render(context, settings, { photo: true });
    const builds = world.builds, uploads = env.surfaces[0].gpu.record.uploads.length, before = Array.from(world.matrix), vertices = world.vertices, yard = plain(world.yardEnvironment);
    world.rotate(17, 3); world.render(context, settings, { photo: true }); world.rotate(-9, -2); world.render(context, settings, { photo: true });
    assert.equal(world.builds, builds); assert.equal(env.yardCalls.length, 1); assert.equal(env.surfaces[0].gpu.record.uploads.length, uploads);
    assert.equal(world.vertices, vertices); assert.notDeepEqual(Array.from(world.matrix), before); assert.deepEqual(plain(world.yardEnvironment), yard);
    assert.equal(context.calls.composites, 3); env.unchanged();
  } finally { world.destroy(); }
});

test('摄影roomOnly不构建院景，house摄影恢复完整原型片段且不遗留上一模式元数据', () => {
  const env = setup(), world = env.world(), context = context2d(), expected = env.expectedYard();
  try {
    world.render(context, env.environment(), { photo: true }); assert.equal(env.yardCalls.length, 1); assert.equal(world.yardEnvironment?.source, 'prototype');
    world.render(context, env.environment({ roomOnly: env.roomId }), { photo: true });
    assert.equal(env.yardCalls.length, 1, '单房摄影不重新调用原型院景');
    assert.notEqual(world.yardEnvironment?.source, 'prototype', '不能在单房摄影保留上一张house的院景标记');
    assert.equal(findSegment(world.vertices, expected.vertices), -1, '单房实际摄影网格没有整段院景');
    assert.equal(world.hits.filter(hit => hit.kind === 'plot').length, 0); assert.ok(world.hits.some(hit => hit.uid === env.uid));
    world.render(context, env.environment(), { photo: true }); assert.equal(env.yardCalls.length, 1, '同一state回到house复用室外缓存，不重新调用原型院景');
    const yard = world.yardEnvironment; assert.equal(yard?.source, 'prototype'); equalMesh(world.vertices.subarray(yard.vertexStart * 9, (yard.vertexStart + yard.vertexCount) * 9), expected.vertices); env.unchanged();
  } finally { world.destroy(); }
});

test('缺少原型module明确标记missing，真实home/右侧花园/用户家具仍可渲染且不冒充院景完成', () => {
  const env = setup(), expected = env.expectedYard(); delete env.G.prototypeYard3D;
  const world = env.world(), context = context2d();
  try {
    assert.equal(world.render(context, env.environment(), { photo: true }), true); assert.equal(env.yardCalls.length, 0);
    assert.equal(world.yardEnvironment?.source, 'missing-prototype-yard'); assert.equal(findSegment(world.vertices, expected.vertices), -1);
    assert.ok(world.staticCount > 0); assert.ok(env.surfaces[0].gpu.record.draws.length > 0); assertGardenAndIds(env, world); env.unchanged();
  } finally { world.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组原型院景真实网格接入检查通过（GL替身，不代替根页/原型画面对照）。');
