'use strict';
// MC-076：公开云海位置、独立3D邻居、稳定有界缓存与显式全览契约。
// 只使用内存Game、真实WebGL引擎和有状态GL替身；总集串行执行，不证明实际像素。
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

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (name, handler) => { const set = listeners.get(name) || new Set(); set.add(handler); listeners.set(name, set); };
  target.removeEventListener = (name, handler) => { listeners.get(name)?.delete(handler); };
  target.dispatch = (name, values) => {
    const event = Object.assign({ type: name, target, currentTarget: target, button: 0, pointerId: 1, shiftKey: false, prevented: false, preventDefault() { this.prevented = true; } }, values || {});
    for (const handler of Array.from(listeners.get(name) || [])) handler(event);
    return event;
  };
  return target;
}
function context2d(canvas) {
  const record = { composites: [] }, gradient = { addColorStop() {} };
  return new Proxy({ canvas, record, globalAlpha: 1,
    measureText: value => ({ width: String(value).length * 7 }),
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    drawImage(...args) { record.composites.push(args); }
  }, { get(target, key) { if (key in target) return target[key]; if (typeof key === 'symbol') return undefined; return () => {}; }, set(target, key, value) { target[key] = value; return true; } });
}

const DESKTOP = Object.freeze({ x: 80, y: 75, width: 600, height: 480, layout: 'side' });
const MOBILE = Object.freeze({ x: 12, y: 110, width: 366, height: 380, layout: 'side' });
function setup(options = {}) {
  let now = 0, serial = 0, world = null;
  const raf = new Map(), surfaces = [], neighborEvents = [], viewport = options.viewport || DESKTOP;
  const main = events({ width: 900, height: 700, clientWidth: 900, clientHeight: 700, style: {}, dataset: {}, captured: new Set() });
  main.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700 }); main.setAttribute = () => {};
  main.setPointerCapture = id => main.captured.add(id); main.hasPointerCapture = id => main.captured.has(id); main.releasePointerCapture = id => main.captured.delete(id);
  main.context = context2d(main); main.context.record.text = []; main.context.fillText = (...args) => main.context.record.text.push(args);
  main.getContext = type => { assert.equal(type, '2d'); return main.context; };
  const document = events({ hidden: false, getElementById: id => id === 'scene' ? main : null, createElement(tag) {
    assert.equal(tag, 'canvas'); const gpu = glFixture(), canvas = events({ width: 0, height: 0, style: {}, dataset: {}, gpu }); canvas.context = context2d(canvas);
    canvas.getContext = (type, settings) => { if (type === '2d') return canvas.context; assert.equal(type, 'webgl'); assert.equal(settings.preserveDrawingBuffer, true); return gpu.gl; };
    surfaces.push(canvas); return canvas;
  } });
  const media = events({ matches: true }), context = vm.createContext({ console, document, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++serial; raf.set(id, callback); return id; }, cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, matchMedia: () => media,
    ResizeObserver: class { observe() {} disconnect() {} }
  });
  context.window = context; context.innerWidth = 900; context.innerHeight = 700; context.devicePixelRatio = 2; events(context);
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/render/room-space.js',
    'js/render/live-avatars.js', 'js/render/sea-map.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.inventory.frame_basic = 2; });
  G.sys.garden = { capacity: () => 9, status: index => ({ index, crop: null, stage: 0, mature: false }) };
  const first = G.sys.building.buildRoom(0, 0, 'bedroom'), upper = G.sys.building.buildRoom(1, 2, 'living'); assert.ok(first.ok && upper.ok);
  const bed = G.sys.decorating.place('bed_basic', first.roomId, 88, 130, null, .68), frame = G.sys.decorating.place('frame_basic', first.roomId, 200, 40, null); assert.ok(bed.ok && frame.ok);
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast() {}, selection() {}, refresh() {}, open() {} }; G.audio = { play() {} };
  G.bus.on('scene:neighbor', value => neighborEvents.push(value));
  G.runtime.shellLayout = { panelKind: null }; const NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld { constructor(...args) { super(...args); world = this; } };
  G.render.init(main); assert.ok(world.ready);
  function paint() { now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length); batch.forEach(callback => callback(now)); assert.equal(main.dataset.renderer, 'webgl'); }
  function redraw() { G.render.redraw(); paint(); }
  function click(point) { main.dispatch('pointerdown', { clientX: point.x, clientY: point.y }); main.dispatch('pointerup', { clientX: point.x, clientY: point.y }); main.captured.delete(1); }
  function cpu() {
    const value = Object.create(NativeWorld.prototype);
    Object.assign(value, { ready: true, dirty: false, destroyed: false, angle: .43, elevation: .49, hits: [], actors: [], labels: [], labelHits: [] });
    value.env = Object.assign({}, world.env, { stage: null, roomOnly: first.roomId, camera: { x: -320, y: -124, scale: .8 } }); value.updateCamera(value.env); return value;
  }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); }
  paint(); return { G, world, main, surfaces, neighborEvents, viewport, paint, redraw, cpu, click, destroy, first: first.roomId, upper: upper.roomId, uid: frame.uid, bedUid: bed.uid };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function finite(values, message) { for (const value of values) assert.ok(Number.isFinite(value), message || '数值必须有限'); }
