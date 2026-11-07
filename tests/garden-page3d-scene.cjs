'use strict';
// MC-080：真实独立花园模块 + 真实scene输入 + 真实花园规则/DOM纸页。
// 内存DOM与有状态GL只替代浏览器；不启动服务/浏览器，不读私人存档。总集串行执行。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
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
function setup(level = 14, viewport = DESKTOP) {
  let clock = new Date(2026, 9, 30, 12).getTime(), now = 0, serial = 0, world = null, writes = 0, failNextPhoto = false;
  const raf = new Map(), intervals = new Map(), canvases = [], dialogs = [], renders = [], plotEvents = [], ruleCalls = [], messages = [];
  let document;
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.attributes = {}; this.dataset = {}; this.style = {}; this.hidden = false; this._text = ''; this.width = 160; this.height = 140; events(this); }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { node.remove(); this.children.push(node); node.parentElement = this; }); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; } }
    contains(node) { while (node) { if (node === this) return true; node = node.parentElement; } return false; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    click() { if (!this.disabled) this.dispatch('click'); }
    get classList() { const self = this, contains = name => self.className.split(/\s+/).includes(name); return { contains, add(name) { if (!contains(name)) self.className += ' ' + name; }, remove(name) { self.className = self.className.split(/\s+/).filter(value => value !== name).join(' '); }, toggle(name, force) { const value = force === undefined ? !contains(name) : !!force; if (value) this.add(name); else this.remove(name); return value; } }; }
    matches(selector) {
      if (selector === '*') return true; const attribute = selector.match(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/), simple = selector.replace(/\[[^\]]+\]/g, '');
      const tag = simple.match(/^[a-z]+/i), id = simple.match(/#([\w-]+)/), classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      if (tag && this.tagName !== tag[0].toUpperCase() || id && this.id !== id[1] || classes.some(name => !this.classList.contains(name))) return false;
      if (attribute) { const name = attribute[1], key = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()) : null, value = key ? this.dataset[key] : this.attributes[name]; if (value === undefined || attribute[2] !== undefined && String(value) !== attribute[2]) return false; } return true;
    }
    querySelectorAll(selector) { const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]); const path = (node, parts) => { if (!node.matches(parts.pop())) return false; while (parts.length) { const next = parts.pop(); node = node.parentElement; while (node && !node.matches(next)) node = node.parentElement; if (!node) return false; } return true; }; return all.filter(node => selector.split(',').some(part => path(node, part.trim().split(/\s+/)))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
    getContext(type, settings) {
      if (type === 'webgl') { this.webglRequested = true; this.gpu ||= glFixture(); assert.equal(settings.preserveDrawingBuffer, true); return this.gpu.gl; }
      assert.equal(type, '2d'); this.context ||= context2d(this);
      if (failNextPhoto) { failNextPhoto = false; this.context.drawImage = () => { throw new Error('garden photo composite failed'); }; }
      return this.context;
    }
  }
  document = events({ hidden: false, activeElement: null, body: null, createElement(tag) { const node = new Node(tag); if (tag === 'canvas') canvases.push(node); return node; } });
  document.body = new Node('body'); document.getElementById = id => document.body.querySelector('#' + id); document.querySelector = selector => document.body.querySelector(selector);
  const main = new Node('canvas'), panel = new Node('section'); main.id = 'scene'; main.width = main.clientWidth = 900; main.height = main.clientHeight = 700; main.captured = new Set(); main.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700 });
  main.setPointerCapture = id => main.captured.add(id); main.hasPointerCapture = id => main.captured.has(id); main.releasePointerCapture = id => main.captured.delete(id); panel.id = 'panel'; panel.className = 'hidden'; document.body.append(main, panel);
  const RealDate = Date; class Clock extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const media = events({ matches: true }), context = vm.createContext({ console, document, Date: Clock, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++serial; raf.set(id, callback); return id; }, cancelAnimationFrame(id) { raf.delete(id); }, setTimeout: () => 1, clearTimeout() {},
    setInterval(callback) { const id = ++serial; intervals.set(id, callback); return id; }, clearInterval(id) { intervals.delete(id); }, matchMedia: () => media, ResizeObserver: class { observe() {} disconnect() {} }
  });
  context.window = context; context.innerWidth = 900; context.innerHeight = 700; context.devicePixelRatio = 1.5; events(context);
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/yard.js',
    'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/systems/garden.js', 'js/systems/time.js',
    'js/render/room-space.js', 'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/garden-page3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = level; state.wallet.coin = 100000; state.inventory.frame_basic = 2; state.garden.seeds = Object.fromEntries(G.data.crops.map(crop => [crop.id, 20])); }); G.sys.garden.init();
  const first = G.sys.building.buildRoom(0, 0, 'bedroom'), upper = G.sys.building.buildRoom(1, 2, 'living'); assert.ok(first.ok && upper.ok); const frame = G.sys.decorating.place('frame_basic', first.roomId, 200, 40, null); assert.ok(frame.ok);
  let currentRoot = null, surface = null;
  function show() { const description = G.ui.garden.panel(); panel.dataset.kind = 'garden'; panel.className = ''; panel.replaceChildren(description.content); currentRoot = description.content; return currentRoot; }
  G.ui = { sceneViewport: () => Object.assign({}, viewport), toast: message => messages.push(message), selection() {}, audio: { play() {} }, controls: {
    label(control, text) { const node = new Node('label'); const copy = new Node('span'); copy.textContent = text; node.append(copy, control); return node; },
    select(items, value, change) { const node = new Node('select'); node.value = value; node.choose = next => { node.value = next; change?.(next); }; return node; }
  }, panel: { close() { panel.className = 'hidden'; } }, modal(options) {
    const overlay = new Node('div'), element = new Node('section'); overlay.className = 'modal-backdrop'; element.append(options.content); overlay.append(element); document.body.append(overlay);
    const handle = { element, close() { if (overlay.isConnected) { overlay.remove(); options.onClose?.(); G.bus.emit('modal:closed', {}); } } }; dialogs.push(handle); return handle;
  }, refresh() { if (surface === 'garden') show(); }, open(kind) {
    surface = kind === 'garden' ? 'garden' : null; G.runtime.shellLayout = { panelKind: surface }; G.runtime.mode = surface ? 'garden' : 'explore'; if (surface) show(); else panel.className = 'hidden'; G.bus.emit('panel:change', { open: !!surface, layout: 'side', height: 0 }); G.render.redraw();
  } };
  G.audio = { play() {} }; G.runtime.shellLayout = { panelKind: null };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/garden.js'), 'utf8'), context, { filename: 'js/ui/garden.js' });
  // 共享ui.js既有的唯一桥接；openPlot本体、DOM与所有规则都加载正式代码。
  G.bus.on('scene:garden', ({ index }) => { plotEvents.push(index); G.ui.garden.openPlot(index); });
  for (const name of ['plant', 'water', 'harvest']) { const original = G.sys.garden[name]; G.sys.garden[name] = function (...args) { ruleCalls.push({ name, args }); return original.apply(this, args); }; }
  const reward = G.sys.economy.reward; G.sys.economy.reward = function (...args) { ruleCalls.push({ name: 'reward', args }); return reward.apply(this, args); };
  const update = G.store.update; G.store.update = function (...args) { writes++; return update.apply(this, args); };
  const NativeWorld = G.World3D; G.World3D = class ObservedWorld extends NativeWorld { constructor(...args) { super(...args); world = this; } render(output, env, settings) { try { return super.render(output, env, settings); } finally { renders.push({ photo: !!settings?.photo, gardenPage: env.gardenPage?.id || null, stage: env.stage?.id || null, roomOnly: env.roomOnly || null, uids: this.hits.filter(hit => hit.kind === 'item').map(hit => hit.uid), output }); } } };
  G.render.init(main); assert.ok(world.ready);
  function paint() { now += 40; const batch = Array.from(raf.values()); raf.clear(); assert.ok(batch.length); batch.forEach(callback => callback(now)); assert.equal(main.dataset.renderer, 'webgl'); }
  function redraw() { G.render.redraw(); paint(); }
  function enter() { G.ui.garden.open(); paint(); assert.equal(world.env.gardenPage?.id, 'garden'); assert.equal(world.env.stage || null, null); }
  function leave() { G.ui.open('home'); paint(); assert.equal(world.env.gardenPage || null, null); }
  function event(name, point, extra) { const e = main.dispatch(name, Object.assign({ clientX: point.x, clientY: point.y }, extra || {})); if (name === 'pointerup' || name === 'pointercancel') main.captured.delete(e.pointerId); return e; }
  function click(point) { event('pointerdown', point); event('pointerup', point); }
  function plotPoint(index, crown = false) { const plot = world.env.gardenPage.plots.find(value => value.index === index); assert.ok(plot); const p = crown ? [plot.p[0], plot.harvestAnchor[1] - .25, plot.p[2]] : [plot.p[0], .33, plot.p[2] - plot.size[2] * .2]; const screen = world.project(p); assert.ok(world.containsScreen(screen.x, screen.y)); assert.equal(world.pick(screen.x, screen.y)?.index, index, '真实soil/crown点不能被其它plot/label偷走index'); return screen; }
  function snapshot() { const c = G.render.camera; return { state: JSON.stringify(G.state), writes, calls: ruleCalls.length, events: plotEvents.length, camera: { x: c.x, y: c.y, scale: c.scale, focusKind: c.focusKind, focusId: c.focusId, focusFloorIndex: c.focusFloorIndex }, angle: world.angle, elevation: world.elevation, pan: Array.from(world.panVector || [0, 0, 0]), target: Array.from(world.target), matrix: Array.from(world.matrix) }; }
  function noAction(before) { assert.equal(JSON.stringify(G.state), before.state); assert.equal(writes, before.writes); assert.equal(ruleCalls.length, before.calls); assert.equal(plotEvents.length, before.events); }
  function framePoint() { const hit = world.hits.find(value => value.uid === frame.uid); assert.ok(hit); return world.project([hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]]); }
  function destroy() { G.render.destroy(); assert.equal(raf.size, 0); }
  paint(); return { G, world, main, panel, document, viewport, dialogs, renders, plotEvents, ruleCalls, messages, canvases, paint, redraw, enter, leave, event, click, plotPoint, snapshot, noAction, framePoint, destroy,
    root: () => currentRoot, advance(ms) { clock += ms; }, now: () => clock, atHour(hour) { const d = new RealDate(clock); clock = new RealDate(d.getFullYear(), d.getMonth(), d.getDate(), hour).getTime(); }, failPhotoOnce() { failNextPhoto = true; }, first: first.roomId, uid: frame.uid };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function vector(actual, expected, epsilon = 1e-6) { actual.forEach((value, i) => near(value, expected[i], epsilon)); }
