'use strict';
// MC-076：家园低俯仰、明确复位与实体空房/完整外墙的实际几何契约。
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
  const raf = new Map(), surfaces = [], viewport = options.viewport || DESKTOP;
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
    'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.inventory.frame_basic = 2; });
  G.sys.garden = { capacity: () => 9, status: index => ({ index, crop: null, stage: 0, mature: false }) };
  const first = G.sys.building.buildRoom(0, 0, 'bedroom'), upper = G.sys.building.buildRoom(1, 2, 'living'); assert.ok(first.ok && upper.ok);
  const bed = G.sys.decorating.place('bed_basic', first.roomId, 88, 130, null, .68), frame = G.sys.decorating.place('frame_basic', first.roomId, 200, 40, null); assert.ok(bed.ok && frame.ok);
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast() {}, selection() {}, refresh() {}, open() {} }; G.audio = { play() {} };
  G.runtime.shellLayout = { panelKind: null }; const NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld { constructor(...args) { super(...args); world = this; } };
  G.render.init(main); assert.ok(world.ready);
  function paint() { now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length); batch.forEach(callback => callback(now)); assert.equal(main.dataset.renderer, 'webgl'); }
  function redraw() { G.render.redraw(); paint(); }
  function cpu() {
    const value = Object.create(NativeWorld.prototype);
    Object.assign(value, { ready: true, dirty: false, destroyed: false, angle: .43, elevation: .49, hits: [], actors: [], labels: [], labelHits: [] });
    value.env = Object.assign({}, world.env, { stage: null, roomOnly: first.roomId, camera: { x: -320, y: -124, scale: .8 } }); value.updateCamera(value.env); return value;
  }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); }
  paint(); return { G, world, main, surfaces, viewport, paint, redraw, cpu, destroy, first: first.roomId, upper: upper.roomId, uid: frame.uid, bedUid: bed.uid };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function finite(values, message) { for (const value of values) assert.ok(Number.isFinite(value), message || '数值必须有限'); }
