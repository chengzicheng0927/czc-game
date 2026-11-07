'use strict';
// MC-076/078：可选只读舞台的真实scene/WebGL集成契约。舞台工厂仅用内存describe替身。
// 不加载尚未交付的stage模块，不启动服务/浏览器，不写真实存档；由总集串行执行。
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

const DESKTOP = Object.freeze({ x: 100, y: 80, width: 550, height: 450, layout: 'side' });
const MOBILE = Object.freeze({ x: 12, y: 120, width: 366, height: 290, layout: 'side' });
function setup(options = {}) {
  let now = 0, serial = 0, instance = null, revision = 0, failNextPhoto = false;
  const raf = new Map(), surfaces = [], renders = [], descriptions = [], builds = [], observed = new Set(), viewport = options.viewport || DESKTOP;
  const stage = events({ width: 900, height: 700, clientWidth: 900, clientHeight: 700, style: {}, dataset: {}, captured: new Set() });
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700 });
  stage.setAttribute = () => {}; stage.setPointerCapture = id => stage.captured.add(id); stage.hasPointerCapture = id => stage.captured.has(id); stage.releasePointerCapture = id => stage.captured.delete(id);
  stage.context = context2d(stage); stage.getContext = type => { assert.equal(type, '2d'); return stage.context; };
  const document = events({ hidden: false, getElementById: id => id === 'scene' ? stage : null,
    createElement(tag) {
      assert.equal(tag, 'canvas'); const gpu = glFixture(), canvas = events({ width: 0, height: 0, style: {}, dataset: {}, gpu });
      canvas.context = context2d(canvas);
      canvas.getContext = (type, settings) => {
        if (type === '2d') {
          if (failNextPhoto) { failNextPhoto = false; canvas.context.drawImage = () => { throw new Error('isolated photo composite failed'); }; }
          return canvas.context;
        }
        assert.equal(type, 'webgl'); assert.equal(settings.preserveDrawingBuffer, true); return gpu.gl;
      };
      surfaces.push(canvas); return canvas;
    }
  });
  const media = events({ matches: true }), context = vm.createContext({ console, document, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++serial; raf.set(id, callback); return id; }, cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, matchMedia: () => media,
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe(canvas) { observed.add(canvas); } disconnect() { observed.clear(); } }
  });
  context.window = context; context.innerWidth = 900; context.innerHeight = 700; context.devicePixelRatio = 2; events(context);
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/systems/yard.js',
    'js/render/room-space.js', 'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 11; state.wallet.coin = 100000; state.inventory.frame_basic = 3; });
  G.sys.garden = { capacity: () => G.data.gardenConfig.expandedPlots, status: index => ({ index, crop: null, stage: 0, mature: false, locked: false }) };
  const room = G.sys.building.buildRoom(0, 0, 'bedroom'); assert.ok(room.ok);
  const frame = G.sys.decorating.place('frame_basic', room.roomId, 160, 40, null); assert.ok(frame.ok);
  const calls = { update: 0, buildRoom: 0, swap: 0, place: 0, move: 0, remove: 0, collect: 0, questClaim: 0, reward: 0 }, sceneEvents = [];
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast() {}, selection() {}, refresh() {}, open() {} }; G.audio = { play() {} };
  G.runtime.shellLayout = { panelKind: null }; G.runtime.residentBookV2 = { friend: 'lily' };
  function wrap(object, name, count) { const original = object[name]; assert.equal(typeof original, 'function'); object[name] = function (...args) { calls[count]++; return original.apply(this, args); }; }
  wrap(G.store, 'update', 'update'); wrap(G.sys.building, 'buildRoom', 'buildRoom'); wrap(G.sys.building, 'swapRooms', 'swap');
  wrap(G.sys.decorating, 'place', 'place'); wrap(G.sys.decorating, 'move', 'move'); wrap(G.sys.decorating, 'remove', 'remove');
  wrap(G.sys.residents, 'collect', 'collect'); wrap(G.sys.quests, 'claim', 'questClaim'); wrap(G.sys.economy, 'reward', 'reward');
  ['scene:item', 'scene:room', 'scene:empty', 'scene:room-layout', 'scene:resident', 'scene:player', 'scene:guide', 'scene:observatory', 'scene:garden', 'scene:neighbor', 'scene:deselect', 'yard:selected'].forEach(name => G.bus.on(name, payload => sceneEvents.push({ name, payload })));
  function installModule() {
    G.pageStages3D = { describe(env) {
      const surface = env.surface, residentId = env.residentId, avatar = JSON.stringify(env.state.avatar);
      descriptions.push({ surface, residentId, avatar });
      if (!['avatar', 'residents'].includes(surface)) return null;
      const id = surface, key = JSON.stringify([id, residentId || null, avatar, revision]);
      return { id, key, readonlyStage: true, bounds: { min: [-2, 0, -1.5], max: [2, 3.4, 1.5] }, focus: [0, 1.6, 0],
        build(g, M) {
          builds.push({ id, key, residentId, avatar });
          g.box([0, .12, 0], [3.8, .24, 2.8], id === 'avatar' ? '#D57996' : '#A6C7A4', .08);
          M.character(g, env.state.avatar, [0, .24, 0], 1.25, null);
        }
      };
    } };
  }
  if (!options.withoutModule) installModule();
  const NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld {
    constructor(...args) { super(...args); instance = this; }
    render(output, env, settings) {
      const entry = { requestedStage: env.stage?.id || null, photo: !!settings?.photo, roomOnly: env.roomOnly || null, output, surface: env.surface };
      renders.push(entry);
      try { return super.render(output, env, settings); }
      finally { entry.stage = this.env?.stage?.id || null; entry.uids = this.hits.filter(hit => hit.kind === 'item').map(hit => hit.uid); entry.vertices = this.vertices?.length || 0; }
    }
  };
  G.render.init(stage); assert.ok(instance?.ready, '舞台集成必须真的初始化WebGL');
  G.render.setHouseView({ floor: 1 }); G.render.camera.focusRoom(room.roomId);
  function paint() {
    now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length, '使用scene调度的真实RAF'); batch.forEach(callback => callback(now));
    assert.equal(stage.dataset.renderer, 'webgl', '降级不能冒充stage成功');
  }
  function redraw() { G.render.redraw(); paint(); }
  function surface(kind, emitPanel = true) {
    G.runtime.shellLayout.panelKind = kind || null; G.runtime.mode = 'explore';
    if (emitPanel) G.bus.emit('panel:change', { open: !!kind, layout: 'side', height: 0 });
    redraw();
  }
  function event(name, point, extra) {
    const e = stage.dispatch(name, Object.assign({ clientX: point.x, clientY: point.y }, extra || {}));
    if (name === 'pointerup' || name === 'pointercancel') stage.captured.delete(e.pointerId); return e;
  }
  function click(point) { event('pointerdown', point); event('pointerup', point); }
  function camera() { return { x: G.render.camera.x, y: G.render.camera.y, scale: G.render.camera.scale }; }
  function statusStage() { const status = G.render.rendererStatus(); assert.ok(Object.hasOwn(status, 'stage')); return typeof status.stage === 'string' ? status.stage || null : status.stage?.id || null; }
  function snapshot() { return { state: JSON.stringify(G.state), camera: camera(), calls: Object.assign({}, calls), events: sceneEvents.length }; }
  function assertNoBusiness(before) { assert.equal(JSON.stringify(G.state), before.state); assert.deepEqual(calls, before.calls); assert.equal(sceneEvents.length, before.events); }
  function insidePoint() { return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }; }
  function framePoint() { const hit = instance.hits.find(value => value.uid === frame.uid); assert.ok(hit, '家园恢复后必须仍有真实挂画'); return instance.project([hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]]); }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); assert.equal(observed.size, 0); }
  paint(); assert.ok(instance.hits.some(hit => hit.uid === frame.uid));
  return { G, world: instance, stage, viewport, surfaces, renders, descriptions, builds, calls, sceneEvents, paint, redraw, surface, event, click, camera, statusStage, snapshot, assertNoBusiness, insidePoint, framePoint, destroy, installModule,
    bumpRevision() { revision++; }, failPhotoOnce() { failNextPhoto = true; }, roomId: room.roomId, uid: frame.uid };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function equalProjection(actual, expected) { near(actual.x, expected.x, .001); near(actual.y, expected.y, .001); }
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('可选模块缺失或非avatar/residents页面仍绘真实家园，不产生stage缓存', () => {
  const env = setup({ withoutModule: true });
  try {
    for (const surface of ['avatar', 'residents', 'garden']) {
      env.surface(surface); assert.equal(env.world.env.stage || null, null); assert.equal(env.statusStage(), null);
      assert.ok(env.world.hits.some(hit => hit.uid === env.uid)); assert.ok(env.world.vertices.length > 0);
    }
    env.installModule(); env.surface('garden'); assert.equal(env.statusStage(), null); assert.equal(env.builds.length, 0);
  } finally { env.destroy(); }
});