function restoreHouse(env, expected) { const now = env.snapshot(); assert.deepEqual(now.camera, expected.camera); near(now.angle, expected.angle); near(now.elevation, expected.elevation); vector(now.pan, expected.pan); vector(now.target, expected.target); vector(now.matrix, expected.matrix); }
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('真实6/9园区替换家园而非只读stage，soil点击经scene事件与真实DOM选择同index且不自动播种', () => {
  for (const viewport of [DESKTOP, MOBILE]) for (const [level, count] of [[6, 6], [14, 9]]) {
    const env = setup(level, viewport);
    try {
      env.enter(); assert.equal(env.world.env.gardenPage.plots.length, count); assert.equal(env.world.hits.filter(hit => hit.kind === 'plot').length, count); assert.equal(env.world.hits.some(hit => ['room', 'empty', 'item', 'neighbor'].includes(hit.kind)), false);
      assert.equal(env.canvases.filter(canvas => canvas.webglRequested).length, 1, 'DOM作物图卡不另建GL场景');
      const dom = env.root().querySelectorAll('[data-garden-plot]'); assert.equal(dom.length, count);
      for (let index = 0; index < count; index++) {
        const before = env.snapshot(); env.click(env.plotPoint(index)); env.redraw(); assert.equal(env.plotEvents.at(-1), index); assert.equal(env.G.runtime.gardenVisual.selectedPlot, index); assert.equal(env.ruleCalls.length, before.calls); assert.equal(env.snapshot().writes, before.writes); assert.equal(JSON.stringify(env.G.state), before.state);
        const node = dom.find(value => Number(value.dataset.gardenPlot) === index); node.querySelector('.garden-v2-select').click(); assert.equal(env.G.runtime.gardenVisual.selectedPlot, index); assert.equal(node.querySelector('.garden-v2-select').getAttribute('aria-pressed'), 'true');
        env.dialogs.at(-1).close();
      }
    } finally { env.destroy(); }
  }
});

