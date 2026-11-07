'use strict';
// MC-079：真实阁楼规则、装饰空间、射线输入与摄影隔离契约。
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


const ATTIC = 'attic:observatory';
const DESKTOP = Object.freeze({ x: 80, y: 75, width: 600, height: 480, layout: 'side' });
const MOBILE = Object.freeze({ x: 12, y: 110, width: 366, height: 380, layout: 'side' });
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, epsilon = 1e-4) => assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected);
const succeeds = result => { assert.equal(result?.ok, true, result?.message); return result; };
function finite(values) { for (const value of values) assert.ok(Number.isFinite(value), '投影、矩阵与真实落点必须有限'); }
function setup(options = {}) {
  let now = 0, serial = 0, world = null, rejectWrites = false, failPhoto = false;
  const raf = new Map(), storage = new Map(), canvases = [], renders = [], messages = [], ruleCalls = [], placed = [], observed = [], roomEvents = [], itemEvents = [], gardenEvents = [], fallbackDraws = [], errors = [];
  const viewport = options.viewport || DESKTOP;
  const main = events({ width: 900, height: 700, clientWidth: 900, clientHeight: 700, style: {}, dataset: {}, captured: new Set() });
  main.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700 }); main.setAttribute = () => {};
  main.setPointerCapture = id => main.captured.add(id); main.hasPointerCapture = id => main.captured.has(id); main.releasePointerCapture = id => main.captured.delete(id);
  main.context = context2d(main); main.context.record.text = []; main.context.fillText = (...args) => main.context.record.text.push(args);
  main.getContext = type => { assert.equal(type, '2d'); return main.context; };
  const document = events({ hidden: false, body: { classList: { contains: () => false } }, getElementById: id => id === 'scene' ? main : null, createElement(tag) {
    assert.equal(tag, 'canvas'); const gpu = glFixture(), canvas = events({ width: 0, height: 0, style: {}, dataset: {}, gpu }); canvas.context = context2d(canvas);
    canvas.getContext = (type, settings) => { if (type === '2d') return canvas.context; assert.equal(type, 'webgl'); assert.equal(settings.preserveDrawingBuffer, true); return options.fallback ? null : gpu.gl; };
    canvases.push(canvas); return canvas;
  } });
  const media = events({ matches: true }), context = vm.createContext({ console: { log: console.log, warn: console.warn, error: (...args) => errors.push(args) }, document, Blob, URL,
    performance: { now: () => now }, requestAnimationFrame(callback) { const id = ++serial; raf.set(id, callback); return id; }, cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, matchMedia: () => media, ResizeObserver: class { observe() {} disconnect() {} }
  });
  context.window = context; context.innerWidth = 900; context.innerHeight = 700; context.devicePixelRatio = 2; events(context);
  context.localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (rejectWrites) throw new Error('合成存储拒写'); storage.set(key, String(value)); } };
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js', 'js/data/calendar.js', 'js/data/crafting.js', 'js/data/observatory.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/systems/yard.js', 'js/systems/garden.js', 'js/systems/observatory.js', 'js/render/room-space.js',
    'js/render/live-avatars.js', 'js/render/room-shell.js', 'js/render/observatory.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/garden-page3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 18; state.wallet.coin = 100000; state.settings.dayMode = 'night'; }); G.sys.garden.init();
  const ordinary = succeeds(G.sys.building.buildRoom(0, 0, 'bedroom')).roomId;
  const upper = succeeds(G.sys.building.buildRoom(1, 2, 'living')).roomId;
  for (const id of ['nightstand_basic', 'desk_lamp_basic', 'frame_basic', 'ceiling_lamp_basic', 'potted_plant_basic']) for (let i = 0; i < 5; i++) succeeds(G.sys.economy.buy(id));
  if (options.built !== false) succeeds(G.sys.observatory.build());
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast(value) { messages.push(value); }, selection() {}, refresh() {}, open() {} }; G.audio = { play() {} };
  G.draw.furnitureExtra = (c, def, x, y, item) => { fallbackDraws.push({ canvas: c.canvas, defId: def.id, uid: item.uid, item: plain(item) }); return false; };
  for (const name of ['place', 'move', 'remove']) { const action = G.sys.decorating[name]; G.sys.decorating[name] = function (...args) { ruleCalls.push({ name, args }); return action.apply(this, args); }; }
  G.bus.on('scene:placed', value => placed.push(value)); G.bus.on('scene:observatory', value => observed.push(value)); G.bus.on('scene:room', value => roomEvents.push(value)); G.bus.on('scene:item', value => itemEvents.push(value)); G.bus.on('scene:garden', value => gardenEvents.push(value));
  G.runtime.shellLayout = { panelKind: null }; const NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld {
    constructor(...args) { super(...args); world = this; }
    render(c, env, renderOptions) {
      const result = super.render(c, env, renderOptions);
      renders.push({ photo: !!renderOptions?.photo, canvas: c.canvas, view: plain(env.view), roomOnly: env.roomOnly || null, gardenPage: env.gardenPage?.id || null, stage: env.stage?.id || null,
        uids: this.hits.filter(hit => hit.kind === 'item').map(hit => hit.uid), roomIds: this.hits.filter(hit => hit.room).map(hit => hit.room.id), vertices: this.vertices?.length || 0 });
      if (renderOptions?.photo && failPhoto) { failPhoto = false; throw new Error('合成拍照失败'); }
      return result;
    }
  };
  G.render.init(main); assert.equal(world.ready, !options.fallback);
  function paint() { now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length, '必须推进真实scene请求的帧'); batch.forEach(callback => callback(now)); assert.equal(main.dataset.renderer, options.fallback ? 'canvas-fallback' : 'webgl'); }
  function redraw() { G.render.redraw(); paint(); }
  function event(name, point, extra) { const e = main.dispatch(name, Object.assign({ clientX: point.x, clientY: point.y }, extra || {})); if (name === 'pointerup' || name === 'pointercancel') main.captured.delete(e.pointerId); return e; }
  function click(point, pointerId = 1) { event('pointerdown', point, { pointerId }); event('pointerup', point, { pointerId }); }
  function transfer(defId) { return { dropEffect: 'none', getData: type => ['application/x-marshmallow-item', 'application/x-marshmallow-furniture', 'text/plain'].includes(type) ? defId : '' }; }
  function room(id = ATTIC) { const value = G.store.decorRoom(G.state, id); assert.ok(value, '只能解析真实已建空间：' + id); return value; }
  function descriptor(id = ATTIC) { const value = id === ATTIC ? world.env.atticRoom : world.env.rooms.find(room => room.id === id && room.data); assert.ok(value, '真正场景hits应携带装饰空间描述：' + id); return value; }
  function projected(p) { finite(p); const point = world.project(p); finite([point.x, point.y, point.z]); assert.ok(world.containsScreen(point.x, point.y), '真实控制点应位于可用viewport'); return point; }
  function groundPoint(id, defId, canonicalX = 235, depth = .7, grab = { u: .5, v: 1 }) {
    const desc = descriptor(id), frame = world.spaceFrame(desc), p = [frame.x + (canonicalX - 160) / 100, frame.y + .15, G.world3dMath.depthZ(depth)], def = G.data.furnitureById[defId];
    p[1] += def.h * (1 - grab.v) / 100;
    const screen = projected(p), hit = world.pick(screen.x, screen.y, { place: def.place, def, grab }); assert.equal(hit?.room?.id, id, '落点必须来自实际支撑平面ray，不能补activeRoom');
    const local = G.roomSpace.placement(def, { x: hit.world.x - desc.x, y: hit.world.y - desc.y }, grab); near(local.depth, depth, .001); return { screen, hit, desc, local, depth };
  }
  function wallPoint(id, defId, localX = 220, localY = 82) {
    const desc = descriptor(id), frame = world.spaceFrame(desc), def = G.data.furnitureById[defId], screen = projected([frame.x + (localX - 160) / 100, frame.y + (142 - localY) / 78, frame.backZ]);
    const hit = world.pick(screen.x, screen.y, { place: def.place, def }); assert.equal(hit?.room?.id, id); finite([hit.world.x, hit.world.y]); return { screen, hit, desc };
  }
  function hitPoint(uid) {
    const hit = world.hits.find(value => value.uid === uid); assert.ok(hit, '真实家具UID必须进入渲染命中列表');
    for (const u of [.5, .25, .75]) for (const v of [.45, .7, .2]) {
      const point = world.project([hit.min[0] + (hit.max[0] - hit.min[0]) * u, hit.min[1] + (hit.max[1] - hit.min[1]) * v, hit.max[2]]);
      if (world.containsScreen(point.x, point.y) && world.pick(point.x, point.y)?.uid === uid) return point;
    }
    assert.fail('实际可见家具必须可由真实ray选中：' + uid);
  }
  function enterAttic() { G.render.setHouseView({ floor: 'attic', view: 'cutaway', previewFourFloors: false }); G.render.camera.focusRoom(ATTIC); redraw(); }
  function begin(defId, id = ATTIC) { succeeds(G.render.beginPlacement(defId, id)); redraw(); }
  function snapshot() { return { object: G.state, state: JSON.stringify(G.state), disk: storage.get(G.data.balance.saveKey), placed: placed.length }; }
  function unchanged(before) { assert.equal(G.state, before.object); assert.equal(JSON.stringify(G.state), before.state); assert.equal(storage.get(G.data.balance.saveKey), before.disk); assert.equal(placed.length, before.placed); }
  function cameraSnapshot() { return { camera: plain({ x: G.render.camera.x, y: G.render.camera.y, scale: G.render.camera.scale, focusKind: G.render.camera.focusKind, focusId: G.render.camera.focusId }),
    view: plain(G.render.getHouseView()), angle: world.angle, elevation: world.elevation, target: Array.from(world.target), pan: Array.from(world.panVector || [0, 0, 0]), matrix: Array.from(world.matrix) }; }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); assert.deepEqual(errors, [], '产品事件处理不应悄悄抛错'); }
  paint(); return { G, world, main, document, canvases, renders, messages, ruleCalls, placed, observed, roomEvents, itemEvents, gardenEvents, fallbackDraws, viewport, ordinary, upper,
    paint, redraw, event, click, transfer, room, descriptor, projected, groundPoint, wallPoint, hitPoint, enterAttic, begin, snapshot, unchanged, cameraSnapshot,
    reject(value) { rejectWrites = value; }, failPhoto() { failPhoto = true; }, destroy };
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });


