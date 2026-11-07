'use strict';
// MC-076：真实节日/加工南瓜灯的beginPlacement、ray拾取、Pointer/HTMLdrop和换档回归。
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
  let now = 0, serial = 0, world = null, writes = 0;
  const raf = new Map(), surfaces = [], placedEvents = [], cancelledEvents = [], placeCalls = [], messages = [], viewport = options.viewport || DESKTOP;
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
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js', 'js/data/calendar.js', 'js/data/crafting.js', 'js/data/observatory.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/systems/yard.js', 'js/systems/crafting.js', 'js/systems/observatory.js', 'js/render/room-space.js',
    'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 18; state.wallet.coin = 100000; state.inventory.frame_basic = 2; state.inventory.festival_pumpkin_lantern = 6; state.inventory.yard_bench = 2; state.garden.harvest.pumpkin = 12; });
  G.sys.garden = { capacity: () => 9, status: index => ({ index, crop: null, stage: 0, mature: false }) };
  const first = G.sys.building.buildRoom(0, 0, 'bedroom'), upper = G.sys.building.buildRoom(1, 2, 'living'); assert.ok(first.ok && upper.ok);
  const bed = G.sys.decorating.place('bed_basic', first.roomId, 88, 130, null, .68), frame = G.sys.decorating.place('frame_basic', first.roomId, 200, 40, null); assert.ok(bed.ok && frame.ok);
  const craftStatus = G.sys.crafting.status('pumpkin_lantern', 6); assert.ok(craftStatus.canCraft); assert.ok(G.sys.crafting.craft('pumpkin_lantern', 6, craftStatus.quote).ok); assert.equal(G.state.inventory.craft_pumpkin_lantern, 6); assert.ok(G.sys.observatory.build().ok);
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast(value) { messages.push(value); }, selection() {}, refresh() {}, open() {} }; G.audio = { play() {} };
  const nativeUpdate = G.store.update, nativePlace = G.sys.decorating.place;
  G.store.update = function (...args) { writes++; return nativeUpdate.apply(this, args); };
  G.sys.decorating.place = function (...args) { placeCalls.push(args); return nativePlace.apply(this, args); };
  G.bus.on('scene:placed', value => placedEvents.push(value)); G.bus.on('placement:cancelled', value => cancelledEvents.push(value));
  G.runtime.shellLayout = { panelKind: null }; const NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld { constructor(...args) { super(...args); world = this; } };
  G.render.init(main); assert.ok(world.ready);
  function paint() { now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length); batch.forEach(callback => callback(now)); assert.equal(main.dataset.renderer, 'webgl'); }
  function redraw() { G.render.redraw(); paint(); }
  function event(name, point, extra) { const e = main.dispatch(name, Object.assign({ clientX: point.x, clientY: point.y }, extra || {})); if (name === 'pointerup' || name === 'pointercancel') main.captured.delete(e.pointerId); return e; }
  function click(point) { event('pointerdown', point); event('pointerup', point); }
  function transfer(defId) { return { dropEffect: 'none', getData(type) { return ['application/x-marshmallow-item', 'application/x-marshmallow-furniture', 'text/plain'].includes(type) ? defId : ''; } }; }
  function groundPoint(roomId, defId, canonicalX = 235, depth = .72) {
    const room = world.env.rooms.find(value => value.id === roomId && value.data); assert.ok(room);
    const p = [G.world3dMath.roomX(room.slotIdx) + (canonicalX - 160) / 100, G.world3dMath.floorY(room.floorIdx) + .15, G.world3dMath.depthZ(depth)], screen = world.project(p), def = G.data.furnitureById[defId];
    assert.ok(world.containsScreen(screen.x, screen.y), '摆放控制点必须实际位于viewport内');
    const picked = world.pick(screen.x, screen.y, { place: def.place, def, grab: { u: .5, v: 1 } }); assert.equal(picked?.room?.id, roomId, '控制点通过真实ray命中房间，不能靠activeRoom补落点');
    return { screen, picked, room, depth };
  }
  function badView(kind) {
    if (kind === '2f') G.render.setHouseView({ floor: 2, view: 'cutaway', previewFourFloors: false });
    if (kind === 'attic') G.render.setHouseView({ floor: 'attic', view: 'cutaway', previewFourFloors: false });
    if (kind === 'exterior') G.render.setHouseView({ floor: 'all', view: 'exterior', previewFourFloors: false });
    if (kind === 'future') G.render.setHouseView({ floor: 4, view: 'cutaway', previewFourFloors: true });
    if (kind === 'back') { G.render.setHouseView({ floor: 1, view: 'cutaway', previewFourFloors: false }); G.render.camera.rotate((world.angle - Math.PI) / .007, (-.4 - world.elevation) / .004); }
    redraw();
  }
  function snapshot() { return { state: JSON.stringify(G.state), writes, placeCalls: placeCalls.length, placedEvents: placedEvents.length }; }
  function assertNoCommit(before) { assert.equal(JSON.stringify(G.state), before.state); assert.equal(writes, before.writes); assert.equal(placeCalls.length, before.placeCalls); assert.equal(placedEvents.length, before.placedEvents); }
  function cpu() {
    const value = Object.create(NativeWorld.prototype);
    Object.assign(value, { ready: true, dirty: false, destroyed: false, angle: .43, elevation: .49, hits: [], actors: [], labels: [], labelHits: [] });
    value.env = Object.assign({}, world.env, { stage: null, roomOnly: first.roomId, camera: { x: -320, y: -124, scale: .8 } }); value.updateCamera(value.env); return value;
  }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); }
  paint(); return { G, world, main, document, surfaces, viewport, placedEvents, cancelledEvents, placeCalls, messages, paint, redraw, event, click, transfer, groundPoint, badView, snapshot, assertNoCommit, cpu, destroy, first: first.roomId, upper: upper.roomId, uid: frame.uid, bedUid: bed.uid };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function finite(values, message) { for (const value of values) assert.ok(Number.isFinite(value), message || '数值必须有限'); }