test('真实成熟樱花树冠在完整hit高范围内，3D冠部点击只收获该index一次', () => {
  const env = setup();
  try {
    assert.ok(env.G.sys.garden.plant(4, 'sakura').ok); env.advance(env.G.data.cropById.sakura.growMs + 1); env.enter();
    const plot = env.world.env.gardenPage.plots[4], hit = env.world.hits.find(value => value.kind === 'plot' && value.index === 4); assert.equal(plot.status.mature, true); assert.ok(hit.max[1] >= plot.harvestAnchor[1]);
    const before = env.G.state.garden.harvest.sakura || 0, calls = env.ruleCalls.length, expectedOrigin = env.world.project(plot.harvestAnchor); let harvestedOrigin = null;
    env.G.bus.on('garden:harvested', event => { if (event.index === 4) harvestedOrigin = env.G.render.harvestOrigin(4); });
    env.click(env.plotPoint(4, true)); env.redraw();
    assert.equal(env.plotEvents.at(-1), 4); assert.equal(env.ruleCalls[calls].name, 'harvest'); assert.equal(env.ruleCalls[calls].args[0], 4); assert.equal(env.G.state.garden.harvest.sakura, before + 1); assert.equal(env.G.state.garden.plots[4], null);
    assert.ok(harvestedOrigin, 'harvested同步监听仍须取得收获前树冠起点'); near(harvestedOrigin.x, expectedOrigin.x, .002); near(harvestedOrigin.y, expectedOrigin.y, .002);
  } finally { env.destroy(); }
});