test('未建阁楼不能摆放，真实build后begin只进入独立阁楼近景，不改普通层/库存/奖励', () => {
  const env = setup({ built: false });
  try {
    const { G } = env, before = env.snapshot(), normal = plain({ rooms: G.state.house.rooms, floors: G.state.house.floors }), inventory = plain(G.state.inventory);
    assert.equal(G.store.decorRoom(G.state, ATTIC), null); assert.equal(G.render.beginPlacement('potted_plant_basic', ATTIC).ok, false); env.unchanged(before);
    succeeds(G.sys.observatory.build()); env.redraw(); const afterBuild = env.snapshot(), stats = plain(G.state.quests.stats), sky = plain(G.state.observatory);
    G.render.setHouseView({ floor: 4, view: 'exterior', previewFourFloors: true }); G.render.camera.rotate(300, 30); env.redraw();
    env.begin('potted_plant_basic'); env.unchanged(afterBuild);
    assert.deepEqual(plain(G.render.getHouseView()), { floor: 'attic', view: 'cutaway', previewFourFloors: false });
    assert.equal(G.runtime.activeRoomId, ATTIC); assert.equal(G.runtime.placing, 'potted_plant_basic'); assert.equal(G.runtime.mode, 'decorate');
    const desc = env.descriptor(); assert.equal(desc.id, ATTIC); assert.equal(desc.kind, 'attic'); assert.equal(desc.w, 320); assert.equal(desc.h, 220); assert.equal(desc.data, G.state.house.attic.room);
    assert.equal(env.world.env.rooms.some(room => room.id === ATTIC), false, '独立阁楼不进入普通四层slots'); assert.equal(Object.hasOwn(G.state.house.rooms, ATTIC), false);
    assert.deepEqual(plain({ rooms: G.state.house.rooms, floors: G.state.house.floors }), normal); assert.deepEqual(plain(G.state.inventory), inventory); assert.deepEqual(plain(G.state.quests.stats), stats); assert.deepEqual(plain(G.state.observatory), sky);
    const control = env.groundPoint(ATTIC, 'potted_plant_basic'), foot = G.roomSpace.foot(235, .7), actual = env.world.logicalToWorld(desc.x + foot.x, desc.y + foot.y), frame = env.world.spaceFrame(desc);
    near(actual[0], frame.x + .75); near(actual[1], frame.y + .15); near(actual[2], G.world3dMath.depthZ(.7)); finite([control.hit.world.x, control.hit.world.y, ...env.world.matrix]);
  } finally { env.destroy(); }
});

