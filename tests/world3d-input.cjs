'use strict';
// MC-076：真实scene输入链与WebGL viewport边界；只使用内存状态、可控RAF和有状态GL替身。
// 不启动服务/浏览器、不访问localStorage；本检查不证明实际像素或设备交互质量。
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
const VIEWPORT = Object.freeze({ x: 100, y: 80, width: 550, height: 450, layout: 'side' });
const CANVAS = Object.freeze({ width: 900, height: 700 }), OUT_X = -40;
function setup(options = {}) {
  let now = 0, serial = 0, instance = null;
  const raf = new Map(), surfaces = [], observed = new Set();
  const stage = events({ width: 900, height: 700, clientWidth: 900, clientHeight: 700, style: {}, dataset: {}, attributes: {}, captured: new Set() });
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700 });
  stage.setAttribute = (name, value) => { stage.attributes[name] = value; };
  stage.setPointerCapture = id => { stage.captured.add(id); };
  stage.hasPointerCapture = id => stage.captured.has(id);
  stage.releasePointerCapture = id => { stage.captured.delete(id); };
  stage.context = context2d(stage);
  stage.getContext = type => { assert.equal(type, '2d', '公开scene仍保留Canvas 2D合成接口'); return stage.context; };
  const document = events({ hidden: false, getElementById: id => id === 'scene' ? stage : null,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const gpu = glFixture(), canvas = events({ width: 0, height: 0, style: {}, dataset: {}, gpu });
      canvas.getContext = (type, settings) => { assert.equal(type, 'webgl'); assert.equal(settings.preserveDrawingBuffer, true); return gpu.gl; };
      surfaces.push(canvas); return canvas;
    }
  });
  const media = events({ matches: true });
  const context = vm.createContext({ console, document,
    performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++serial; raf.set(id, callback); return id; },
    cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    matchMedia: () => media,
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe(canvas) { observed.add(canvas); } disconnect() { observed.clear(); } }
  });
  context.window = context;
  context.innerWidth = 900; context.innerHeight = 700; context.devicePixelRatio = 2;
  events(context);
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/systems/yard.js',
    'js/render/room-space.js', 'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game;
  G.store.init();
  G.store.update(state => { state.level = 11; state.wallet.coin = 100000; state.inventory.frame_basic = 20; state.inventory.yard_bench = 3; state.inventory.yard_path = 20; });
  G.sys.garden = { capacity: () => G.data.gardenConfig.expandedPlots, status: index => ({ index, crop: null, stage: 0, mature: false, locked: false }) };
  const built = G.sys.building.buildRoom(0, 0, 'bedroom'); assert.ok(built.ok, built.message);
  const placed = G.sys.decorating.place('frame_basic', built.roomId, 160, 40, null); assert.ok(placed.ok, placed.message);
  const yard = G.sys.yard.place('yard_bench', 0, 50); assert.ok(yard.ok, yard.message);
  const uiEvents = [], changes = [], calls = { update: 0, place: 0, move: 0, remove: 0, swap: 0, yardPlace: 0, yardMove: 0, yardStroke: 0 };
  G.ui = { sceneViewport: () => Object.assign({}, VIEWPORT), toast() {}, selection() {}, refresh() {}, open() {} };
  G.audio = { play() {} };
  ['scene:item', 'scene:room', 'scene:empty', 'scene:room-layout', 'scene:resident', 'scene:player', 'yard:selected'].forEach(name => G.bus.on(name, payload => uiEvents.push({ name, payload })));
  G.bus.on('state:change', state => changes.push(state));
  function wrap(object, key, counter) { const original = object[key]; assert.equal(typeof original, 'function'); object[key] = function (...args) { calls[counter]++; return original.apply(this, args); }; }
  wrap(G.store, 'update', 'update'); wrap(G.sys.decorating, 'place', 'place'); wrap(G.sys.decorating, 'move', 'move'); wrap(G.sys.decorating, 'remove', 'remove');
  wrap(G.sys.building, 'swapRooms', 'swap'); wrap(G.sys.yard, 'place', 'yardPlace'); wrap(G.sys.yard, 'move', 'yardMove'); wrap(G.sys.yard, 'placeStroke', 'yardStroke');
  const NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld { constructor(...args) { super(...args); instance = this; } };
  G.render.init(stage);
  assert.ok(instance?.ready, '必须真正初始化World3D，不能借2D降级通过输入检查');
  // Lv.11夹具已有上层空格；正向拾取先明确看1F，避免被真实楼板遮挡。
  G.render.setHouseView({ floor: 1 });
  G.render.camera.focusRoom(built.roomId);
  function paint() {
    now += 40; const batch = Array.from(raf.values()); raf.clear();
    assert.ok(batch.length, '必须通过scene已调度的真实RAF绘制');
    batch.forEach(callback => callback(now));
    assert.equal(stage.dataset.renderer, 'webgl', '不能将source错误导致的降级当边界检查通过');
  }
  function redraw() { G.render.redraw(); paint(); }
  function event(name, point, extra) {
    const value = stage.dispatch(name, Object.assign({ clientX: point.x, clientY: point.y }, extra || {}));
    if (name === 'pointerup' || name === 'pointercancel') stage.captured.delete(value.pointerId);
    return value;
  }
  function click(point) { event('pointerdown', point); event('pointerup', point); }
  function frameHit() {
    const saved = G.state.house.rooms[built.roomId]?.items.find(item => item.uid === placed.uid);
    assert.ok(saved, '夹具已通过真实规则保存挂画，UID必须仍在实际房间');
    const renderedRoom = instance.env?.rooms.find(room => room.id === built.roomId);
    assert.ok(renderedRoom?.data?.items.some(item => item.uid === placed.uid), '真实scene环境必须向3D传入已保存的挂画');
    const value = instance.hits.find(hit => hit.uid === placed.uid);
    assert.ok(value, '真实挂画已在state和scene环境中，但3D未建模；omitUid=' + String(instance.env.omitUid) + '，parent=' + String(saved.parent));
    return value;
  }
  function framePoint() { const hit = frameHit(); return instance.project([hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]]); }
  // 3D画布与天空铺满整幅scene：只有画布之外才算“viewport外”，安全区VIEWPORT只决定默认取景。
  function inside(point) { return point.x >= 0 && point.x < CANVAS.width && point.y >= 0 && point.y < CANVAS.height; }
  function assertInsideFrame() { const point = framePoint(); assert.ok(inside(point), '正向控制的挂画必须实际位于viewport内'); const hit = instance.pick(point.x, point.y); assert.equal(hit?.uid, placed.uid, '正向控制必须经过真实ray picking命中挂画'); return point; }
  function aimFrameX(x) {
    // 聚焦整层后适当放大：房屋anchor仍可见，同时真实左格挂画可移入scene边距。
    // 保留新相机限位；不能靠关闭constrain或改变viewport伪造边距命中。
    const camera = G.render.camera; camera.focusFloor(0); redraw(); camera.zoom(2); redraw(); camera.zoom(2); redraw();
    const before = framePoint(); camera.pan(x - before.x, 0); redraw();
    const point = framePoint(); assert.ok(Math.abs(point.x - x) < .001, '按真实投影平移相机，使家具落到目标X');
    const anchor = instance.project(instance.cameraSpec(instance.env).anchor);
    assert.ok(inside(anchor), '挂画移出时房屋整体焦点仍须在真实viewport内');
    return point;
  }
  function snapshot() { return { state: JSON.stringify(G.state), calls: Object.assign({}, calls), events: uiEvents.length, changes: changes.length }; }
  function assertUnchanged(before) {
    assert.equal(JSON.stringify(G.state), before.state, 'viewport外动作不能修改实际Game.state');
    assert.equal(calls.update, before.calls.update, 'viewport外动作不能调用store.update');
    assert.equal(changes.length, before.changes, 'viewport外动作不能发布state:change');
    for (const name of ['place', 'move', 'remove', 'swap', 'yardPlace', 'yardMove', 'yardStroke']) assert.equal(calls[name], before.calls[name], 'viewport外动作不能调用真实规则：' + name);
  }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0, 'destroy移除scene的RAF'); assert.equal(observed.size, 0, 'destroy断开ResizeObserver'); }
  if (!options.beforePaint) { paint(); assertInsideFrame(); }
  return { G, stage, world: instance, surfaces, calls, uiEvents, changes, paint, redraw, event, click, frameHit, framePoint, assertInsideFrame, aimFrameX, inside, snapshot, assertUnchanged, destroy, roomId: built.roomId, uid: placed.uid, yardUid: yard.uid };
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('scene首绘前camera已使用铺满的3D画布：画布外拒绝，安全区只作env.safe，不能回落旧2D坐标', () => {
  const env = setup({ beforePaint: true });
  try {
    const point = env.G.render.camera.screenToWorld(OUT_X, 180);
    assert.equal(point.outsideViewport, true); assert.equal(point.target.kind, 'outside-viewport');
    assert.ok(Number.isNaN(point.x) && Number.isNaN(point.y));
    assert.notEqual(env.G.render.camera.screenToWorld(50, 180).outsideViewport, true, '原安全区边距现在属于画布内，不再被拒绝');
    assert.equal(env.world.env.offsetX, 0); assert.equal(env.world.env.offsetY, 0);
    assert.equal(env.world.env.width, CANVAS.width); assert.equal(env.world.env.height, CANVAS.height);
    assert.equal(JSON.stringify(env.world.env.safe), JSON.stringify({ x: VIEWPORT.x, y: VIEWPORT.y, width: VIEWPORT.width, height: VIEWPORT.height }));
    env.paint(); assert.ok(env.stage.context.record.composites.length > 0, '实际完成WebGL到scene的绘制');
  } finally { env.destroy(); }
});