function vector(actual, expected, epsilon) { actual.forEach((value, i) => near(value, expected[i], epsilon)); }
function vertices(world) {
  const output = [];
  for (let i = 0; i < world.staticCount * 9; i += 9) output.push({ p: Array.from(world.vertices.slice(i, i + 3)), n: Array.from(world.vertices.slice(i + 3, i + 6)), c: Array.from(world.vertices.slice(i + 6, i + 9)) });
  return output;
}

const LANTERNS = ['festival_pumpkin_lantern', 'craft_pumpkin_lantern'];
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('从2F/阁楼/外观/背面/未来预览选择真实南瓜灯，begin只切有效房与镜头不耗库存，Pointer实际放下一次', () => {
  const env = setup();
  try {
    // 原入口只设置placing与focusRoom，没有退出2F；可重放真实过滤失败作为负向控制。
    env.badView('2f'); env.G.runtime.placing = 'festival_pumpkin_lantern'; env.G.render.camera.focusRoom(env.first); env.redraw();
    const oldPoint = env.world.project([env.G.world3dMath.roomX(0) + (235 - 160) / 100, env.G.world3dMath.floorY(0) + .15, env.G.world3dMath.depthZ(.72)]);
    assert.ok(env.world.containsScreen(oldPoint.x, oldPoint.y), '旧入口失败必须发生在可见viewport内，不能靠点到边距假复现');
    assert.equal(env.G.render.getHouseView().floor, 2); assert.notEqual(env.G.render.camera.screenToWorld(oldPoint.x, oldPoint.y).target?.room?.id, env.first, '仅focusRoom不能解除2F对1F真实房间的过滤');
    const oldBefore = env.snapshot(), oldStock = env.G.state.inventory.festival_pumpkin_lantern; env.click(oldPoint); env.assertNoCommit(oldBefore); assert.equal(env.G.state.inventory.festival_pumpkin_lantern, oldStock);
    for (const defId of LANTERNS) for (const [index, view] of ['2f', 'attic', 'exterior', 'back', 'future'].entries()) {
      assert.equal(env.G.data.furnitureById[defId].place, 'floor'); env.badView(view); const before = env.snapshot(), inventory = env.G.state.inventory[defId];
      const begin = env.G.render.beginPlacement(defId, env.first); assert.equal(begin.ok, true, begin.message); assert.equal(begin.roomId, env.first); env.assertNoCommit(before); env.redraw();
      assert.equal(env.G.render.getHouseView().floor, 1); assert.equal(env.G.render.getHouseView().view, 'cutaway'); assert.equal(env.G.render.getHouseView().previewFourFloors, false);
      assert.equal(env.G.runtime.placing, defId); assert.equal(env.G.runtime.mode, 'decorate'); assert.equal(env.G.render.camera.focusKind, 'room'); assert.equal(env.G.render.camera.focusId, env.first);
      const control = env.groundPoint(env.first, defId, 215 + index * 5, .55 + index * .04), count = env.G.state.house.rooms[env.first].items.length;
      env.click(control.screen); env.redraw(); const event = env.placedEvents.at(-1);
      assert.equal(event.roomId, env.first); assert.equal(event.defId, defId); assert.ok(event.result.uid); assert.equal(env.G.state.inventory[defId], inventory - 1);
      assert.equal(env.G.state.house.rooms[env.first].items.length, count + 1); assert.equal(env.placeCalls.length, before.placeCalls + 1); assert.equal(env.snapshot().writes, before.writes + 1);
      const item = env.G.state.house.rooms[env.first].items.find(value => value.uid === event.result.uid); assert.equal(item.defId, defId); near(item.depth, control.depth, .0001); assert.equal(env.G.runtime.placing, null); assert.equal(env.G.runtime.selected.uid, item.uid);
      const committed = env.snapshot(); env.event('pointerup', control.screen); env.assertNoCommit(committed);
    }
  } finally { env.destroy(); }
});