test('桌面/手机阁楼floor、wall、ceiling的Pointer和HTMLdrop共享真实房ID/库存/UID与支撑反算', () => {
  for (const viewport of [DESKTOP, MOBILE]) for (const input of ['pointer', 'drop']) {
    const env = setup({ viewport });
    try {
      const specs = [{ id: 'potted_plant_basic', place: 'floor', x: 245, depth: .74 }, { id: 'frame_basic', place: 'wall', x: 65, y: 86 }, { id: 'ceiling_lamp_basic', place: 'ceiling', x: 210, y: 63 }];
      for (const spec of specs) {
        env.begin(spec.id); const stock = env.G.state.inventory[spec.id], count = env.room().items.length, calls = env.ruleCalls.length;
        const control = spec.place === 'floor' ? env.groundPoint(ATTIC, spec.id, spec.x, spec.depth) : env.wallPoint(ATTIC, spec.id, spec.x, spec.y);
        const logical = env.G.render.camera.screenToWorld(control.screen.x, control.screen.y, spec.id); assert.equal(logical.target?.room?.id, ATTIC); finite([logical.x, logical.y]);
        if (input === 'pointer') env.click(control.screen);
        else { const dataTransfer = env.transfer(spec.id); env.event('dragover', control.screen, { dataTransfer }); env.event('drop', control.screen, { dataTransfer }); }
        env.redraw(); const last = env.placed.at(-1), item = env.room().items.find(value => value.uid === last?.result.uid);
        assert.ok(item); assert.equal(last.roomId, ATTIC); assert.equal(last.defId, spec.id); assert.equal(item.defId, spec.id); assert.equal(env.room().items.length, count + 1); assert.equal(env.G.state.inventory[spec.id], stock - 1); assert.equal(env.ruleCalls.length, calls + 1);
        assert.equal(env.ruleCalls.at(-1).args[1], ATTIC); assert.equal(env.world.hits.find(hit => hit.uid === item.uid)?.roomId, ATTIC); assert.equal(env.G.runtime.selected.uid, item.uid);
        if (spec.place === 'floor') near(item.depth, spec.depth, .001); else { assert.equal(Object.hasOwn(item, 'depth'), false); if (spec.place === 'ceiling') assert.equal(item.y, env.G.data.balance.ceilingLine); }
        const committed = env.snapshot(); env.event('pointerup', control.screen); env.unchanged(committed);
      }
      assert.equal(new Set(env.room().items.map(item => item.uid)).size, 3); assert.equal(env.G.state.house.rooms[env.ordinary].items.length, 0);
    } finally { env.destroy(); }
  }
});