test('实际frame仍在margin射线下时，点击不选中；内部点击继续返回真实UID', () => {
  const env = setup();
  try {
    const point = env.aimFrameX(OUT_X), before = env.snapshot(), hit = env.frameHit();
    assert.ok(point.x < 0 && point.y >= 0 && point.y < 700, '这是整幅画布之外（左侧），安全区边距不再拒绝输入');
    assert.equal(env.inside(point), false);
    assert.ok(env.G.world3dMath.rayBox(env.world.ray(point.x, point.y), hit), '拒绝不能来自恰巧未打中任何真实家具');
    assert.equal(env.world.pick(point.x, point.y), null);
    env.click(point); assert.equal(env.G.runtime.selected, null); assert.equal(env.uiEvents.length, before.events); env.assertUnchanged(before);
    env.aimFrameX(370); const inside = env.assertInsideFrame(); env.click(inside);
    assert.equal(env.G.runtime.selected?.uid, env.uid); assert.equal(env.G.runtime.selected?.roomId, env.roomId);
    assert.ok(env.uiEvents.some(event => event.name === 'scene:item' && event.payload.uid === env.uid));
    env.assertUnchanged(before);
  } finally { env.destroy(); }
});

test('边距内点击放置与HTML拖放不提交或生成预览，内部HTML drop仍经真实规则放下挂画', () => {
  const env = setup();
  try {
    const outside = env.aimFrameX(OUT_X), before = env.snapshot();
    env.G.runtime.placing = 'frame_basic';
    env.event('pointermove', outside); env.redraw();
    const gpu = env.surfaces[0].gpu;
    assert.equal(gpu.record.draws.filter(draw => draw.buffer === env.world.previewBuffer).length, 0, '被裁掉的边距不能出现3D摆放预览');
    env.click(outside); env.assertUnchanged(before); assert.equal(env.G.runtime.placing, 'frame_basic');
    const transfer = { getData: type => type === 'application/x-marshmallow-item' ? 'frame_basic' : '', dropEffect: 'none' };
    const over = env.event('dragover', outside, { dataTransfer: transfer }); assert.equal(over.prevented, true);
    const drop = env.event('drop', outside, { dataTransfer: transfer }); assert.equal(drop.prevented, true); env.assertUnchanged(before);
    env.G.runtime.placing = null; env.aimFrameX(370); const inside = env.assertInsideFrame();
    const count = env.G.state.house.rooms[env.roomId].items.length;
    env.event('drop', inside, { dataTransfer: transfer });
    assert.equal(env.calls.place, before.calls.place + 1, '内部drop不能被整条禁用');
    assert.equal(env.G.state.house.rooms[env.roomId].items.length, count + 1);
    assert.ok(env.calls.update > before.calls.update);
  } finally { env.destroy(); }
});