function vector(actual, expected, epsilon) { actual.forEach((value, i) => near(value, expected[i], epsilon)); }
function vertices(world) {
  const output = [];
  for (let i = 0; i < world.staticCount * 9; i += 9) output.push({ p: Array.from(world.vertices.slice(i, i + 3)), n: Array.from(world.vertices.slice(i + 3, i + 6)), c: Array.from(world.vertices.slice(i + 6, i + 9)) });
  return output;
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('家园允许负俯仰仰视并限制到远离极点的上下界，真实投影/射线始终有限', () => {
  const env = setup();
  try {
    const world = env.cpu(); world.rotate(0, -100000); near(world.elevation, -.5); world.rotate(0, 100000); near(world.elevation, 1.05);
    for (const elevation of [-.5, -.25, 0, .49, 1.05]) for (const angle of [-1.08, .43, 1.08]) {
      world.elevation = elevation; world.angle = angle; world.updateCamera(world.env); finite(Array.from(world.matrix)); finite(world.eye); finite(world.right); finite(world.up); finite(world.forward);
      near(Math.hypot(...world.right), 1); near(Math.hypot(...world.up), 1); near(Math.hypot(...world.forward), 1); assert.ok(Math.abs(Math.cos(elevation)) > .4);
      for (const p of [[-3.2, .39, 0], [-3.8, 1.3, -1.25], [-2.8, 2.1, .5]]) {
        const screen = world.project(p), ray = world.ray(screen.x, screen.y); finite([screen.x, screen.y, screen.z, ...ray.origin, ...ray.direction]);
        const t = p.reduce((sum, value, i) => sum + (value - ray.origin[i]) * ray.direction[i], 0); vector(ray.origin.map((value, i) => value + ray.direction[i] * t), p, 3e-5);
      }
    }
  } finally { env.destroy(); }
});

test('负俯仰仍用真实floor/wall平面反算同房间与原局部坐标', () => {
  const env = setup();
  try {
    const room = env.world.env.rooms.find(value => value.id === env.first);
    for (const elevation of [-.45, -.18]) for (const angle of [-.65, .65]) {
      const world = env.cpu(); world.elevation = elevation; world.angle = angle; world.updateCamera(world.env);
      world.hitBox('room', [-3.2, .32, 0], [3.14, 2.05, 2.8], { room, surface: true });
      for (const depth of [.15, .55, .85]) {
        const expected = env.G.roomSpace.foot(145, depth), point = [-3.35, .39, env.G.world3dMath.depthZ(depth)], screen = world.project(point);
        assert.ok(world.containsScreen(screen.x, screen.y)); const hit = world.pick(screen.x, screen.y, 'floor'); assert.equal(hit?.room?.id, env.first);
        near(hit.world.x, room.x + expected.x, .002); near(hit.world.y, room.y + expected.y, .002);
      }
      for (const local of [[90, 36], [210, 85]]) {
        const screen = world.worldToScreen(room.x + local[0], room.y + local[1]); assert.ok(world.containsScreen(screen.x, screen.y));
        const hit = world.pick(screen.x, screen.y, 'wall'); assert.equal(hit?.room?.id, env.first); near(hit.world.x, room.x + local[0], .02); near(hit.world.y, room.y + local[1], .02);
      }
    }
  } finally { env.destroy(); }
});

test('零俯仰及近水平射线不把floor/table/yard的除零Infinity或NaN带入可用命中', () => {
  const env = setup();
  try {
    const placed = env.G.sys.decorating.place('nightstand_basic', env.first, 140, 155, null, .5); assert.ok(placed.ok); env.redraw();
    const room = env.world.env.rooms.find(value => value.id === env.first), parentDef = env.G.data.furnitureById.nightstand_basic, parent = room.data.items.find(item => item.uid === placed.uid); assert.ok(parent);
    for (const elevation of [0, -1e-10, 1e-10]) {
      const world = env.cpu(); world.elevation = elevation; world.angle = .43; world.updateCamera(world.env);
      world.hitBox('room', [-3.2, .32, 0], [3.14, 2.05, 2.8], { room, surface: true });
      world.furniture(new env.G.world3dMath.Geometry(), room, parent, parentDef);
      assert.ok(world.hits.find(hit => hit.uid === parent.uid)?.legacy, '使用真实furniture生产的完整hit，不能手造缺失业务投影的item');
      const samples = [world.project([-3.2, .39, 0]), { x: env.viewport.x + env.viewport.width - 4, y: env.viewport.y + env.viewport.height / 2 }];
      for (const point of samples) for (const mode of [undefined, 'floor', 'table', 'wall', 'ceiling', 'yard']) {
        finite(Array.from(world.matrix)); finite(world.eye); const ray = world.ray(point.x, point.y); finite([...ray.origin, ...ray.direction]);
        const hit = world.pick(point.x, point.y, mode), logical = world.screenToWorld(point.x, point.y, mode);
        if (hit) { assert.ok(hit.world, '有命中时须有有限业务坐标'); finite([hit.world.x, hit.world.y], '平行地面不能提交无限或NaN落点'); if (hit.distance !== undefined) finite([hit.distance]); }
        if (hit) finite([logical.x, logical.y], '真实有效命中必须提供有限业务坐标');
        else { assert.equal(logical.invalidProjection, true); assert.equal(logical.target.kind, 'void'); assert.ok(Number.isNaN(logical.x) && Number.isNaN(logical.y), '无物理交点须保留明确拒绝哨兵，不伪造有限原点'); }
      }
    }
  } finally { env.destroy(); }
});

test('普通fit和resize保留用户旋转，只有公共resetView恢复默认角度与整屋取景', () => {
  for (const viewport of [DESKTOP, MOBILE]) {
    const env = setup({ viewport });
    try {
      const stateBefore = JSON.stringify(env.G.state); env.G.render.camera.rotate(45, -180); env.redraw(); const chosen = { angle: env.world.angle, elevation: env.world.elevation };
      assert.ok(chosen.elevation < 0); env.G.render.camera.fit(); env.redraw(); near(env.world.angle, chosen.angle); near(env.world.elevation, chosen.elevation);
      env.G.render.resize(); env.paint(); near(env.world.angle, chosen.angle); near(env.world.elevation, chosen.elevation);
      env.G.render.setHouseView({ floor: 2, previewFourFloors: true, view: 'exterior' }); env.G.render.camera.focusRoom(env.upper);
      env.G.render.camera.x = 900; env.G.render.camera.y = -900; env.G.render.camera.scale = 2;
      assert.equal(typeof env.G.render.camera.resetView, 'function'); env.G.render.camera.resetView(); env.redraw();
      near(env.world.angle, .43); near(env.world.elevation, .49); assert.equal(env.G.render.getHouseView().floor, 'all'); assert.equal(env.G.render.getHouseView().previewFourFloors, false);
      assert.ok(['cutaway', 'exterior'].includes(env.G.render.getHouseView().view), 'view策略由最终公开接口说明，保持合法值');
      finite([env.G.render.camera.x, env.G.render.camera.y, env.G.render.camera.scale]); assert.ok(env.G.render.camera.scale > 0);
      const count = env.G.state.house.floors.length, top = env.G.world3dMath.floorY(count);
      for (const p of [[-4.85, .15, -1.5], [4.85, .15, 1.5], [-4.9, top, 1.85], [4.9, top, 1.85], [0, top + 1.5, 0], [10, .13, 3.35]]) {
        const screen = env.world.project(p); assert.ok(screen.x >= viewport.x - 1 && screen.x <= viewport.x + viewport.width + 1, 'reset横向包含实际房屋/花园');
        assert.ok(screen.y >= viewport.y - 1 && screen.y <= viewport.y + viewport.height + 1, 'reset纵向包含房屋底部、屋檐和屋脊');
      }
      assert.equal(JSON.stringify(env.G.state), stateBefore, '镜头复位不得修改真实存档');
    } finally { env.destroy(); }
  }
});

test('每个真实空格都有实体背墙与进深侧墙，待建标签真正绘制，且不生成样本房间或库存', () => {
  const env = setup();
  try {
    const before = JSON.stringify(env.G.state), expectedItems = Object.values(env.G.state.house.rooms).flatMap(room => room.items.map(item => item.uid)).sort();
    env.G.render.setHouseView({ floor: 'all', view: 'cutaway', previewFourFloors: false }); env.redraw(); const data = vertices(env.world), emptyRooms = env.world.env.rooms.filter(room => !room.id && room.floorIdx < env.G.state.house.floors.length);
    assert.ok(emptyRooms.length > 0);
    for (const room of emptyRooms) {
      const center = env.G.world3dMath.roomX(room.slotIdx), base = env.G.world3dMath.floorY(room.floorIdx);
      assert.ok(data.some(v => Math.abs(v.p[0] - center) < .8 && v.p[1] > base + .35 && v.p[1] < base + 1.85 && v.p[2] < -1.25 && Math.abs(v.n[2]) > .7), '空格中段须有真正背墙面，不能只留顶梁和柱');
      for (const sign of [-1, 1]) {
        assert.ok(data.some(v => Math.abs(v.p[0] - (center + sign * 1.59)) < .11 && v.p[1] > base + .65 && v.p[1] < base + 1.8 && v.p[2] > -1.15 && v.p[2] < -.3 && Math.abs(v.n[0]) > .7), '空格后半侧墙须具有高度与进深');
        assert.ok(data.some(v => Math.abs(v.p[0] - (center + sign * 1.59)) < .11 && v.p[1] > base + .16 && v.p[1] < base + .65 && v.p[2] > .25 && v.p[2] < 1.2 && Math.abs(v.n[0]) > .7), '空格前缘侧墙须延续进深，不能是后排细柱');
      }
      assert.ok(env.world.labels.some(label => /待建/.test(label.text || '') && Math.abs(label.p[0] - center) < .3 && label.p[1] >= base && label.p[1] <= base + 2.4), '每个空格有对应待建标签');
    }
    assert.ok(env.main.context.record.text.some(args => /待建/.test(String(args[0]))), '待建标签必须真正经过主画布文本绘制');
    assert.deepEqual(Array.from(env.world.hits.filter(hit => hit.kind === 'item'), hit => hit.uid).sort(), expectedItems, 'null omitUid继续保留全部真实家具');
    assert.ok(env.world.hits.some(hit => hit.uid === env.uid)); assert.ok(env.world.hits.some(hit => hit.uid === env.bedUid)); assert.equal(JSON.stringify(env.G.state), before);
  } finally { env.destroy(); }
});

function horizontalCoverage(data, y, wallColor) {
  const segments = [], epsilon = 1e-6;
  for (let i = 0; i < data.length; i += 3) {
    const triangle = data.slice(i, i + 3);
    if (!triangle.every(v => v.p[2] >= 1.25 && v.p[2] <= 1.56 && v.c.every((color, k) => Math.abs(color - wallColor[k]) < 1e-5)) || triangle.reduce((sum, v) => sum + v.n[2], 0) / 3 < .45) continue;
    const xs = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge].p, b = triangle[(edge + 1) % 3].p;
      if (Math.abs(a[1] - y) < epsilon) xs.push(a[0]);
      if ((a[1] < y && b[1] > y) || (a[1] > y && b[1] < y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
    }
    if (xs.length >= 2) segments.push([Math.min(...xs), Math.max(...xs)]);
  }
  segments.sort((a, b) => a[0] - b[0]); const merged = [];
  for (const part of segments) { const previous = merged.at(-1); if (previous && part[0] <= previous[1] + .09) previous[1] = Math.max(previous[1], part[1]); else merged.push(part.slice()); }
  return merged;
}
test('屋外每层三格拥有连续完整前墙的真实三角形覆盖，已建与空格都不漏出洞口', () => {
  const env = setup();
  try {
    const before = JSON.stringify(env.G.state); env.G.render.setHouseView({ floor: 'all', view: 'exterior', previewFourFloors: false }); env.redraw();
    const data = vertices(env.world), hex = env.G.state.house.exterior.wallColor, wallColor = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    for (let floor = 0; floor < env.G.state.house.floors.length; floor++) for (const height of [.5, 1.1, 1.7]) {
      const coverage = horizontalCoverage(data, env.G.world3dMath.floorY(floor) + height, wallColor);
      assert.equal(coverage.length, 1, '前墙三个高度截面须连续覆盖三格，圆角接缝容差不超过.09'); assert.ok(coverage[0][0] < -4.7 && coverage[0][1] > 4.7, '前墙要覆盖所有格位，不能仅包住已建房间');
    }
    assert.equal(env.world.hits.filter(hit => hit.kind === 'item').length, 0, '屋外不保留看不见的室内家具命中'); assert.equal(JSON.stringify(env.G.state), before);
  } finally { env.destroy(); }
});

test('水平射线擦右房后侧AABB时只允许普通后墙选房，floor/table/yard不可旁路伪造落点', () => {
  const env = setup();
  try {
    const room = env.world.env.rooms.find(value => value.id === env.upper), center = env.G.world3dMath.roomX(room.slotIdx), base = env.G.world3dMath.floorY(room.floorIdx), bed = env.G.data.furnitureById.bed_basic;
    const world = env.cpu(); world.env = Object.assign({}, world.env, { rooms: [room], roomOnly: room.id, camera: { x: center * 100, y: -(base + 1) * 100, scale: .8 } });
    world.elevation = 0; world.angle = .43; world.updateCamera(world.env);
    const box = world.hitBox('room', [center, base + .08, 0], [3.14, 2.05, 2.8], { room, surface: true });
    const point = world.project([center + 1.57, base + 1, -1.3]); assert.ok(world.containsScreen(point.x, point.y));
    const ray = world.ray(point.x, point.y), placement = { place: 'floor', def: bed, grab: { u: .5, v: 1 } };
    finite(Array.from(world.matrix)); finite(world.eye); finite([...ray.origin, ...ray.direction]); near(ray.direction[1], 0, 1e-9);
    assert.equal(world.groundAt(ray, room, placement), null, '与地板平行，无真实水平面交点');
    const crossing = env.G.world3dMath.rayBox(ray, box); assert.ok(crossing, '真实包围盒仍然命中，不能用错过房间使测试假通过'); assert.ok(crossing.p[2] <= -1.2, '射线必须覆盖旧后侧fallback的触发区');
    for (const mode of [placement, { place: 'table', def: env.G.data.furnitureById.desk_lamp_basic, grab: { u: .5, v: 1 } }, 'yard']) {
      const hit = world.pick(point.x, point.y, mode); assert.ok(!hit || !hit.room, '放置模式不能从AABB后侧伪造room地板落点');
      const logical = world.screenToWorld(point.x, point.y, mode); assert.equal(logical.invalidProjection, true); assert.equal(logical.target.kind, 'void'); assert.ok(Number.isNaN(logical.x) && Number.isNaN(logical.y));
    }
    const selected = world.pick(point.x, point.y); assert.equal(selected?.kind, 'room'); assert.equal(selected.room.id, env.upper); finite([selected.world.x, selected.world.y], '普通点击后墙仍能选择该真实房间');
    const logical = world.screenToWorld(point.x, point.y); assert.equal(logical.target.room.id, env.upper); finite([logical.x, logical.y]);
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组家园相机/实体空房/完整外墙契约通过（CPU与GL状态替身，不代替浏览器仰视和视觉验收）。');
