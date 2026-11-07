'use strict';
// MC-076：衣橱专用真实全身网格、转向、离屏复用与生命周期；GL/2D替身不代表像素验收。
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

function eventTarget(object = {}) {
  const listeners = new Map();
  return Object.assign(object, { listeners,
    addEventListener(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); },
    removeEventListener(name, fn) { const set = listeners.get(name); set?.delete(fn); if (!set?.size) listeners.delete(name); },
    dispatch(name) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of Array.from(listeners.get(name) || [])) fn(event); return event; }
  });
}
function setup(options = {}) {
  let contextRequests = 0, rafRequests = 0;
  const internalCanvases = [], instances = [], targets = [];
  function canvas(width = 100, height = 130) {
    const record = { transforms: [], composites: [], clears: [] };
    const value = eventTarget({ width, height, clientWidth: width, clientHeight: height, isConnected: true, style: {}, dataset: {}, gpu: null, record });
    const ctx = { canvas: value,
      setTransform(...args) { assert.equal(args.length, 6); args.forEach(n => assert.ok(Number.isFinite(n))); assert.ok(args[0] > 0 && args[3] > 0, '全身转向不能使用2D负scale镜像'); record.transforms.push(args); },
      clearRect(...args) { record.clears.push(args); },
      drawImage(...args) { record.composites.push(args); }
    };
    value.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
    value.getContext = (kind, settings) => {
      if (kind === '2d') return ctx;
      assert.equal(kind, 'webgl'); contextRequests++; assert.equal(settings.preserveDrawingBuffer, true);
      if (options.webgl === false) return null;
      value.gpu ||= glFixture(); return value.gpu.gl;
    };
    return value;
  }
  const document = eventTarget({ hidden: false, createElement(tag) { assert.equal(tag, 'canvas'); const value = canvas(); internalCanvases.push(value); return value; } });
  const context = vm.createContext({ console, document,
    requestAnimationFrame() { rafRequests++; throw new Error('衣橱静态预览不能启动RAF循环'); },
    cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}
  });
  context.window = context; context.devicePixelRatio = 3;
  const files = ['js/core/namespace.js', 'js/data/outfits.js', 'js/render/world3d-models.js', 'js/render/world3d.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game, NativeWorld = G.World3D;
  G.World3D = class ObservedWorld extends NativeWorld { constructor(...args) { super(...args); instances.push(this); } };
  G.state = { house: { floors: [{ slots: [null, null, null] }], rooms: {}, yard: { items: [] } }, avatar: G.data.defaultAvatar() };
  G.render = { camera: { x: 241, y: -117, scale: .73 } }; G.runtime.houseView = { floor: 2, view: 'exterior', previewFourFloors: true };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/render/world3d-avatar.js'), 'utf8'), context, { filename: 'js/render/world3d-avatar.js' });
  function target(width, height) { const value = canvas(width, height); targets.push(value); return value; }
  function world() { assert.equal(instances.length, 1, '所有衣橱预览必须共用同一个长期WebGL场景'); return instances[0]; }
  function vertices() { return Array.from(world().vertices); }
  function frame() { return { state: JSON.stringify(G.state), camera: JSON.stringify(G.render.camera), houseView: JSON.stringify(G.runtime.houseView) }; }
  function unchanged(before) { assert.deepEqual(frame(), before, '人物预览不能影响真实状态、主场景相机或楼层视图'); }
  function destroy() { G.avatar3D.destroy(); assert.equal(rafRequests, 0); }
  return { G, document, internalCanvases, instances, targets, target, world, vertices, frame, unchanged, destroy, contexts: () => contextRequests, rafs: () => rafRequests };
}
function near(actual, expected, epsilon = .000002) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function rotated(before, after, yaw) {
  assert.equal(after.length, before.length); const c = Math.cos(yaw), s = Math.sin(yaw), changed = { feet: 0, torso: 0, head: 0 };
  for (let i = 0; i < before.length; i += 9) {
    near(after[i], c * before[i] + s * before[i + 2]); near(after[i + 1], before[i + 1]); near(after[i + 2], -s * before[i] + c * before[i + 2]);
    near(after[i + 3], c * before[i + 3] + s * before[i + 5]); near(after[i + 4], before[i + 4]); near(after[i + 5], -s * before[i + 3] + c * before[i + 5]);
    for (let k = 6; k < 9; k++) assert.equal(after[i + k], before[i + k], '转向不能改变真实衣物、发色和肤色');
    if (Math.abs(after[i] - before[i]) + Math.abs(after[i + 2] - before[i + 2]) > .0001) {
      const y = before[i + 1]; if (y < .27) changed.feet++; else if (y >= .38 && y < .88) changed.torso++; else if (y > 1) changed.head++;
    }
  }
  for (const part of Object.keys(changed)) assert.ok(changed[part] > 20, part + ' 的实际3D顶点应随整身转向，不能只转配饰或局部头部');
}
function hasColor(data, hex) {
  const expected = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  for (let i = 6; i < data.length; i += 9) if (expected.every((value, k) => Math.abs(value - data[i + k]) < .000001)) return true;
  return false;
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('默认正面，显式yaw统一旋转真实头部、躯干、手脚、衣服和法线，主镜头与状态保持独立', () => {
  const env = setup();
  try {
    const target = env.target(120, 180), look = env.G.data.avatarPresetLook('preset_sunny'), before = env.frame();
    assert.equal(env.G.avatar3D.draw(target, look), true); near(Number(target.dataset.avatarYaw), 0); const front = env.vertices();
    assert.equal(env.G.avatar3D.draw(target, look, { yaw: .61, facing: -1, still: true }), true); const turned = env.vertices();
    rotated(front, turned, .61); assert.equal(env.contexts(), 1); assert.equal(target.dataset.avatarRenderer, 'webgl');
    assert.equal(target.width, 180); assert.equal(target.height, 270); assert.ok(target.record.clears.length >= 2, '透明预览每次先清理目标旧像素');
    const world = env.world(); assert.ok(world.env.stage.bounds.min[1] < .03 && world.env.stage.bounds.max[1] > 1.5, '全身构图包含鞋底和完整头发');
    for (const x of [world.env.stage.bounds.min[0], world.env.stage.bounds.max[0]]) for (const y of [world.env.stage.bounds.min[1], world.env.stage.bounds.max[1]]) for (const z of [world.env.stage.bounds.min[2], world.env.stage.bounds.max[2]]) {
      const point = world.project([x, y, z]); assert.ok(point.x > 0 && point.x < 120 && point.y > 0 && point.y < 180, '完整人物边界应落入画布，不裁头或鞋');
    }
    env.unchanged(before);
  } finally { env.destroy(); }
});

test('facing左右映射±45度，真实身体旋转90度且没有任何Canvas镜像', () => {
  const env = setup();
  try {
    const target = env.target(120, 180), look = env.G.data.avatarPresetLook('preset_pony');
    assert.equal(env.G.avatar3D.draw(target, look, { facing: -1 }), true); near(Number(target.dataset.avatarYaw), -Math.PI / 4); const left = env.vertices();
    assert.equal(env.G.avatar3D.draw(target, look, { facing: 1 }), true); near(Number(target.dataset.avatarYaw), Math.PI / 4); rotated(left, env.vertices(), Math.PI / 2);
    assert.equal(env.G.avatar3D.draw(target, look, { yaw: 0, facing: -1 }), true); near(Number(target.dataset.avatarYaw), 0, .00000001);
    assert.ok(target.record.transforms.every(matrix => matrix[0] > 0 && matrix[3] > 0)); assert.equal(env.rafs(), 0);
  } finally { env.destroy(); }
});

test('人物网格读取当前正式暖黄肤色和实际衣服颜色，同ID元数据变更不会命中旧颜色缓存', () => {
  const env = setup();
  try {
    const target = env.target(120, 180), look = env.G.data.avatarPresetLook('preset_braid');
    look.top = 'top_sailor'; look.bottom = 'bottom_denim'; look.dress = null; look.shoes = 'shoes_sneaker';
    const before = env.frame(); assert.equal(env.G.avatar3D.draw(target, look, { yaw: 0 }), true);
    const skin = env.G.data.avatarSkins.find(row => row.id === look.skin), vertices = env.vertices();
    assert.ok(hasColor(vertices, skin.color)); assert.ok(hasColor(vertices, env.G.data.outfitById[look.top].color)); assert.ok(hasColor(vertices, env.G.data.outfitById[look.bottom].color)); assert.ok(hasColor(vertices, env.G.data.outfitById[look.shoes].color));
    skin.color = '#EEE0B0'; assert.equal(env.G.avatar3D.draw(target, look, { yaw: 0 }), true); assert.ok(hasColor(env.vertices(), skin.color));
    env.unchanged(before);
  } finally { env.destroy(); }
});

test('多个卡片与尺寸复用唯一GL、重复图片命中缓存，缓存数量和像素总量有界', () => {
  const env = setup();
  try {
    const look = env.G.data.avatarPresetLook('preset_sunny'), one = env.target(100, 130), two = env.target(100, 130);
    assert.equal(env.G.avatar3D.draw(one, look), true); const world = env.world(), renders = env.G.avatar3D.status().renders, uploads = env.internalCanvases.find(canvas => canvas.gpu).gpu.record.uploads.length;
    assert.equal(env.G.avatar3D.draw(two, look), true); assert.equal(env.G.avatar3D.status().renders, renders, '同look/yaw/尺寸直接复用真实GL位图');
    assert.equal(env.G.avatar3D.draw(env.target(150, 180), look), true); assert.equal(env.internalCanvases.find(canvas => canvas.gpu).gpu.record.uploads.length, uploads, '仅尺寸变化不能重建同一人物几何');
    for (let i = 0; i < 28; i++) { const preset = env.G.data.avatarPresets[i % env.G.data.avatarPresets.length], avatar = env.G.data.avatarPresetLook(preset.id); assert.equal(env.G.avatar3D.draw(env.target(70 + i, 100 + i), avatar, { yaw: i % 3 * .4 }), true); }
    assert.equal(env.G.avatar3D.draw(env.target(1024, 1024), look), true); assert.ok(world.canvas.width * world.canvas.height <= 1002048, '大图也执行约1M像素单帧封顶');
    const status = env.G.avatar3D.status(); assert.equal(env.contexts(), 1); assert.equal(status.contextsCreated, 1); assert.equal(status.activeContexts, 1);
    assert.ok(status.modelCacheEntries <= 6); assert.ok(status.imageCacheEntries <= 20); assert.ok(status.imageCachePixels <= 2000000); assert.ok(status.rememberedTargets <= 24);
    assert.ok(env.targets.every(target => target.record.transforms.every(matrix => matrix[0] <= 1.5 && matrix[3] <= 1.5)), '所有目标DPR上限1.5');
  } finally { env.destroy(); }
});

test('context丢失返回false且不新建GL，恢复后重绘已记住画布并复用原专用context', () => {
  const env = setup();
  try {
    const target = env.target(100, 150), look = env.G.data.avatarPresetLook('preset_curl'); assert.equal(env.G.avatar3D.draw(target, look, { facing: -1 }), true);
    const world = env.world(), lost = world.canvas.dispatch('webglcontextlost'); assert.equal(lost.prevented, true);
    assert.equal(env.G.avatar3D.draw(target, look, { facing: -1 }), false); assert.equal(env.G.avatar3D.status().ready, false); assert.equal(env.G.avatar3D.status().reason, 'context-lost'); assert.equal(env.contexts(), 1);
    const paints = target.record.composites.length; world.canvas.dispatch('webglcontextrestored');
    assert.equal(env.G.avatar3D.status().ready, true); assert.ok(target.record.composites.length > paints, '恢复主动重绘仍连接的预览画布'); assert.equal(env.contexts(), 1); assert.equal(env.instances.length, 1);
  } finally { env.destroy(); }
});

test('后台不做任何GPU绘制，恢复可见后补绘；destroy清理监听、GPU与缓存且幂等', () => {
  const env = setup();
  const look = env.G.data.avatarPresetLook('preset_taro'), target = env.target(110, 150);
  env.document.hidden = true; assert.equal(env.G.avatar3D.draw(target, look), false); assert.equal(env.contexts(), 0); assert.equal(env.G.avatar3D.status().reason, 'background-deferred');
  env.document.hidden = false; env.document.dispatch('visibilitychange'); assert.equal(env.contexts(), 1); assert.ok(target.record.composites.length > 0);
  const gpu = env.internalCanvases.find(canvas => canvas.gpu).gpu, world = env.world(); assert.equal(env.document.listeners.get('visibilitychange').size, 1);
  env.G.avatar3D.destroy();
  const status = env.G.avatar3D.status(); assert.equal(status.ready, false); assert.equal(status.activeContexts, 0); assert.equal(status.reason, 'destroyed');
  assert.equal(status.modelCacheEntries, 0); assert.equal(status.imageCacheEntries, 0); assert.equal(status.imageCachePixels, 0); assert.equal(status.rememberedTargets, 0);
  assert.equal(env.document.listeners.size, 0); assert.equal(world.canvas.listeners.size, 0);
  for (const resources of Object.values(gpu.resources)) assert.equal(resources.size, 0);
  assert.ok(env.internalCanvases.every(canvas => canvas.width === 1 && canvas.height === 1), '所有离屏GL/缓存Canvas均释放像素后备');
  const deleted = gpu.record.deleted.length, lost = gpu.record.lost; env.G.avatar3D.destroy(); assert.equal(gpu.record.deleted.length, deleted); assert.equal(gpu.record.lost, lost); assert.equal(env.rafs(), 0);
});

test('无WebGL明确返回false且多次调用不重复创建context尝试', () => {
  const env = setup({ webgl: false });
  try {
    const look = env.G.data.avatarPresetLook('preset_sunny'), target = env.target(100, 130);
    assert.equal(env.G.avatar3D.draw(target, look), false); assert.equal(env.G.avatar3D.draw(target, look, { facing: -1 }), false); assert.equal(env.contexts(), 1);
    assert.equal(env.G.avatar3D.status().reason, 'webgl-unavailable'); assert.equal(env.G.avatar3D.status().ready, false);
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组真实全身3D人物转向与生命周期检查通过（有状态替身，不代替衣橱浏览器验收）。');