test('真实DOM星星果图卡保留日间禁种与夜间播种，soil点击仍按原水分规则更新key', () => {
  const env = setup();
  try {
    env.enter(); env.click(env.plotPoint(0)); env.redraw(); const dialog = env.dialogs.at(-1), card = dialog.element.querySelectorAll('.garden-seed-card').find(node => node.dataset.cropId === 'star_fruit'); assert.ok(card); const before = env.snapshot(); card.click(); env.noAction(before);
    const plant = dialog.element.querySelector('[data-ui-focus="garden-seed-plant-dialog-0"]'); assert.ok(plant); assert.equal(plant.textContent, '等待当地夜晚'); assert.equal(plant.disabled, true); plant.click(); env.noAction(before);
    env.atHour(21); env.G.ui.garden.refresh(); assert.equal(plant.textContent, '种下种子'); assert.equal(plant.disabled, false); const stock = env.G.state.garden.seeds.star_fruit, emptyKey = env.world.env.gardenPage.key; plant.click(); env.redraw();
    assert.equal(env.G.state.garden.plots[0].crop, 'star_fruit'); assert.equal(env.G.state.garden.seeds.star_fruit, stock - 1); assert.notEqual(env.world.env.gardenPage.key, emptyKey);
    const plantedKey = env.world.env.gardenPage.key, waterCount = env.ruleCalls.filter(value => value.name === 'water').length; env.click(env.plotPoint(0)); env.redraw();
    assert.equal(env.ruleCalls.filter(value => value.name === 'water').length, waterCount + 1); assert.equal(env.G.sys.garden.status(0).watered, true); assert.notEqual(env.world.env.gardenPage.key, plantedKey);
  } finally { env.destroy(); }
});