test('真实阁楼nightstand台面接desk_lamp，parent和mesh/hit保持同空间并可单独选中', () => {
  const env = setup();
  try {
    env.begin('nightstand_basic'); env.click(env.groundPoint(ATTIC, 'nightstand_basic', 100, .4).screen); env.redraw(); const parentId = env.placed.at(-1).result.uid;
    env.begin('desk_lamp_basic'); const parent = env.world.hits.find(hit => hit.uid === parentId); assert.ok(parent?.def.surface);
    const screen = env.projected([parent.p[0], parent.p[1] + parent.size[1] * .99, parent.p[2]]), def = env.G.data.furnitureById.desk_lamp_basic;
    assert.equal(env.world.pick(screen.x, screen.y, { place: 'table', def })?.room?.id, ATTIC); const stock = env.G.state.inventory.desk_lamp_basic;
    env.click(screen); env.redraw(); const childId = env.placed.at(-1).result.uid, child = env.room().items.find(item => item.uid === childId), parentItem = env.room().items.find(item => item.uid === parentId);
    assert.equal(child.parent, parentId); assert.equal(child.y + def.h, parentItem.y + parent.def.surface.y); assert.equal(env.G.state.inventory.desk_lamp_basic, stock - 1); assert.equal(Object.hasOwn(child, 'depth'), false);
    const childHit = env.world.hits.find(hit => hit.uid === childId); assert.equal(childHit.roomId, ATTIC); assert.equal(childHit.item.parent, parentId); assert.ok(childHit.vertexCount > 0); assert.ok(childHit.min[1] >= parent.p[1] + parent.size[1] * .9);
    env.click(env.hitPoint(childId)); env.redraw(); assert.deepEqual(plain(env.G.runtime.selected), { roomId: ATTIC, uid: childId }); assert.equal(env.observed.length, 0);
  } finally { env.destroy(); }
});