test('可见家具拖到viewport外松开只取消，不能move或remove回背包', () => {
  const env = setup();
  try {
    const inside = env.assertInsideFrame(), outside = { x: OUT_X, y: inside.y }, before = env.snapshot();
    env.event('pointerdown', inside);
    env.event('pointermove', outside);
    env.redraw();
    env.event('pointerup', outside);
    env.assertUnchanged(before);
    assert.ok(env.G.state.house.rooms[env.roomId].items.some(item => item.uid === env.uid), '原家具和UID保持在原房间');
    // 取消后能立刻再点原家具，不能残留pointer/drag锁。
    env.redraw(); env.click(env.assertInsideFrame()); assert.equal(env.G.runtime.selected?.uid, env.uid);
  } finally { env.destroy(); }
});

test('可见房间名牌拖出viewport松开不调用swapRooms，内部名牌仍打开换位入口', () => {
  const env = setup();
  try {
    const label = env.world.labelHits.find(hit => hit.kind === 'room-label' && hit.roomId === env.roomId); assert.ok(label);
    const inside = { x: label.screen.x + label.screen.w / 2, y: label.screen.y + label.screen.h / 2 };
    assert.ok(env.inside(inside));
    assert.equal(env.world.pick(inside.x, inside.y)?.kind, 'room-label');
    const before = env.snapshot(), outside = { x: OUT_X, y: inside.y };
    env.event('pointerdown', inside); env.event('pointermove', outside); env.redraw(); env.event('pointerup', outside);
    env.assertUnchanged(before); assert.equal(env.G.state.house.floors[0].slots[0], env.roomId);
    env.redraw();
    const next = env.world.labelHits.find(hit => hit.kind === 'room-label' && hit.roomId === env.roomId);
    env.click({ x: next.screen.x + next.screen.w / 2, y: next.screen.y + next.screen.h / 2 });
    assert.ok(env.uiEvents.some(event => event.name === 'scene:room-layout' && event.payload.roomId === env.roomId));
    env.assertUnchanged(before);
  } finally { env.destroy(); }
});