test('同一真实房内同一屏幕坐标，Pointer与HTMLdrop落入同roomId/位置并各只扣一件', () => {
  for (const defId of LANTERNS) {
    const results = [];
    for (const input of ['pointer', 'drop']) {
      const env = setup();
      try {
        env.badView('future'); env.badView('back'); const begin = env.G.render.beginPlacement(defId, env.first); assert.equal(begin.ok, true, begin.message); env.redraw();
        const control = env.groundPoint(env.first, defId), before = env.snapshot(), stock = env.G.state.inventory[defId];
        if (input === 'pointer') env.click(control.screen);
        else { const transfer = env.transfer(defId); env.event('dragover', control.screen, { dataTransfer: transfer }); env.event('drop', control.screen, { dataTransfer: transfer }); }
        env.redraw(); const last = env.placedEvents.at(-1), item = env.G.state.house.rooms[env.first].items.find(value => value.uid === last?.result.uid);
        assert.ok(item); assert.equal(last.roomId, env.first); assert.equal(env.G.state.inventory[defId], stock - 1); assert.equal(env.placeCalls.length, before.placeCalls + 1); assert.equal(env.snapshot().writes, before.writes + 1);
        results.push({ x: control.screen.x, y: control.screen.y, localX: item.x, localY: item.y, depth: item.depth, floor: env.G.state.house.floors.findIndex(floor => floor.slots.includes(last.roomId)) });
      } finally { env.destroy(); }
    }
    for (const key of ['x', 'y', 'localX', 'localY', 'depth', 'floor']) near(results[0][key], results[1][key], .001);
  }
});