test('真实Pointer承托组跨普通房与阁楼拖动，父子UID/parent守恒且不重扣库存或刷统计', () => {
  const env = setup();
  try {
    const parent = succeeds(env.G.sys.decorating.place('nightstand_basic', env.ordinary, 90, 0, null, .45));
    const child = succeeds(env.G.sys.decorating.place('desk_lamp_basic', env.ordinary, 95, 125, parent.uid));
    const inventory = plain(env.G.state.inventory), stats = plain(env.G.state.quests.stats), sky = plain(env.G.state.observatory);
    env.G.render.setHouseView({ floor: 1, view: 'cutaway', previewFourFloors: false }); env.G.render.camera.focusRoom(env.ordinary); env.redraw();
    for (const [source, target, canonicalX, depth] of [[env.ordinary, ATTIC, 245, .65], [ATTIC, env.ordinary, 220, .3]]) {
      const from = env.hitPoint(parent.uid), logical = env.G.render.camera.screenToWorld(from.x, from.y), desc = env.descriptor(source), current = env.room(source).items.find(item => item.uid === parent.uid), pos = env.G.roomSpace.item(env.room(source), current), grab = env.G.roomSpace.grab(pos, { x: logical.x - desc.x, y: logical.y - desc.y });
      env.event('pointerdown', from, { pointerId: 37 });
      env.G.render.setHouseView({ floor: 'all', view: 'cutaway', previewFourFloors: false }); env.G.render.camera.focusRoom(target); env.redraw();
      const destination = env.groundPoint(target, 'nightstand_basic', canonicalX, depth, grab); assert.ok(Math.hypot(destination.screen.x - from.x, destination.screen.y - from.y) > 5);
      env.event('pointermove', destination.screen, { pointerId: 37 }); env.redraw(); env.event('pointerup', destination.screen, { pointerId: 37 }); env.redraw();
      assert.equal(env.room(source).items.length, 0); const moved = env.room(target).items.find(item => item.uid === parent.uid), movedChild = env.room(target).items.find(item => item.uid === child.uid);
      assert.ok(moved && movedChild); assert.equal(movedChild.parent, parent.uid); near(moved.depth, depth, .001); near(movedChild.x - moved.x, 5, .001);
      assert.equal(env.G.runtime.selected.roomId, target); assert.equal(env.G.runtime.selected.uid, parent.uid); assert.equal(env.ruleCalls.at(-1).name, 'move'); assert.equal(env.ruleCalls.at(-1).args[2], target);
      assert.deepEqual(plain(env.G.state.inventory), inventory); assert.deepEqual(plain(env.G.state.quests.stats), stats); assert.deepEqual(plain(env.G.state.observatory), sky);
    }
    assert.equal(new Set(env.G.store.decorRooms(env.G.state).flatMap(entry => entry[1].items.map(item => item.uid))).size, 2);
  } finally { env.destroy(); }
});