test('前院真实家具拖出边距不move，连续铺路在边距松开也不提交', () => {
  const env = setup();
  try {
    env.G.render.camera.focusYard(); env.redraw();
    const hit = env.world.hits.find(value => value.uid === env.yardUid); assert.ok(hit);
    const inside = env.world.project([hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]]); assert.ok(env.inside(inside));
    assert.equal(env.world.pick(inside.x, inside.y)?.uid, env.yardUid, '前院正向控制必须命中实际bench');
    env.click(inside); assert.equal(env.G.runtime.selected?.yard, true); assert.equal(env.G.runtime.selected?.uid, env.yardUid);
    const before = env.snapshot(), outside = { x: OUT_X, y: inside.y };
    env.event('pointerdown', inside); env.event('pointermove', outside); env.redraw(); env.event('pointerup', outside); env.assertUnchanged(before);
    env.G.runtime.placing = 'yard_path'; env.G.runtime.selected = null; env.redraw();
    const ground = env.G.render.camera.worldToScreen(180, 190); assert.ok(env.inside(ground));
    const world = env.G.render.camera.screenToWorld(ground.x, ground.y); assert.ok(Number.isFinite(world.x) && Number.isFinite(world.y));
    assert.ok(world.x >= -650 && world.x <= 650 && world.y >= 20 && world.y <= 270, '铺路起点确实处于正式前院范围');
    env.event('pointerdown', ground); env.event('pointermove', { x: ground.x + 18, y: ground.y + 2 }); env.event('pointermove', outside); env.event('pointerup', outside);
    env.assertUnchanged(before);
  } finally { env.destroy(); }
});

test('viewport边距空白默认平移，只有显式orbit转动镜头且都不写入状态', () => {
  const env = setup();
  try {
    const before = env.snapshot(), angle = env.world.angle, pan = Array.from(env.world.panVector || [0, 0, 0]), start = { x: 28, y: 230 }, end = { x: 72, y: 241 };
    assert.equal(env.inside(start), true); assert.equal(env.inside(end), true); assert.ok(start.x < VIEWPORT.x && end.x < VIEWPORT.x, '起止点在原安全区左边距内，现属于铺满的画布');
    assert.equal(env.G.render.camera.getInteractionMode(), 'pan');
    env.event('pointerdown', start); env.event('pointermove', end); env.event('pointerup', end);
    assert.equal(env.world.angle, angle, '默认空白拖动保留用户朝向');
    assert.notDeepEqual(Array.from(env.world.panVector), pan, '拒绝margin放置不能禁掉空白平移交互');
    env.G.render.camera.setInteractionMode('orbit');
    env.event('pointerdown', start); env.event('pointermove', end); env.event('pointerup', end);
    assert.notEqual(env.world.angle, angle, '显式orbit模式继续允许旋转');
    env.assertUnchanged(before);
    assert.ok(Number.isFinite(env.G.render.camera.x) && Number.isFinite(env.G.render.camera.y), '边距NaN标记不能污染camera');
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组真实scene与WebGL viewport输入边界检查通过（有状态替身，不代替实际浏览器验收）。');