test('进入只读舞台仅build descriptor，清除家园命中/人物/名牌，重复绘制不重建几何', () => {
  const env = setup();
  try {
    const before = env.snapshot(); env.surface('avatar'); assert.equal(env.statusStage(), 'avatar');
    assert.equal(env.world.env.surface, 'avatar'); assert.equal(env.world.env.residentId, 'lily'); assert.equal(env.world.env.stage.id, 'avatar');
    assert.ok(env.descriptions.some(value => value.surface === 'avatar' && value.residentId === 'lily'));
    assert.ok(env.builds.some(value => value.id === 'avatar')); assert.ok(env.world.vertices.length > 0);
    assert.equal(env.world.hits.length, 0); assert.equal(env.world.actors.length, 0); assert.equal(env.world.labels.length, 0); assert.equal((env.world.labelHits || []).length, 0);
    const count = env.builds.length, builds = env.world.builds; env.redraw(); env.redraw();
    assert.equal(env.builds.length, count); assert.equal(env.world.builds, builds); env.assertNoBusiness(before); assert.deepEqual(env.camera(), before.camera);
    env.bumpRevision(); env.redraw(); assert.equal(env.builds.length, count + 1, 'stage.key变化必须更新真实几何');
  } finally { env.destroy(); }
});

test('居民切换和真实换装改变descriptor key，页面id变化也替换旧舞台', () => {
  const env = setup();
  try {
    env.surface('residents'); const firstKey = env.world.env.stage.key, initial = env.builds.length;
    env.G.runtime.residentBookV2.friend = 'pudding'; env.redraw();
    assert.equal(env.world.env.residentId, 'pudding'); assert.notEqual(env.world.env.stage.key, firstKey); assert.equal(env.builds.length, initial + 1);
    const residentKey = env.world.env.stage.key;
    // 正式校验只接受衣橱发色枚举，使用不同的合法颜色检验stage缓存失效。
    const hairColor = env.G.data.avatarHairColors.find(option => option.id !== env.G.state.avatar.hairColor)?.id;
    assert.ok(hairColor, '正式衣橱必须提供不同于当前外观的合法发色');
    env.G.store.update(state => { state.avatar.hairColor = hairColor; }); const afterChange = JSON.stringify(env.G.state); env.redraw();
    assert.equal(env.G.state.avatar.hairColor, hairColor);
    assert.notEqual(env.world.env.stage.key, residentKey); assert.equal(JSON.parse(env.builds.at(-1).avatar).hairColor, hairColor); assert.equal(JSON.stringify(env.G.state), afterChange);
    env.surface('avatar'); assert.equal(env.statusStage(), 'avatar'); assert.equal(env.builds.at(-1).id, 'avatar');
  } finally { env.destroy(); }
});