test('固定望远镜仅自身命中可开原观星，家具与空地点击不触发整屋观星或假奖励', () => {
  const env = setup();
  try {
    const parent = succeeds(env.G.sys.decorating.place('nightstand_basic', ATTIC, 70, 0, null, .7)); env.enterAttic(); const before = env.snapshot(), sky = plain(env.G.state.observatory);
    env.click(env.hitPoint(parent.uid)); env.redraw(); assert.equal(env.G.runtime.selected.uid, parent.uid); assert.equal(env.itemEvents.at(-1).roomId, ATTIC); assert.equal(env.observed.length, 0); env.unchanged(before);
    const blank = env.groundPoint(ATTIC, 'potted_plant_basic', 245, .85); env.click(blank.screen); env.redraw(); assert.equal(env.roomEvents.at(-1).roomId, ATTIC); assert.equal(env.observed.length, 0); env.unchanged(before);
    const hit = env.world.hits.find(value => value.kind === 'attic' && value.fixed === true); assert.ok(hit, '望远镜必须有独立fixed命中盒'); assert.equal(hit.uid, undefined); assert.equal(env.room().items.length, 1);
    const screen = env.projected([hit.p[0], hit.p[1] + hit.size[1] * .5, hit.p[2]]); assert.equal(env.world.pick(screen.x, screen.y)?.fixed, true);
    const furniture = plain(env.room().items), inventory = plain(env.G.state.inventory), moveRemoveCount = () => env.ruleCalls.filter(call => ['move', 'remove'].includes(call.name)).length, callsBeforeDrag = moveRemoveCount();
    const from = env.hitPoint(parent.uid); assert.ok(Math.hypot(screen.x - from.x, screen.y - from.y) > 5);
    env.event('pointerdown', from, { pointerId: 51 }); env.event('pointermove', screen, { pointerId: 51 }); env.redraw();
    const fixedTarget = env.G.render.camera.screenToWorld(screen.x, screen.y); assert.equal(fixedTarget.target?.fixed, true); assert.ok(Number.isNaN(fixedTarget.x) && Number.isNaN(fixedTarget.y), '拖放不能把固定望远镜反算并clamp到布置平面');
    env.event('pointerup', screen, { pointerId: 51 }); env.redraw(); env.unchanged(before); assert.equal(moveRemoveCount(), callsBeforeDrag, '固定区域拒绝拖放，也不能把原家具当成拖出房间而收起');
    assert.deepEqual(plain(env.room().items), furniture); assert.deepEqual(plain(env.G.state.inventory), inventory); assert.equal(env.room().items[0].uid, parent.uid); assert.equal(env.observed.length, 0);
    assert.equal(env.world.pick(screen.x, screen.y)?.fixed, true); env.click(screen); env.redraw(); assert.equal(env.observed.length, 1); env.unchanged(before); assert.deepEqual(plain(env.G.state.observatory), sky);
    succeeds(env.G.sys.observatory.observe()); assert.equal(env.G.state.observatory.fragments, sky.fragments + 3); assert.equal(env.G.state.observatory.observations, sky.observations + 1); assert.equal(env.G.sys.observatory.observe().ok, false, '旧观星每日门禁仍由真实系统控制');
  } finally { env.destroy(); }
});

test('阁楼取消/旧HTMLdrop/交错旧pointer与拒写均不偷提交，真实重选后只放一次', () => {
  const env = setup();
  try {
    env.begin('potted_plant_basic'); let control = env.groundPoint(ATTIC, 'potted_plant_basic'), oldTransfer = env.transfer('potted_plant_basic');
    env.event('dragover', control.screen, { dataTransfer: oldTransfer }); env.event('pointerdown', control.screen, { pointerId: 101 }); env.G.render.cancelPlacement(); env.redraw(); const cancelled = env.snapshot();
    assert.equal(env.G.runtime.placing, null); assert.equal(env.G.runtime.selected, null); assert.equal(env.main.captured.size, 0); assert.equal(env.main.style.cursor, 'grab'); env.event('pointerup', control.screen, { pointerId: 101 }); env.event('drop', control.screen, { dataTransfer: oldTransfer }); env.unchanged(cancelled);
    env.begin('potted_plant_basic'); control = env.groundPoint(ATTIC, 'potted_plant_basic', 210, .5); env.event('pointerdown', control.screen, { pointerId: 202 }); const active = env.snapshot();
    env.event('pointerup', control.screen, { pointerId: 101 }); env.unchanged(active); assert.equal(env.main.captured.has(202), true); assert.equal(env.G.runtime.placing, 'potted_plant_basic'); env.event('pointerup', control.screen, { pointerId: 202 }); env.redraw(); assert.equal(env.placed.length, active.placed + 1);
    env.begin('frame_basic'); const wall = env.wallPoint(ATTIC, 'frame_basic', 80, 78), before = env.snapshot(); env.reject(true); env.click(wall.screen); env.redraw(); env.unchanged(before); assert.equal(env.G.runtime.placing, 'frame_basic'); assert.ok(env.messages.length); env.G.render.cancelPlacement(); env.redraw(); env.reject(false);
    env.begin('frame_basic'); const retry = env.wallPoint(ATTIC, 'frame_basic', 80, 78); env.click(retry.screen); env.redraw(); assert.equal(env.room().items.filter(item => item.defId === 'frame_basic').length, 1);
    env.begin('potted_plant_basic'); const stale = env.groundPoint(ATTIC, 'potted_plant_basic').screen; env.event('pointerdown', stale, { pointerId: 303 }); const replacement = plain(env.G.state); replacement.house.attic = null; env.G.store.replace(replacement); env.redraw();
    assert.equal(env.G.runtime.placing, null); assert.equal(env.G.runtime.activeRoomId, null); const replaced = env.snapshot(); env.event('pointerup', stale, { pointerId: 303 }); assert.equal(env.G.render.beginPlacement('potted_plant_basic', ATTIC).ok, false); env.unchanged(replaced);
  } finally { env.reject(false); env.destroy(); }
});

