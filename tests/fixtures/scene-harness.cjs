'use strict';
// 场景相机测试共用夹具：内存Game + 真实WebGL引擎 + 有状态GL替身（从 world3d-camera-input.cjs 抽出，新测试共用，不改旧测试）。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');

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
  // 需要额外渲染模块（如 garden-page3d）的测试通过 options.extraFiles 在 scene.js 之前加载。
  files.splice(files.indexOf('js/render/scene.js'), 0, ...(options.extraFiles || []));
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.inventory.frame_basic = 2; });
  G.sys.garden = { capacity: () => 9, status: index => ({ index, crop: null, stage: 0, mature: false, locked: false, empty: true }) };
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
      finally { renders.push({ photo: !!settings?.photo, capturingPhoto: env.capturingPhoto, safe: env.safe || null, width: env.width, height: env.height, offsetX: env.offsetX, offsetY: env.offsetY, roomOnly: env.roomOnly || null, target: Array.from(this.target || []), range: this.range, output, uids: this.hits.filter(hit => hit.kind === 'item').map(hit => hit.uid) }); }
    }
  };
  if (options.beforeInit) options.beforeInit(G); // 需要在 scene 初始化前挂 G.live 等桩的测试用（可选）
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
module.exports = { setup, near, finite, vector, DESKTOP, MOBILE };