test('HTMLdrop以实际payload的floor支撑反算，旧runtime墙饰与无placing直接drop均不能改错房或深度', () => {
  const env = setup();
  try {
    assert.equal(env.G.render.beginPlacement('frame_basic', env.first).ok, true); env.redraw();
    const control = env.groundPoint(env.first, 'craft_pumpkin_lantern'), before = env.snapshot(), stock = env.G.state.inventory.craft_pumpkin_lantern;
    assert.equal(env.G.runtime.placing, 'frame_basic'); const transfer = env.transfer('craft_pumpkin_lantern');
    env.event('drop', control.screen, { dataTransfer: transfer }); env.redraw();
    const placed = env.placedEvents.at(-1), item = env.G.state.house.rooms[env.first].items.find(value => value.uid === placed?.result.uid);
    assert.equal(placed.defId, 'craft_pumpkin_lantern'); assert.equal(placed.roomId, env.first); near(item.depth, control.depth, .0001); assert.equal(env.G.state.inventory.craft_pumpkin_lantern, stock - 1); assert.equal(env.placeCalls.length, before.placeCalls + 1);
    assert.equal(env.G.runtime.placing, null); const direct = env.transfer('festival_pumpkin_lantern'), directControl = env.groundPoint(env.first, 'festival_pumpkin_lantern', 245, .35), directStock = env.G.state.inventory.festival_pumpkin_lantern;
    env.event('drop', directControl.screen, { dataTransfer: direct }); env.redraw(); assert.equal(env.placedEvents.at(-1).roomId, env.first); assert.equal(env.G.state.inventory.festival_pumpkin_lantern, directStock - 1);
  } finally { env.destroy(); }
});

test('库存/真实房间/def校验失败和viewport外落点不耗，显式取消与Escape清预览手势且可重选', () => {
  const env = setup();
  try {
    for (const [defId, roomId] of [['unknown_furniture', env.first], ['__proto__', env.first], ['festival_pumpkin_lantern', 'missing_room'], ['bed_basic', env.first]]) {
      const before = env.snapshot(), result = env.G.render.beginPlacement(defId, roomId); assert.equal(result.ok, false); assert.ok(result.message); env.assertNoCommit(before);
    }
    assert.equal(env.G.render.beginPlacement('festival_pumpkin_lantern', env.first).ok, true); env.redraw(); const before = env.snapshot(), outside = { x: 20, y: 50 };
    env.click(outside); env.assertNoCommit(before); const control = env.groundPoint(env.first, 'festival_pumpkin_lantern'); env.event('pointermove', control.screen); env.redraw(); assert.ok(env.world.env.preview);
    env.event('pointerdown', control.screen); const cancelled = env.cancelledEvents.length; env.G.render.cancelPlacement(); env.redraw();
    assert.equal(env.G.runtime.placing, null); assert.equal(env.G.runtime.mode, 'explore'); assert.equal(env.G.runtime.selected, null); assert.equal(env.world.env.preview || null, null); assert.equal(env.main.style.cursor, 'grab'); assert.equal(env.main.captured.size, 0); assert.ok(env.cancelledEvents.length > cancelled);
    env.event('pointerup', control.screen); env.assertNoCommit(before);
    assert.equal(env.G.render.beginPlacement('craft_pumpkin_lantern', env.first).ok, true); env.document.dispatch('keydown', { key: 'Escape' }); env.redraw(); assert.equal(env.G.runtime.placing, null); assert.equal(env.G.runtime.mode, 'explore'); env.assertNoCommit(before);
    assert.equal(env.G.render.beginPlacement('festival_pumpkin_lantern', env.first).ok, true, '取消后仍可正常重选'); env.G.render.cancelPlacement();
    // 浏览器已提供过dragover的同一DataTransfer，在取消后迟到drop不能重新扣库存。
    assert.equal(env.G.render.beginPlacement('festival_pumpkin_lantern', env.first).ok, true); env.redraw();
    const htmlControl = env.groundPoint(env.first, 'festival_pumpkin_lantern'), oldTransfer = env.transfer('festival_pumpkin_lantern');
    env.event('dragover', htmlControl.screen, { dataTransfer: oldTransfer }); env.G.render.cancelPlacement(); env.redraw(); const afterHtmlCancel = env.snapshot();
    env.event('drop', htmlControl.screen, { dataTransfer: oldTransfer }); env.assertNoCommit(afterHtmlCancel);
    // 旧up与新手势交错：不能消费新drag，也不能释放新pointer的捕获。
    assert.equal(env.G.render.beginPlacement('festival_pumpkin_lantern', env.first).ok, true); env.redraw(); const oldControl = env.groundPoint(env.first, 'festival_pumpkin_lantern');
    env.event('pointerdown', oldControl.screen, { pointerId: 101 }); env.G.render.cancelPlacement();
    assert.equal(env.G.render.beginPlacement('festival_pumpkin_lantern', env.first).ok, true); env.redraw(); const newControl = env.groundPoint(env.first, 'festival_pumpkin_lantern', 245, .4);
    env.event('pointerdown', newControl.screen, { pointerId: 202 }); assert.equal(env.main.captured.has(202), true);
    const beforeOldUp = env.snapshot(), stock = env.G.state.inventory.festival_pumpkin_lantern;
    env.event('pointerup', newControl.screen, { pointerId: 101 }); env.assertNoCommit(beforeOldUp); assert.equal(env.main.captured.has(202), true, '迟到旧up不能clear新capture/drag'); assert.equal(env.G.runtime.placing, 'festival_pumpkin_lantern');
    env.event('pointerup', newControl.screen, { pointerId: 202 }); env.redraw();
    assert.equal(env.placeCalls.length, beforeOldUp.placeCalls + 1); assert.equal(env.snapshot().writes, beforeOldUp.writes + 1); assert.equal(env.placedEvents.length, beforeOldUp.placedEvents + 1); assert.equal(env.placedEvents.at(-1).roomId, env.first); assert.equal(env.G.state.inventory.festival_pumpkin_lantern, stock - 1);
    const committed = env.snapshot(); env.event('pointerup', newControl.screen, { pointerId: 202 }); env.assertNoCommit(committed);
  } finally { env.destroy(); }
});