test('house/attic-room/view摄影含真实阁楼家具，成功与异常均还原镜头/命中且不拍展示或园区', () => {
  const env = setup();
  try {
    const item = succeeds(env.G.sys.decorating.place('nightstand_basic', ATTIC, 70, 0, null, .7)); env.enterAttic(); env.G.render.camera.rotate(90, -20); env.G.render.camera.pan(24, -12); env.G.render.camera.zoom(1.12); env.redraw();
    const before = env.cameraSnapshot(), state = env.snapshot();
    for (const scope of ['house', 'room', 'view']) {
      const photo = env.G.render.captureScene({ scope, roomId: ATTIC, width: 640, height: 480, hidePlayer: true }), last = env.renders.filter(value => value.photo).at(-1);
      assert.equal(photo.width, 640); assert.equal(photo.height, 480); assert.equal(last.gardenPage, null); assert.equal(last.stage, null); assert.ok(last.uids.includes(item.uid)); assert.ok(last.vertices > 0);
      if (scope === 'room') { assert.equal(last.roomOnly, ATTIC); assert.equal(last.view.floor, 'attic'); assert.ok(last.roomIds.every(id => id === ATTIC)); }
      assert.deepEqual(env.cameraSnapshot(), before); env.unchanged(state); assert.equal(env.world.hits.find(hit => hit.uid === item.uid)?.roomId, ATTIC);
    }
    env.failPhoto(); assert.throws(() => env.G.render.captureScene({ scope: 'room', roomId: ATTIC, width: 640, height: 480 }), /合成拍照失败/); assert.deepEqual(env.cameraSnapshot(), before); env.unchanged(state);
    env.G.runtime.shellLayout.panelKind = 'garden'; env.redraw(); assert.equal(env.G.render.rendererStatus().gardenPage, 'garden'); const gardenView = plain(env.world.getGardenView());
    const photo = env.G.render.captureScene({ scope: 'room', roomId: ATTIC, width: 640, height: 480 }), shot = env.renders.filter(value => value.photo).at(-1); assert.ok(photo); assert.equal(shot.gardenPage, null); assert.equal(shot.roomOnly, ATTIC); assert.ok(shot.uids.includes(item.uid)); assert.equal(env.world.env.gardenPage?.id, 'garden'); assert.deepEqual(plain(env.world.getGardenView()), gardenView);
  } finally { env.destroy(); }
});

test('Canvas明确降级仍绘制真实阁楼UID/parent家具，attic-room照片复用同一批实物', () => {
  const env = setup({ fallback: true });
  try {
    const parent = succeeds(env.G.sys.decorating.place('nightstand_basic', ATTIC, 80, 0, null, .35)), child = succeeds(env.G.sys.decorating.place('desk_lamp_basic', ATTIC, 85, 125, parent.uid));
    env.G.render.setHouseView({ floor: 'attic', view: 'cutaway', previewFourFloors: false }); env.G.render.camera.focusRoom(ATTIC); env.redraw();
    assert.equal(env.G.render.rendererStatus().renderer, 'canvas-fallback'); const main = env.fallbackDraws.filter(value => value.canvas === env.main); assert.ok(main.some(value => value.uid === parent.uid)); assert.ok(main.some(value => value.uid === child.uid && value.item.parent === parent.uid));
    const before = env.snapshot(), photo = env.G.render.captureScene({ scope: 'room', roomId: ATTIC, width: 640, height: 480 }); assert.ok(env.fallbackDraws.some(value => value.canvas === photo && value.uid === parent.uid)); assert.ok(env.fallbackDraws.some(value => value.canvas === photo && value.uid === child.uid)); env.unchanged(before);
    const desc = env.G.render.layout.atticRoom(), pos = env.G.roomSpace.item(env.room(), env.room().items.find(item => item.uid === child.uid)), screen = env.G.render.camera.worldToScreen(desc.x + pos.x + pos.w / 2, desc.y + pos.y + pos.h / 2); env.click(screen); env.redraw(); assert.equal(env.G.runtime.selected?.uid, child.uid); assert.equal(env.observed.length, 0);
  } finally { env.destroy(); }
});