test('desktop和mobile可用viewport自动fit descriptor bounds，偏移后全部角点仍可见', () => {
  for (const viewport of [DESKTOP, MOBILE]) {
    const env = setup({ viewport });
    try {
      env.surface('avatar'); const bounds = env.world.env.stage.bounds;
      for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
        const screen = env.world.project([x, y, z]);
        assert.ok(screen.x >= viewport.x - .001 && screen.x <= viewport.x + viewport.width + .001, '舞台横向fit实际可用区');
        assert.ok(screen.y >= viewport.y - .001 && screen.y <= viewport.y + viewport.height + .001, '舞台纵向fit实际可用区');
      }
    } finally { env.destroy(); }
  }
});

test('stage点击返回NaN只读命中，既不打开家园业务也不调用建造/家具/领奖', () => {
  const env = setup();
  try {
    env.surface('residents'); const point = env.insidePoint(), before = env.snapshot(), hit = env.world.pick(point.x, point.y);
    assert.equal(hit.kind, 'stage'); assert.ok(Number.isNaN(hit.world.x) && Number.isNaN(hit.world.y));
    const legacy = env.G.render.camera.screenToWorld(point.x, point.y); assert.equal(legacy.target.kind, 'stage'); assert.ok(Number.isNaN(legacy.x) && Number.isNaN(legacy.y));
    env.click(point); env.redraw(); env.assertNoBusiness(before); assert.deepEqual(env.camera(), before.camera);
  } finally { env.destroy(); }
});