test('拖动花圃不会误播种浇水收获，pan/orbit/zoom与viewport边距保持可交互相机', () => {
  for (const viewport of [DESKTOP, MOBILE]) {
    const env = setup(14, viewport);
    try {
      env.enter(); const before = env.snapshot(), point = env.plotPoint(7); env.G.render.camera.setInteractionMode('pan'); let matrix = Array.from(env.world.matrix);
      const labels = env.world.labelHits.filter(hit => hit.kind === 'plot'); assert.equal(labels.length, env.world.env.gardenPage.plots.length, '不能通过删除labelHits修复土面误选');
      for (const label of labels) {
        const center = { x: label.screen.x + label.screen.w / 2, y: label.screen.y + label.screen.h / 2 };
        assert.equal(env.world.pick(center.x, center.y), label, '每个可见label自身中心仍须真正返回该label命中');
      }
      for (const plot of env.world.env.gardenPage.plots) {
        const soil = env.plotPoint(plot.index);
        for (const label of labels.filter(value => value.index !== plot.index)) {
          const s = label.screen; assert.equal(soil.x >= s.x && soil.x <= s.x + s.w && soil.y >= s.y && soil.y <= s.y + s.h, false, '相邻标签绘制/命中矩形不能覆盖其它地块的真实soil控制点');
        }
      }
      env.event('pointerdown', point); env.event('pointermove', { x: point.x + 20, y: point.y + 8 }); env.event('pointerup', { x: point.x + 20, y: point.y + 8 }); env.redraw(); assert.notDeepEqual(Array.from(env.world.matrix), matrix); env.noAction(before);
      env.G.render.camera.setInteractionMode('orbit'); matrix = Array.from(env.world.matrix); env.event('pointerdown', { x: 20, y: 25 }); env.event('pointermove', { x: 48, y: 35 }); env.event('pointerup', { x: 48, y: 35 }); env.redraw(); assert.notDeepEqual(Array.from(env.world.matrix), matrix); env.noAction(before);
      matrix = Array.from(env.world.matrix); env.event('wheel', { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }, { deltaY: -100 }); env.redraw(); assert.notDeepEqual(Array.from(env.world.matrix), matrix);
      // 3D画布铺满整幅scene：原安全区边距(20,25)属于画布内，只有画布之外才算viewport外。
      assert.notEqual(env.G.render.camera.screenToWorld(20, 25).outsideViewport, true);
      const outside = env.G.render.camera.screenToWorld(-20, 25); assert.equal(outside.outsideViewport, true); env.click({ x: -20, y: 25 }); env.noAction(before);
    } finally { env.destroy(); }
  }
});

test('harvestOrigin使用独立园区真实harvestAnchor，普通旧坐标经worldToPage投影', () => {
  const env = setup();
  try {
    assert.ok(env.G.sys.garden.plant(8, 'sakura').ok); env.advance(env.G.data.cropById.sakura.growMs + 1); env.enter(); const page = env.world.env.gardenPage;
    for (const plot of page.plots) {
      const expected = env.world.project(plot.harvestAnchor), origin = env.G.render.harvestOrigin(plot.index); assert.ok(origin); near(origin.x, expected.x, .002); near(origin.y, expected.y, .002);
      const p = page.worldToPage(plot.particleWorld), direct = env.world.project(p), logical = env.G.render.camera.worldToScreen(plot.particleWorld.x, plot.particleWorld.y); near(logical.x, direct.x, .002); near(logical.y, direct.y, .002);
    }
    assert.equal(env.G.render.harvestOrigin(99), null);
  } finally { env.destroy(); }
});