function meshVertices(world) { const values = []; for (let i = 0; i < world.staticCount * 9; i += 9) values.push({ p: Array.from(world.vertices.slice(i, i + 3)), n: Array.from(world.vertices.slice(i + 3, i + 6)) }); return values; }
function span(values, axis) { return Math.max(...values.map(value => value.p[axis])) - Math.min(...values.map(value => value.p[axis])); }
test('阁楼360有真实地板/背侧墙与外观前墙，普通房与独立garden页面仍走原空间', () => {
  const env = setup();
  try {
    env.enterAttic(); const desc = env.descriptor(), frame = env.world.spaceFrame(desc), before = env.snapshot();
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      env.G.render.camera.rotate((env.world.angle - angle) / .007, 0); env.G.render.camera.fit(); env.redraw(); near(Math.sin(env.world.angle), Math.sin(angle)); finite([...env.world.matrix, ...env.world.eye]);
      env.projected([frame.x, frame.y + 1, 0]); const values = meshVertices(env.world), nearRoom = value => value.p[0] >= frame.x - 1.75 && value.p[0] <= frame.x + 1.75 && value.p[1] >= frame.y - .2 && value.p[1] <= frame.y + 2.3;
      const floor = values.filter(value => nearRoom(value) && value.n[1] > .45 && value.p[1] <= frame.y + .16 && value.p[2] >= -1.5 && value.p[2] <= 1.65);
      assert.ok(floor.length > 12); assert.ok(span(floor, 0) > 3); assert.ok(span(floor, 2) > 2.5);
      const back = values.filter(value => nearRoom(value) && Math.abs(value.n[2]) > .45 && Math.abs(value.p[2] - frame.backZ) < .3 && value.p[1] > frame.y + .2); assert.ok(back.length > 12); assert.ok(span(back, 0) > 3); assert.ok(span(back, 1) > 1.5);
      for (const sign of [-1, 1]) { const side = values.filter(value => nearRoom(value) && Math.abs(value.n[0]) > .45 && sign * (value.p[0] - frame.x) > 1.45 && value.p[1] > frame.y + .2); assert.ok(side.length > 12); assert.ok(span(side, 1) > 1.5); assert.ok(span(side, 2) > 2.3); }
    }
    env.G.render.setHouseView({ floor: 'attic', view: 'exterior', previewFourFloors: false }); env.redraw(); const front = meshVertices(env.world).filter(value => Math.abs(value.n[2]) > .45 && value.p[0] >= frame.x - 1.75 && value.p[0] <= frame.x + 1.75 && value.p[2] > 1.25 && value.p[1] >= frame.y + .2 && value.p[1] <= frame.y + 2.3); assert.ok(front.length > 12); assert.ok(span(front, 0) > 3); assert.ok(span(front, 1) > 1.5); env.unchanged(before);
    env.begin('potted_plant_basic', env.ordinary); const ordinary = env.groundPoint(env.ordinary, 'potted_plant_basic', 230, .7); env.click(ordinary.screen); env.redraw(); assert.equal(env.placed.at(-1).roomId, env.ordinary); assert.equal(env.room().items.length, 0);
    env.G.runtime.shellLayout.panelKind = 'garden'; env.redraw(); assert.equal(env.main.dataset.scene, 'garden-page'); assert.equal(env.G.render.rendererStatus().gardenPage, 'garden'); assert.equal(env.world.env.stage, null); assert.equal(env.world.hits.some(hit => hit.room?.id === ATTIC), false);
    const plot = env.world.env.gardenPage.plots[7], point = env.projected([plot.p[0], plot.p[1] + .02, plot.p[2]]); assert.equal(env.world.pick(point.x, point.y)?.index, 7); env.click(point); env.redraw(); assert.equal(env.gardenEvents.at(-1).index, 7);
    env.G.runtime.shellLayout.panelKind = null; env.G.render.camera.resetView(); env.redraw(); assert.equal(env.world.env.gardenPage, null); assert.ok(env.world.hits.some(hit => hit.room?.id === ATTIC));
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组真实阁楼场景/规则/Pointer/摄影与Canvas降级契约通过（内存与有状态GL替身，不能替代浏览器画面验收）。');