test('换档取消旧pointer与activeRoom，旧roomId按钮闭包不得回落到新档房间或消耗同名库存', () => {
  const env = setup(), replacement = setup();
  try {
    const oldRoom = env.first, staleButton = () => env.G.render.beginPlacement('festival_pumpkin_lantern', oldRoom);
    assert.equal(staleButton().ok, true); env.redraw(); const point = env.groundPoint(oldRoom, 'festival_pumpkin_lantern').screen; env.event('pointerdown', point);
    const next = JSON.parse(JSON.stringify(replacement.G.state)); assert.equal(Object.hasOwn(next.house.rooms, oldRoom), false); env.G.store.replace(next); env.redraw();
    assert.equal(env.G.runtime.placing, null); assert.equal(env.G.runtime.activeRoomId, null); assert.equal(env.G.runtime.selected, null); assert.equal(env.main.captured.size, 0);
    const before = env.snapshot(); env.event('pointerup', point); env.assertNoCommit(before); const stale = staleButton(); assert.equal(stale.ok, false); env.assertNoCommit(before);
    const fresh = env.G.render.beginPlacement('festival_pumpkin_lantern', replacement.first); assert.equal(fresh.ok, true); env.redraw(); const control = env.groundPoint(replacement.first, 'festival_pumpkin_lantern'); env.click(control.screen); env.redraw();
    assert.equal(env.placedEvents.at(-1).roomId, replacement.first); assert.equal(env.G.state.inventory.festival_pumpkin_lantern, next.inventory.festival_pumpkin_lantern - 1);
  } finally { env.destroy(); replacement.destroy(); }
});

test('原前院Pointer放置路径继续交真实yard规则，房内摆放API不会改变前院库存语义', () => {
  const env = setup();
  try {
    env.G.runtime.placing = 'yard_bench'; env.G.runtime.mode = 'yard'; env.G.render.camera.focusYard(); env.redraw();
    const point = env.G.render.camera.worldToScreen(180, 170); assert.ok(env.world.containsScreen(point.x, point.y)); const before = env.snapshot(), stock = env.G.state.inventory.yard_bench, count = env.G.state.house.yard.items.length;
    env.click(point); env.redraw(); assert.equal(env.G.state.inventory.yard_bench, stock - 1); assert.equal(env.G.state.house.yard.items.length, count + 1); assert.equal(env.G.runtime.selected.yard, true); assert.equal(env.placeCalls.length, before.placeCalls, '前院不能错调用室内decorating.place');
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组真实摆放入口/南瓜灯Pointer与HTMLdrop/取消换档契约通过（内存状态与GL替身，不代替浏览器可见操作验收）。');
