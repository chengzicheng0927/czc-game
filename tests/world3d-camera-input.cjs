'use strict';
// MC-076：真实scene相机输入、view平面缩放、焦点约束与摄影隔离契约。
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
  let now = 0, serial = 0, world = null, writes = 0, failNextPhoto = false;
  const raf = new Map(), surfaces = [], renders = [], interactionEvents = [], viewport = Object.assign({}, options.viewport || DESKTOP);
  const main = events({ width: 900, height: 700, clientWidth: 900, clientHeight: 700, style: {}, dataset: {}, captured: new Set() });
  main.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700 }); main.setAttribute = () => {};
  main.setPointerCapture = id => main.captured.add(id); main.hasPointerCapture = id => main.captured.has(id); main.releasePointerCapture = id => main.captured.delete(id);
  main.context = context2d(main); main.context.record.text = []; main.context.fillText = (...args) => main.context.record.text.push(args);
  main.getContext = type => { assert.equal(type, '2d'); return main.context; };
  const document = events({ hidden: false, getElementById: id => id === 'scene' ? main : null, createElement(tag) {
    assert.equal(tag, 'canvas'); const gpu = glFixture(), canvas = events({ width: 0, height: 0, style: {}, dataset: {}, gpu }); canvas.context = context2d(canvas);
    canvas.getContext = (type, settings) => { if (type === '2d') { if (failNextPhoto) { failNextPhoto = false; canvas.context.drawImage = () => { throw new Error('camera photo composite failed'); }; } return canvas.context; } assert.equal(type, 'webgl'); assert.equal(settings.preserveDrawingBuffer, true); return gpu.gl; };
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
    'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js', 'js/render/player-movement.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.inventory.frame_basic = 2; });
  G.sys.garden = { capacity: () => 9, status: index => ({ index, crop: null, stage: 0, mature: false }) };
  const first = G.sys.building.buildRoom(0, 0, 'bedroom'), upper = G.sys.building.buildRoom(1, 2, 'living'); assert.ok(first.ok && upper.ok);
  const bed = G.sys.decorating.place('bed_basic', first.roomId, 88, 130, null, .68), frame = G.sys.decorating.place('frame_basic', first.roomId, 200, 40, null); assert.ok(bed.ok && frame.ok);
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast() {}, selection() {}, refresh() {}, open() {} }; G.audio = { play() {} };
  G.runtime.shellLayout = { panelKind: null }; const NativeWorld = G.World3D, nativeUpdate = G.store.update;
  G.store.update = function (...args) { writes++; return nativeUpdate.apply(this, args); };
  G.bus.on('camera:interaction', event => interactionEvents.push(event.mode));
  G.World3D = class ObservedWorld extends NativeWorld {
    constructor(...args) { super(...args); world = this; }
    render(output, env, settings) {
      try { return super.render(output, env, settings); }
      finally { renders.push({ photo: !!settings?.photo, capturingPhoto: env.capturingPhoto, roomOnly: env.roomOnly || null, target: Array.from(this.target || []), range: this.range, output, uids: this.hits.filter(hit => hit.kind === 'item').map(hit => hit.uid) }); }
    }
  };
  G.render.init(main); assert.ok(world.ready);
  function paint() { now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length); batch.forEach(callback => callback(now)); assert.equal(main.dataset.renderer, 'webgl'); }
  function redraw() { G.render.redraw(); paint(); }
  function event(name, point, extra) {
    const value = main.dispatch(name, Object.assign({ clientX: point.x, clientY: point.y }, extra || {}));
    if (name === 'pointerup' || name === 'pointercancel') main.captured.delete(value.pointerId); return value;
  }
  function framePoint() { const hit = world.hits.find(value => value.uid === frame.uid); assert.ok(hit); return world.project([hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]]); }
  function camera() { const c = G.render.camera; return { x: c.x, y: c.y, scale: c.scale, focusKind: c.focusKind, focusId: c.focusId, focusFloorIndex: c.focusFloorIndex }; }
  function snapshot() { return { state: JSON.stringify(G.state), writes, camera: camera(), pan: Array.from(world.panVector || [0, 0, 0]), target: Array.from(world.target), matrix: Array.from(world.matrix), mode: G.render.camera.getInteractionMode() }; }
  function assertNoWrites(before) { assert.equal(JSON.stringify(G.state), before.state); assert.equal(writes, before.writes, '相机操作不得调用store.update'); }
  function cpu() {
    const value = Object.create(NativeWorld.prototype);
    Object.assign(value, { ready: true, dirty: false, destroyed: false, angle: .43, elevation: .49, hits: [], actors: [], labels: [], labelHits: [] });
    value.env = Object.assign({}, world.env, { stage: null, roomOnly: first.roomId, camera: { x: -320, y: -124, scale: .8 } }); value.updateCamera(value.env); return value;
  }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); }
  paint(); return { G, world, main, surfaces, renders, interactionEvents, viewport, paint, redraw, cpu, event, framePoint, camera, snapshot, assertNoWrites, destroy,
    setViewport(next) { Object.assign(viewport, next); G.render.resize(); paint(); }, failPhotoOnce() { failNextPhoto = true; },
    first: first.roomId, upper: upper.roomId, uid: frame.uid, bedUid: bed.uid };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function finite(values, message) { for (const value of values) assert.ok(Number.isFinite(value), message || '数值必须有限'); }