test('独立园区不制造访客或奖励，原15秒访客出现后真实点击只奖一次', () => {
  const env = setup();
  try {
    env.enter(); const stock = env.G.state.wallet.coin; assert.equal(env.world.hits.some(value => value.kind === 'visitor'), false); const before = env.snapshot(); env.redraw(); env.noAction(before); assert.equal(env.G.state.wallet.coin, stock);
    env.advance(16000); env.redraw(); const hit = env.world.hits.find(value => value.kind === 'visitor'); assert.ok(hit, '必须来自scene原访客计时'); const page = env.world.env.gardenPage, desc = page.hits.find(value => value.kind === 'visitor'); assert.ok(desc); near(hit.min[1], desc.p[1]);
    const point = env.world.project([hit.p[0], hit.p[1] + hit.size[1] / 2, hit.p[2]]); assert.equal(env.world.pick(point.x, point.y)?.kind, 'visitor'); env.click(point); env.redraw(); assert.equal(env.G.state.wallet.coin, stock + 5); assert.equal(env.ruleCalls.filter(value => value.name === 'reward').length, 1);
    env.click(point); env.redraw(); assert.equal(env.G.state.wallet.coin, stock + 5); assert.equal(env.ruleCalls.filter(value => value.name === 'reward').length, 1); assert.equal(env.world.hits.some(value => value.kind === 'visitor'), false);
  } finally { env.destroy(); }
});

test('进入退出还原家园camera/pan/target/matrix/angles，独立园区镜头操作不污染家园', () => {
  const env = setup();
  try {
    env.G.render.camera.focusRoom(env.first); env.G.render.camera.rotate(35, -100); env.G.render.camera.pan(14, 8); env.redraw(); const home = env.snapshot(); env.enter();
    env.G.render.camera.setInteractionMode('orbit'); env.event('pointerdown', { x: 20, y: 25 }); env.event('pointermove', { x: 55, y: 39 }); env.event('pointerup', { x: 55, y: 39 }); env.redraw(); env.G.render.camera.pan(18, 10); env.G.render.camera.zoom(1.15); env.redraw();
    assert.deepEqual(env.snapshot().camera, home.camera); near(env.world.angle, home.angle); near(env.world.elevation, home.elevation); vector(Array.from(env.world.panVector), home.pan); env.leave(); restoreHouse(env, home); assert.ok(env.world.hits.some(value => value.uid === env.uid));
  } finally { env.destroy(); }
});

test('garden上house/room/view摄影都拍真实家园，成功或异常finally恢复独立园区', () => {
  const env = setup();
  try {
    env.G.render.camera.focusRoom(env.first); env.redraw(); env.enter(); env.G.render.camera.pan(14, 8); env.G.render.camera.zoom(1.15); env.redraw(); const garden = env.snapshot();
    for (const scope of ['house', 'room', 'view']) {
      const start = env.renders.length, photo = env.G.render.captureScene({ scope, roomId: scope === 'room' ? env.first : undefined, width: 640, height: 480 }), render = env.renders.slice(start).find(value => value.photo);
      assert.ok(render); assert.equal(render.gardenPage, null); assert.equal(render.stage, null); assert.ok(render.uids.includes(env.uid)); assert.ok(photo.context.record.composites.length > 0); assert.equal(env.world.env.gardenPage?.id, 'garden'); restoreHouse(env, garden);
    }
    env.failPhotoOnce(); assert.throws(() => env.G.render.captureScene({ scope: 'room', roomId: env.first, width: 640, height: 480 }), /garden photo composite failed/); assert.equal(env.world.env.gardenPage?.id, 'garden'); restoreHouse(env, garden); env.redraw();
  } finally { env.destroy(); }
});