test('stage旋转缩放和Shift平移改变舞台镜头，house camera与返回后的家园投影保持', () => {
  const env = setup();
  try {
    const homeCamera = env.camera(), homePoint = env.framePoint(); env.surface('avatar'); const before = env.snapshot(), point = env.insidePoint();
    let matrix = Array.from(env.world.matrix);
    env.event('pointerdown', point); env.event('pointermove', { x: point.x + 48, y: point.y + 18 }); env.event('pointerup', { x: point.x + 48, y: point.y + 18 }); env.redraw();
    assert.notDeepEqual(Array.from(env.world.matrix), matrix, '真实pointer拖动必须转动stage'); assert.deepEqual(env.camera(), homeCamera);
    matrix = Array.from(env.world.matrix); env.event('wheel', point, { deltaY: -120 }); env.redraw();
    assert.notDeepEqual(Array.from(env.world.matrix), matrix, '真实wheel必须缩放stage'); assert.deepEqual(env.camera(), homeCamera);
    matrix = Array.from(env.world.matrix);
    env.event('pointerdown', point, { shiftKey: true }); env.event('pointermove', { x: point.x + 30, y: point.y + 22 }, { shiftKey: true }); env.event('pointerup', { x: point.x + 30, y: point.y + 22 }, { shiftKey: true }); env.redraw();
    assert.notDeepEqual(Array.from(env.world.matrix), matrix, 'Shift拖动必须平移stage'); assert.deepEqual(env.camera(), homeCamera); env.assertNoBusiness(before);
    env.surface(null); assert.equal(env.statusStage(), null); assert.deepEqual(env.camera(), homeCamera); equalProjection(env.framePoint(), homePoint); assert.ok(env.world.hits.some(hit => hit.uid === env.uid));
  } finally { env.destroy(); }
});

test('真实放置和已开始的家具/房间拖动强制house，不被随后打开的舞台抢走', () => {
  for (const kind of ['placing', 'item', 'room']) {
    const env = setup();
    try {
      if (kind === 'placing') { env.surface('avatar'); env.G.runtime.placing = 'bed_basic'; env.redraw(); }
      else {
        let point = env.framePoint();
        if (kind === 'room') { const label = env.world.labelHits.find(hit => hit.kind === 'room-label' && hit.roomId === env.roomId); assert.ok(label); point = { x: label.screen.x + label.screen.w / 2, y: label.screen.y + label.screen.h / 2 }; }
        env.event('pointerdown', point); env.event('pointermove', { x: point.x + 12, y: point.y + 2 }); env.surface('avatar', false);
      }
      assert.equal(env.statusStage(), null); assert.equal(env.world.env.stage || null, null); assert.ok(env.world.hits.some(hit => hit.kind === 'room' || hit.kind === 'empty'));
      if (kind !== 'placing') env.event('pointercancel', env.insidePoint()); else env.G.runtime.placing = null;
      env.redraw(); assert.equal(env.statusStage(), 'avatar', '结束操作后恢复可选只读舞台');
    } finally { env.destroy(); }
  }
});

test('舞台上摄影强制真实house/room几何，成功和失败finally都恢复舞台和house camera', () => {
  const env = setup();
  try {
    env.surface('avatar'); env.G.render.camera.rotate(25, 8); env.redraw();
    const before = env.snapshot(), matrix = Array.from(env.world.matrix), descriptors = env.builds.length;
    for (const scope of ['house', 'room']) {
      const start = env.renders.length, photo = env.G.render.captureScene({ scope, roomId: scope === 'room' ? env.roomId : undefined, width: 640, height: 480 });
      assert.equal(photo.width, 640); assert.equal(photo.height, 480); assert.ok(photo.context.record.composites.length > 0);
      const captures = env.renders.slice(start).filter(render => render.photo); assert.equal(captures.length, 1);
      assert.equal(captures[0].requestedStage, null); assert.equal(captures[0].stage, null); assert.ok(captures[0].uids.includes(env.uid)); assert.ok(captures[0].vertices > 0);
      assert.equal(captures[0].roomOnly, scope === 'room' ? env.roomId : null);
      assert.equal(env.world.env.stage.id, 'avatar'); assert.equal(env.statusStage(), 'avatar'); assert.deepEqual(env.camera(), before.camera); assert.deepEqual(Array.from(env.world.matrix), matrix); env.assertNoBusiness(before);
    }
    assert.ok(env.builds.length >= descriptors, '恢复阶段可以重建舞台，但摄影本身不能画舞台');
    env.failPhotoOnce(); assert.throws(() => env.G.render.captureScene({ scope: 'room', roomId: env.roomId, width: 640, height: 480 }), /isolated photo composite failed/);
    assert.equal(env.world.env.stage.id, 'avatar'); assert.equal(env.statusStage(), 'avatar'); assert.deepEqual(env.camera(), before.camera); assert.deepEqual(Array.from(env.world.matrix), matrix); env.assertNoBusiness(before);
    env.redraw(); assert.equal(env.stage.dataset.renderer, 'webgl');
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组只读3D舞台scene集成契约通过（describe/GL状态替身，不证明实际功能页舞台像素）。');