function vector(actual, expected, epsilon) { actual.forEach((value, i) => near(value, expected[i], epsilon)); }
function vertices(world) {
  const output = [];
  for (let i = 0; i < world.staticCount * 9; i += 9) output.push({ p: Array.from(world.vertices.slice(i, i + 3)), n: Array.from(world.vertices.slice(i + 3, i + 6)), c: Array.from(world.vertices.slice(i + 6, i + 9)) });
  return output;
}

// 这些是内存中主动公开的小屋条目，不读取账号或私人存档。
function houses(count, batch = 0) { return Array.from({ length: count }, (_, index) => ({ id: 'public_fixture_' + batch + '_' + index, title: '公开小屋' + index, online: index % 3 === 0 ? { count: 1, hostOnline: true, displayNames: ['朋友' + index] } : null })); }
function inside(env, point) { const v = env.viewport; return point.x >= v.x && point.x < v.x + v.width && point.y >= v.y && point.y < v.y + v.height; }
function clickableNeighborLabel(env, wantedEmpty) {
  for (const label of env.world.labelHits.filter(value => value.kind === 'neighbor' && value.empty === wantedEmpty)) {
    const point = { x: label.screen.x + label.screen.w / 2, y: label.screen.y + label.screen.h / 2 }, hit = env.world.pick(point.x, point.y);
    if (inside(env, point) && hit?.kind === 'neighbor' && hit.id === label.id && hit.empty === wantedEmpty) return { label, point };
  }
  assert.fail('显式云海全览必须至少有一个可点击的真实邻居标签');
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('visualPositions提供真正空云和公开ID/scale快照，旧positions保持仅真实邻居语义', () => {
  const env = setup();
  try {
    const state = JSON.stringify(env.G.state), map = env.G.seaMap; map.setHouses([]); map.setEmpty(true);
    // 3D 默认固定摆 8 座岛：没有人时全是“待邻居入住”空岛；2D 云海的空云数量(emptyCount)保持 6 不变。
    const empty = map.visualPositions(); assert.equal(empty.length, 8); assert.equal(map.emptyCount(), 6); assert.equal(map.positions().length, 0);
    for (const slot of empty) { assert.equal(slot.empty, true); assert.equal(slot.id, 'empty'); assert.ok(slot.scale >= .5 && slot.scale <= 1.25); finite([slot.x, slot.y]); }
    // 3D 是正交相机，近大远小靠缩放：离小屋越远的岛必须不比近处的大。
    const dist = slot => Math.hypot(slot.x / 100 + .6, 1.45 + slot.y / 75 - .9), byDistance = empty.slice().sort((a, b) => dist(a) - dist(b));
    for (let i = 1; i < byDistance.length; i++) assert.ok(byDistance[i].scale <= byDistance[i - 1].scale, '越远的岛越小');
    assert.ok(byDistance[0].scale > byDistance.at(-1).scale, '最近与最远的岛大小必须有差别');
    const oldX = empty[0].x; empty[0].x = 99999; assert.equal(map.visualPositions()[0].x, oldX, 'getter不能泄露可改内部云位对象');
    const list = houses(3); map.setHouses(list); const visual = map.visualPositions();
    assert.equal(visual.length, 8); assert.deepEqual(Array.from(visual.filter(value => !value.empty), value => value.id).sort(), list.map(value => value.id).sort());
    assert.equal(visual.filter(value => value.empty).length, 5, '邻居不足 8 家时用空岛补齐');
    for (const slot of visual) { assert.ok(slot.scale >= .5 && slot.scale <= 1.25); if (!slot.empty) assert.equal(map.hitAt(slot, 1).id, slot.id); }
    map.setHouses(houses(20));
    assert.equal(map.visualPositions().length, 8, '默认最多摆 8 座'); assert.equal(map.visualPositions({ all: true }).length, 20, '云海全览摆出全部真实邻居');
    assert.equal(JSON.stringify(env.G.state), state);
  } finally { env.destroy(); }
});

test('真实空云和邻居小屋按scale建模，worldp独立主岛/前院两翼/花园且空云点击保留empty', () => {
  const env = setup();
  try {
    const state = JSON.stringify(env.G.state); env.G.seaMap.setHouses([]); env.G.seaMap.setEmpty(true); env.G.render.camera.focusSea(); env.redraw();
    assert.equal(env.world.env.neighbors.length, 8); const emptyHits = env.world.hits.filter(hit => hit.kind === 'neighbor'); assert.equal(emptyHits.length, 8);
    assert.equal(new Set(Array.from(emptyHits, hit => JSON.stringify(hit.p))).size, 8, '空云共享empty ID也不能重叠到同一缓存位置');
    for (const hit of emptyHits) { assert.equal(hit.empty, true); assert.ok(hit.size[0] >= 2.2 * .5 - 1e-6 && hit.size[0] <= 2.2 * 1.25 + 1e-6); finite([hit.world.x, hit.world.y]); }
    for (const hit of emptyHits) { const sc = hit.size[0] / 2.2, label = env.world.labels.find(v => v.kind === 'neighbor' && v.empty && Math.hypot(v.p[0] - hit.p[0], v.p[2] - hit.p[2]) < 1e-6); assert.ok(label); near(label.p[1] - hit.p[1], .55 * sc, 1e-6); }
    const control = clickableNeighborLabel(env, true); env.click(control.point); assert.equal(env.neighborEvents.at(-1).empty, true); assert.equal(env.neighborEvents.at(-1).id, 'empty');
    // 房子背面小岛的牌子被屋子挡住：不画也不能点；在前面或侧面的照常显示。
    const w = env.world, saved = [w.eye, w.target]; w.eye = [0, 5, 30]; w.target = [0, 5, 0];
    assert.equal(w.houseBlocks([0, 5, -12]), true, '房子正后方被挡住'); assert.equal(w.houseBlocks([0, 5, 12]), false, '房子前面不挡'); assert.equal(w.houseBlocks([25, 5, -12]), false, '房子侧后方露在外面'); assert.equal(w.houseBlocks([0, 40, -12]), false, '高过屋顶的不挡');
    [w.eye, w.target] = saved; env.redraw();
    const realBlocks = w.houseBlocks; w.houseBlocks = () => true; env.redraw(); assert.equal(w.labelHits.filter(v => v.kind === 'neighbor').length, 0, '全被挡住时没有邻居牌子可点'); assert.ok(w.labels.filter(v => v.kind === 'neighbor').length > 0, '牌子本身仍保留，只是不画');
    w.houseBlocks = () => false; env.redraw(); assert.ok(w.labelHits.filter(v => v.kind === 'neighbor').length > 0, '没被挡住时照常显示'); w.houseBlocks = realBlocks; env.redraw();
    env.G.seaMap.setHouses(houses(8)); env.G.render.camera.focusSea(); env.redraw();
    const mesh = vertices(env.world), garden = env.world.env.garden.center;
    const terrain = [[-.6, .9, 7.25 * 1.09], [-4.3, 3.4, 3 * 1.09], [4.3, 3.4, 3 * 1.09], [garden.x / 100, env.G.world3dMath.yardZ(garden.y), 3.25 * 1.09]];
    for (const neighbor of env.world.env.neighbors) {
      const hit = env.world.hits.find(value => value.kind === 'neighbor' && value.id === neighbor.id), p = env.world.neighborLocation(neighbor), s = Math.max(.5, Math.min(1.25, neighbor.scale));
      assert.ok(hit); vector(Array.from(hit.p), Array.from(p), 1e-8); assert.equal(hit.empty, false); near(hit.size[0], 2.2 * s); near(hit.size[1], 2 * s);
      for (const [x, z, radius] of terrain) assert.ok(Math.hypot(p[0] - x, p[2] - z) >= radius + 1.05 * s * 1.09 + .45 - .002, '实际worldp须处于地形及邻居底座半径之外');
      const wall = mesh.filter(v => Math.abs(v.p[0] - p[0]) <= .7 * s && Math.abs(v.p[2] - p[2]) <= .7 * s && v.p[1] >= p[1] && v.p[1] <= p[1] + s && Math.abs(v.c[0] - 245 / 255) < 1e-5 && Math.abs(v.c[1] - 213 / 255) < 1e-5 && Math.abs(v.c[2] - 219 / 255) < 1e-5);
      assert.ok(wall.length > 0, '公开邻居须有真实粉色房屋网格'); near(Math.max(...wall.map(v => v.p[0])) - Math.min(...wall.map(v => v.p[0])), 1.08 * s, .0002);
      const label = env.world.labels.find(value => value.kind === 'neighbor' && value.id === neighbor.id); assert.ok(label); near(label.p[1] - p[1], 1.9 * s); assert.equal(label.empty, false); finite([label.world.x, label.world.y]);
    }
    const real = clickableNeighborLabel(env, false); env.click(real.point); assert.equal(env.neighborEvents.at(-1).id, real.label.id); assert.equal(env.neighborEvents.at(-1).empty, false); assert.equal(JSON.stringify(env.G.state), state);
  } finally { env.destroy(); }
});

test('neighborLocation缓存最多64且位置只由正式云位/地形决定，旋转换view及淘汰后重算稳定', () => {
  const env = setup();
  try {
    const state = JSON.stringify(env.G.state), first = [], last = [];
    for (let batch = 0; batch < 3; batch++) {
      env.G.seaMap.setHouses(houses(40, batch));
      for (const neighbor of env.G.seaMap.visualPositions({ all: true })) {
        const p = env.world.neighborLocation(neighbor); assert.equal(Object.isFrozen(p), true); finite(Array.from(p));
        if (batch === 0) first.push({ neighbor, p: Array.from(p) }); if (batch === 2) last.push({ neighbor, p });
      }
      assert.ok(env.world.neighborLocations.size <= 64);
    }
    assert.equal(env.world.neighborLocations.size, 64, '三批真实40户位置驱动缓存淘汰');
    env.G.render.camera.rotate(210, -70); env.redraw();
    for (const value of last.slice().reverse()) assert.equal(env.world.neighborLocation(value.neighbor), value.p, '保留项重复取值应复用冻结坐标');
    const differentView = Object.assign({}, env.world.env, { view: { floor: 'all', view: 'exterior', previewFourFloors: false } });
    for (const value of first) vector(Array.from(env.world.neighborLocation(value.neighbor, differentView)), value.p, 1e-8);
    assert.ok(env.world.neighborLocations.size <= 64); assert.equal(JSON.stringify(env.G.state), state);
  } finally { env.destroy(); }
});

test('overview仅纳入最近三朵云，显式sea按全部40户真实worldp取景并可点击公开ID', () => {
  const env = setup();
  try {
    const state = JSON.stringify(env.G.state); env.G.seaMap.setHouses(houses(40, 4)); env.G.render.camera.resetView(); env.redraw();
    assert.equal(env.world.env.neighbors.length, 8, '默认全景只摆 8 座邻居岛');
    const nearest = Array.from(env.world.env.neighbors).sort((a, b) => { const p = env.world.neighborLocation(a), q = env.world.neighborLocation(b); return Math.hypot(p[0] + .6, p[2] - .9) - Math.hypot(q[0] + .6, q[2] - .9); }).slice(0, 3);
    const overview = env.world.cameraSpec(env.world.env, 'overview'), onlyNear = env.world.cameraSpec(Object.assign({}, env.world.env, { neighbors: nearest }), 'overview');
    vector(Array.from(overview.bounds.min), Array.from(onlyNear.bounds.min), 1e-8); vector(Array.from(overview.bounds.max), Array.from(onlyNear.bounds.max), 1e-8);
    const overviewRange = env.world.fittedFrame(env.world.env, overview, env.world.houseBasis()).range;
    const overviewScale = env.G.render.camera.scale; env.G.render.camera.focusSea(); env.redraw(); assert.equal(env.G.render.camera.focusKind, 'sea'); assert.ok(env.G.render.camera.scale < overviewScale);
    assert.equal(env.world.env.neighbors.length, 40, '云海全览才摆出全部40户');
    const seaRange = env.world.fittedFrame(env.world.env, env.world.cameraSpec(env.world.env, 'sea'), env.world.houseBasis()).range;
    assert.ok(seaRange > overviewRange + .01, '根页全景不能默认被40户远邻拉成小点');
    for (const neighbor of env.world.env.neighbors) { const p = env.world.neighborLocation(neighbor); assert.ok(inside(env, env.world.project(p)), '显式全览必须包含全部实际邻居中心'); }
    const control = clickableNeighborLabel(env, false); env.click(control.point); assert.equal(env.neighborEvents.at(-1).id, control.label.id); assert.equal(env.neighborEvents.at(-1).empty, false); assert.equal(JSON.stringify(env.G.state), state);
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组公开邻居3D位置/缓存/取景/点击契约通过（内存公开样本与GL替身，不证明线上账号或实际像素）。');