test('真实摆放及已开始的家具/名牌拖动forceHouse，结束后恢复garden且不破坏pointer/cancel', () => {
  for (const kind of ['placing', 'item', 'room']) {
    const env = setup();
    try {
      env.G.render.setHouseView({ floor: 1 }); env.G.render.camera.focusRoom(env.first); env.redraw();
      if (kind === 'placing') {
        env.enter(); assert.equal(env.main.dataset.scene, 'garden-page'); assert.equal(env.G.runtime.placing, null);
        const visible = env.plotPoint(7), before = env.snapshot(), unarmed = { getData(type) { return ['application/x-marshmallow-item', 'application/x-marshmallow-furniture', 'text/plain'].includes(type) ? 'bed_basic' : ''; }, dropEffect: 'none' };
        env.event('dragover', visible, { dataTransfer: unarmed }); env.event('drop', visible, { dataTransfer: unarmed }); env.redraw();
        env.noAction(before); assert.equal(env.main.dataset.scene, 'garden-page'); assert.equal(env.world.env.gardenPage?.id, 'garden'); assert.equal(env.G.runtime.placing, null, '未armed的HTMLpayload不能把可见园区像素当隐藏家园落点');
        assert.equal(env.G.render.beginPlacement('bed_basic', env.first).ok, true); env.redraw();
      }
      else { let point = env.framePoint(); if (kind === 'room') { const label = env.world.labelHits.find(value => value.kind === 'room-label' && value.roomId === env.first); assert.ok(label); point = { x: label.screen.x + label.screen.w / 2, y: label.screen.y + label.screen.h / 2 }; } env.event('pointerdown', point); env.event('pointermove', { x: point.x + 10, y: point.y + 2 }); env.G.ui.garden.open(); env.paint(); }
      assert.equal(env.world.env.gardenPage || null, null); assert.ok(env.world.hits.some(value => value.kind === 'room'));
      if (kind === 'placing') {
        assert.notEqual(env.main.dataset.scene, 'garden-page'); const room = env.world.env.rooms.find(value => value.id === env.first), def = env.G.data.furnitureById.bed_basic;
        const visible = env.world.project([env.G.world3dMath.roomX(room.slotIdx) + .65, env.G.world3dMath.floorY(room.floorIdx) + .15, env.G.world3dMath.depthZ(.45)]);
        assert.equal(env.world.pick(visible.x, visible.y, { place: 'floor', def, grab: { u: .5, v: 1 } })?.room?.id, env.first, 'begin后drop必须确实点到可见家园房间');
        const stock = env.G.state.inventory.bed_basic, count = env.G.state.house.rooms[env.first].items.length, placed = [];
        env.G.bus.on('scene:placed', event => placed.push(event));
        const armed = { getData(type) { return ['application/x-marshmallow-item', 'application/x-marshmallow-furniture', 'text/plain'].includes(type) ? 'bed_basic' : ''; }, dropEffect: 'none' };
        env.event('dragover', visible, { dataTransfer: armed }); env.event('drop', visible, { dataTransfer: armed }); env.redraw();
        assert.equal(placed.length, 1); assert.equal(placed[0].roomId, env.first); assert.equal(placed[0].defId, 'bed_basic'); assert.equal(env.G.state.inventory.bed_basic, stock - 1); assert.equal(env.G.state.house.rooms[env.first].items.length, count + 1);
      } else { env.event('pointercancel', { x: 350, y: 300 }); env.redraw(); }
      assert.equal(env.world.env.gardenPage?.id, 'garden');
    } finally { env.destroy(); }
  }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组独立gardenPage真实scene/DOM/规则/镜头/摄影契约通过（内存DOM与GL替身，不代替正式页面视觉验收）。');