function vector(actual, expected, epsilon) { actual.forEach((value, i) => near(value, expected[i], epsilon)); }
function vertices(world) {
  const output = [];
  for (let i = 0; i < world.staticCount * 9; i += 9) output.push({ p: Array.from(world.vertices.slice(i, i + 3)), n: Array.from(world.vertices.slice(i + 3, i + 6)), c: Array.from(world.vertices.slice(i + 6, i + 9)) });
  return output;
}

function orient(env, angle, elevation) {
  env.G.render.camera.rotate((env.world.angle - angle) / .007, (elevation - env.world.elevation) / .004); env.redraw();
  near(Math.sin(env.world.angle), Math.sin(angle)); near(Math.cos(env.world.angle), Math.cos(angle)); near(env.world.elevation, elevation);
}
function screenPlanePoint(world, screen) {
  // 相机目标落在安全区中心（偏心正交投影），不是整幅画布中心。
  const env = world.env, center = world.viewCenterScreen(env), dx = screen.x - center.x, dy = center.y - screen.y, unit = world.range / env.height;
  return world.target.map((value, i) => value + (world.right[i] * dx + world.up[i] * dy) * unit);
}
function assertAnchorVisible(env) {
  // 画布铺满整幅scene：极端拖拽/缩放后焦点仍须留在画布内（不再限于安全区）。
  const spec = env.world.cameraSpec(env.world.env), point = env.world.project(spec.anchor), c = env.world.env;
  assert.ok(point.x >= -.01 && point.x < c.width + .01 && point.y >= -.01 && point.y < c.height + .01, '实际焦点anchor须在整幅画布中');
  finite([...env.world.target, ...(env.world.panVector || []), ...Array.from(env.world.matrix)]); return point;
}
function assertRestored(env, before) {
  assert.deepEqual(env.camera(), before.camera); vector(Array.from(env.world.panVector || [0, 0, 0]), before.pan, 1e-7); vector(Array.from(env.world.target), before.target, 1e-7);
  vector(Array.from(env.world.matrix), before.matrix, 1e-7); assert.equal(env.G.render.camera.getInteractionMode(), before.mode); env.assertNoWrites(before);
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('公共交互API默认pan，模式事件与显式reset回pan/标准角度且不写存档', () => {
  const env = setup();
  try {
    const c = env.G.render.camera, before = env.snapshot(); assert.equal(c.getInteractionMode(), 'pan');
    assert.equal(c.setInteractionMode('orbit'), 'orbit'); assert.equal(c.getInteractionMode(), 'orbit'); assert.equal(env.interactionEvents.at(-1), 'orbit');
    assert.equal(c.setInteractionMode('invalid-mode'), 'pan'); assert.equal(env.interactionEvents.at(-1), 'pan');
    c.setInteractionMode('orbit'); c.rotate(140, -140); env.redraw(); c.resetView(); env.redraw();
    assert.equal(c.getInteractionMode(), 'pan'); assert.equal(env.interactionEvents.at(-1), 'pan'); assert.equal(c.focusKind, 'overview'); near(env.world.angle, .43); near(env.world.elevation, .49);
    vector(Array.from(env.world.panVector), [0, 0, 0], 1e-7); env.assertNoWrites(before);
  } finally { env.destroy(); }
});

test('默认空白pointer拖动沿当前right/up平移，负俯仰与±π朝向均保持CSS像素位移', () => {
  const env = setup();
  try {
    const before = env.snapshot();
    for (const angle of [-Math.PI, -Math.PI + .02, .43, Math.PI - .02, Math.PI]) for (const elevation of [-.35, .49]) {
      orient(env, angle, elevation); env.G.render.camera.focusRoom(env.first); env.redraw();
      const p = env.framePoint(), oldCamera = env.camera(), oldAngle = env.world.angle, oldElevation = env.world.elevation, oldPan = Array.from(env.world.panVector);
      const start = { x: 24, y: 50 }, end = { x: 32, y: 56 };
      // 起止点在原安全区左上边距内；画布铺满后属于画布内，仍是空白拖动。
      assert.equal(env.world.containsScreen(start.x, start.y), true); assert.equal(env.world.containsScreen(end.x, end.y), true); assert.ok(start.x < env.viewport.x && start.y < env.viewport.y);
      assert.equal(env.world.containsScreen(-1, start.y), false); assert.equal(env.world.containsScreen(start.x, 700), false);
      env.event('pointerdown', start); env.event('pointermove', end); env.event('pointerup', end); env.redraw();
      const moved = env.framePoint(); near(moved.x - p.x, 8, .003); near(moved.y - p.y, 6, .003);
      assert.notDeepEqual(Array.from(env.world.panVector), oldPan); assert.deepEqual(env.camera(), oldCamera); near(env.world.angle, oldAngle); near(env.world.elevation, oldElevation);
    }
    env.assertNoWrites(before);
  } finally { env.destroy(); }
});

test('只有显式orbit才旋转并连续跨π归一，家具和名牌拖动保留原选择/拖放优先级', () => {
  const env = setup();
  try {
    const before = env.snapshot(), c = env.G.render.camera; c.setInteractionMode('orbit'); orient(env, Math.PI - .02, .2); c.focusRoom(env.first); env.redraw();
    const oldRight = Array.from(env.world.right); c.rotate(-8, 0); env.redraw();
    assert.ok(env.world.angle >= -Math.PI && env.world.angle < Math.PI); assert.ok(env.world.angle < 0, '朝向越过π后归一且可继续旋转'); assert.ok(env.world.right.reduce((sum, n, i) => sum + n * oldRight[i], 0) > .99);
    const angle = env.world.angle; env.event('pointerdown', { x: 24, y: 50 }); env.event('pointermove', { x: 56, y: 60 }); env.event('pointerup', { x: 56, y: 60 }); env.redraw(); assert.notEqual(env.world.angle, angle);
    for (const mode of ['pan', 'orbit']) for (const kind of ['item', 'label']) {
      c.resetView(); env.G.render.setHouseView({ floor: 1 }); c.focusRoom(env.first); c.setInteractionMode(mode); env.redraw();
      let point = env.framePoint();
      if (kind === 'label') { const label = env.world.labelHits.find(hit => hit.kind === 'room-label' && hit.roomId === env.first); assert.ok(label); point = { x: label.screen.x + label.screen.w / 2, y: label.screen.y + label.screen.h / 2 }; }
      assert.equal(env.world.pick(point.x, point.y)?.kind, kind === 'item' ? 'item' : 'room-label');
      const camera = env.camera(), pan = Array.from(env.world.panVector), yaw = env.world.angle, elevation = env.world.elevation;
      env.event('pointerdown', point); env.event('pointermove', { x: point.x + 9, y: point.y + 1 }); env.redraw();
      assert.deepEqual(env.camera(), camera); vector(Array.from(env.world.panVector), pan, 1e-7); near(env.world.angle, yaw); near(env.world.elevation, elevation);
      if (kind === 'item') assert.equal(env.G.runtime.selected.uid, env.uid);
      env.event('pointercancel', point); env.redraw();
    }
    env.assertNoWrites(before);
  } finally { env.destroy(); }
});

test('wheel缩放锁定相机平面anchor，禁用语义pick仍工作且水平/仰视不会跳镜', () => {
  const env = setup();
  try {
    const before = env.snapshot(), c = env.G.render.camera;
    for (const angle of [-Math.PI + .01, .43, Math.PI - .01]) for (const elevation of [-.4, 0, .49]) {
      orient(env, angle, elevation); c.focusRoom(env.first); env.redraw();
      const point = { x: env.viewport.x + env.viewport.width / 2 + 18, y: env.viewport.y + env.viewport.height / 2 - 12 }, anchor = screenPlanePoint(env.world, point), x = c.x, y = c.y, oldScale = c.scale;
      const pick = env.world.pick; env.world.pick = () => { throw new Error('缩放不得依赖家具/房间语义拾取'); };
      try { env.event('wheel', point, { deltaY: -Math.log(1.15) / .0014 }); env.redraw(); }
      finally { env.world.pick = pick; }
      assert.ok(c.scale > oldScale); const screen = env.world.project(anchor); near(screen.x, point.x, .003); near(screen.y, point.y, .003); assert.equal(c.x, x); assert.equal(c.y, y);
      finite([...env.world.target, ...env.world.panVector, ...Array.from(env.world.matrix)]);
    }
    const stable = env.snapshot(); for (const factor of [NaN, Infinity, -1, 0]) c.zoom(factor); assertRestored(env, stable); env.assertNoWrites(before);
  } finally { env.destroy(); }
});

test('极端pan/zoom保留各真实焦点可见，最小缩放来自完整3D场景并在resize后重算', () => {
  const env = setup();
  try {
    const before = env.snapshot(), c = env.G.render.camera;
    for (const [kind, focus] of [['overview', () => c.resetView()], ['room', () => c.focusRoom(env.first)], ['floor', () => c.focusFloor(0)], ['garden', () => c.focusGarden()], ['yard', () => c.focusYard()], ['sea', () => c.focusSea()]]) {
      focus(); env.redraw(); assert.equal(c.focusKind, kind); if (kind === 'room') assert.equal(c.focusId, env.first); if (kind === 'floor') assert.equal(c.focusFloorIndex, 0);
      for (const [dx, dy] of [[1e8, 1e8], [-1e8, -1e8], [1e8, -1e8]]) { c.pan(dx, dy); env.redraw(); assertAnchorVisible(env); }
      for (let i = 0; i < 16; i++) c.zoom(.5); env.redraw(); const limits = env.world.zoomLimits(env.world.env); assert.ok(limits.min > 0 && limits.max >= limits.min); near(c.scale, limits.min, 1e-8); assertAnchorVisible(env);
      c.zoom(.5); env.redraw(); near(c.scale, limits.min, 1e-8);
    }
    const oldMinimum = env.world.zoomLimits(env.world.env).min; env.setViewport({ width: 366, height: 380 }); const newMinimum = env.world.zoomLimits(env.world.env).min;
    assert.notEqual(newMinimum, oldMinimum, '动态下界响应实际可用viewport，不能是固定.04');
    for (let i = 0; i < 16; i++) c.zoom(.5); env.redraw(); near(c.scale, newMinimum, 1e-8); assertAnchorVisible(env); env.assertNoWrites(before);
  } finally { env.destroy(); }
});

test('fit/resize按cameraSpec真实3D点取景并保留角度，legacy y跨零不会让target突跳', () => {
  const env = setup();
  try {
    const before = env.snapshot(), c = env.G.render.camera;
    for (const angle of [-Math.PI, -1.5, 0, Math.PI - .01]) for (const elevation of [-.4, .49, 1.05]) {
      c.resetView(); orient(env, angle, elevation); c.fit(); env.redraw(); const actualAngle = env.world.angle;
      const inspect = () => {
        const spec = env.world.cameraSpec(env.world.env), v = env.viewport; assert.ok(spec.points.length > 8);
        for (const p of spec.points) { const screen = env.world.project(p); assert.ok(screen.x >= v.x - .01 && screen.x <= v.x + v.width + .01 && screen.y >= v.y - .01 && screen.y <= v.y + v.height + .01, '完整取景必须覆盖实际主岛、土层、屋顶与花园3D点'); }
      };
      inspect(); env.G.render.resize(); env.paint(); near(env.world.angle, actualAngle); near(env.world.elevation, elevation); inspect();
    }
    c.focusRoom(env.first); env.redraw(); c.y = -.001; env.redraw(); const a = Array.from(env.world.target); c.y = .001; env.redraw();
    assert.ok(Math.hypot(...env.world.target.map((value, i) => value - a[i])) < .001, 'legacy y在零点两侧只能是小量连续平移'); env.assertNoWrites(before);
  } finally { env.destroy(); }
});

test('摄影house/room忽略交互pan，view保存真实取景，成功或异常后恢复全部相机状态', () => {
  const env = setup();
  try {
    const c = env.G.render.camera; c.focusRoom(env.first); env.redraw();
    function capture(scope) {
      const start = env.renders.length, photo = env.G.render.captureScene({ scope, roomId: scope === 'room' ? env.first : undefined, width: 640, height: 480 });
      const renders = env.renders.slice(start).filter(entry => entry.photo); assert.equal(renders.length, 1); assert.equal(renders[0].capturingPhoto, true); assert.ok(renders[0].uids.includes(env.uid)); assert.ok(photo.context.record.composites.length > 0); return renders[0];
    }
    const baseline = capture('house'); c.pan(22, 12); c.zoom(1.2); c.setInteractionMode('orbit'); env.redraw(); const before = env.snapshot();
    const house = capture('house'); vector(house.target, baseline.target, 1e-6); near(house.range, baseline.range, 1e-6); assertRestored(env, before);
    const room = capture('room'); assert.equal(room.roomOnly, env.first); assertRestored(env, before);
    const view = capture('view'); vector(view.target, before.target, 1e-6); near(view.range, env.world.viewFrame().range, 1e-6); near(env.world.viewFrame().range * env.world.rangeScale(env.world.env), env.world.range, 1e-6); assert.ok(env.world.rangeScale(env.world.env) > 1, '拍照view用安全区子视窗取景，不是整幅画布'); assertRestored(env, before);
    env.failPhotoOnce(); assert.throws(() => env.G.render.captureScene({ scope: 'room', roomId: env.first, width: 640, height: 480 }), /camera photo composite failed/); assertRestored(env, before); env.redraw();
  } finally { env.destroy(); }
});

test('非转动视角拖动＝拖桌布：平移量要折算给2D云海背景，向右拖背景x变小、复位后归零', () => {
  const env = setup();
  try {
    const c = env.G.render.camera; c.resetView(); env.redraw(); const still = env.world.panShift(); near(still.x, 0); near(still.y, 0);
    c.pan(40, 0); env.redraw(); const right = env.world.panShift(); assert.ok(right.x < -1, '向右拖时背景视差x应变小，背景才会跟着一起动');
    c.pan(-80, 0); env.redraw(); assert.ok(env.world.panShift().x > right.x, '反向拖动要往回走');
    c.resetView(); env.redraw(); near(env.world.panShift().x, 0); near(env.world.panShift().y, 0);
  } finally { env.destroy(); }
});

test('进入房间入口挂在每间房上方；进入后主角站到所点的那间房而不是第一间，再点回院子', () => {
  const env = setup();
  try {
    const G = env.G, c = G.render.camera; c.resetView(); env.redraw();
    const upper = Object.keys(G.state.house.rooms).find(id => id !== env.first); assert.ok(upper);
    const enterLabel = id => env.world.labels.find(v => v.kind === 'room-enter' && v.roomId === id);
    assert.ok(enterLabel(env.first) && enterLabel(upper), '每间已建房间都应有场景内的进入入口'); assert.equal(enterLabel(upper).text, '进入房间');
    const player = () => env.world.actors.find(v => v.kind === 'player');
    assert.equal(player().inYard, true);
    assert.equal(G.playerMovement.enterRoom(upper), true); env.redraw();
    assert.equal(player().inYard, false, '点进入后主角应离开院子'); assert.equal(enterLabel(upper).text, '去院子');
    const roomPoint = env.world.hits.find(h => h.kind === 'room' && h.room?.id === upper); assert.ok(roomPoint);
    assert.ok(Math.abs(player().p[0] - roomPoint.min[0] - (roomPoint.max[0] - roomPoint.min[0]) / 2) < 2.2 && player().p[1] > 1, '主角应站在第二间房（高于一楼）里');
    G.playerMovement.toYard(-0.6, 2.4); env.redraw(); assert.equal(player().inYard, true); assert.equal(enterLabel(upper).text, '进入房间');
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组真实scene相机输入/约束/摄影隔离契约通过（GL状态替身，不代替浏览器相机手感验收）。');
