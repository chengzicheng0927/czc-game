'use strict';
// 实际作物绘图与事件连接的轻量DOM契约；不启动浏览器、服务或世界动画。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push({ name, fn });
function setup(options = {}) {
  const documentEvents = new Map(), windowEvents = new Map(), frames = new Map(), timers = new Map(), drawings = [], opened = [];
  let nextId = 1, intervalCalls = 0, reduced = !!options.reduced;
  const on = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const emit = (map, name, event = {}) => (map.get(name) || []).slice().forEach(fn => fn(event));
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.hidden = false; this.dataset = {}; this.attributes = {}; this.events = new Map(); this._text = ''; this.style = { setProperty(name, value) { this[name] = value; } }; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get classList() { const node = this; return { contains(name) { return node.className.split(/\s+/).includes(name); }, toggle(name, force) { const current = this.contains(name), wanted = force === undefined ? !current : force; node.className = node.className.split(/\s+/).filter(value => value && value !== name).concat(wanted ? [name] : []).join(' '); return wanted; } }; }
    append(...nodes) { nodes.forEach(node => { node.remove(); node.parentElement = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; } }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] || null; }
    addEventListener(name, fn) { on(this.events, name, fn); }
    click() { emit(this.events, 'click', { target: this }); }
    matches(selector) {
      if (selector[0] === '.') return this.classList.contains(selector.slice(1));
      if (selector[0] === '#') return this.id === selector.slice(1);
      const attr = /^\[data-garden-plot="(\d+)"\]$/.exec(selector); if (attr) return this.dataset.gardenPlot === attr[1];
      return selector === '*' || this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) { return this.children.flatMap(node => [node, ...node.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
      if (this.box) return this.box;
      let float = this; while (float && !float.classList.contains('harvest-basket-float')) float = float.parentElement;
      if (this.classList.contains('harvest-basket-art')) return float ? { left: Number.parseFloat(float.style.left) + 7, top: Number.parseFloat(float.style.top) + 5, width: 58, height: 55 } : { left: 58, top: 345, width: 58, height: 55 };
      return { left: 0, top: 0, width: 220, height: 66 };
    }
    getContext() {
      if (!this.context) this.context = new Proxy({ clearRect() {} }, { get(target, name) { return name in target ? target[name] : (...args) => { args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), name + '坐标有限'); }); }; } });
      return this.context;
    }
  }
  const document = { hidden: false, body: null, createElement: tag => new Node(tag), addEventListener: (name, fn) => on(documentEvents, name, fn) };
  document.body = new Node('body'); document.querySelectorAll = selector => document.body.querySelectorAll(selector); document.querySelector = selector => document.body.querySelector(selector); document.getElementById = id => document.querySelector('#' + id);
  const node = (tag, id, box) => { const value = new Node(tag); value.id = id; value.box = box; return value; };
  const world = node('main', 'world', { left: 0, top: 100, width: 1000, height: 600 }), scene = node('canvas', 'scene', { left: 0, top: 100, width: 1000, height: 600 });
  const panel = node('section', 'panel', { left: 20, top: 280, width: 960, height: 400 }), body = node('div', 'panel-body', { left: 44, top: 340, width: 910, height: 320 }); panel.className = 'hidden'; panel.dataset.kind = 'garden'; panel.append(body); world.append(scene); document.body.append(world, panel);
  const mediaEvents = new Map(), media = { get matches() { return reduced; }, addEventListener: (name, fn) => on(mediaEvents, name, fn) };
  const G = { data: {}, ui: { open: name => opened.push(name) }, state: { garden: { harvest: { daisy: 3, pumpkin: 2 } } }, render: { harvestOrigin: () => ({ x: 440, y: 520 }) }, store: { update() { throw new Error('动画不得写库存'); } } };
  const context = vm.createContext({ console, document, Game: G, innerWidth: 1000, innerHeight: 800, WeakSet, Map, Promise, setTimeout: (fn, delay) => { const id = nextId++; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval() { intervalCalls++; throw new Error('不得启动持续计时器'); }, requestAnimationFrame: fn => { const id = nextId++; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id) });
  context.window = context; context.addEventListener = (name, fn) => on(windowEvents, name, fn); context.matchMedia = () => media; context.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  ['js/data/garden.js', 'js/core/bus.js', 'js/ui/garden.js'].forEach(load);
  const initialVisibilityListeners = (documentEvents.get('visibilitychange') || []).length;
  const cropDrawing = G.ui.garden.drawCrop; G.ui.garden.drawCrop = (...args) => { drawings.push({ crop: args[1], stage: args[2] }); return cropDrawing(...args); };
  load('js/ui/harvest-feedback.js'); G.ui.harvestFeedback.init();
  function mount() {
    panel.className = ''; const entry = G.ui.harvestFeedback.entry(), plot = node('section', '', { left: 180, top: 420, width: 240, height: 180 }); plot.dataset.gardenPlot = '0';
    const button = node('button', '', { left: 205, top: 550, width: 150, height: 48 }); button.className = 'garden-plot-action'; const canvas = node('canvas', '', { left: 190, top: 422, width: 180, height: 120 }); canvas.className = 'garden-plot-visual'; plot.append(canvas, button); body.replaceChildren(entry, plot); return { entry, plot, button, canvas };
  }
  async function flush() { await Promise.resolve(); await Promise.resolve(); const callbacks = Array.from(frames.values()); frames.clear(); callbacks.forEach(fn => fn(16)); }
  const flightNodes = () => document.querySelectorAll('.harvest-flight');
  return { G, document, documentEvents, windowEvents, frames, timers, drawings, opened, world, scene, panel, body, context, mount, flush, flightNodes, initialVisibilityListeners, intervals: () => intervalCalls, event: (name, value) => G.bus.emit(name, value), domEvent: (name, value) => emit(documentEvents, name, value), windowEvent: (name, value) => emit(windowEvents, name, value), reduce(value) { reduced = value; emit(mediaEvents, 'change', { matches: value }); }, animateEnd(canvas) { emit(canvas.events, 'animationend'); } };
}
const harvested = (crop = 'strawberry', count = 1, index = 0) => ({ index, crop, count });
test('成功事件复用真实成熟作物绘图，数量正文与篮子总库存各自准确，动画不写状态', async () => {
  const env = setup(), { entry } = env.mount(), before = JSON.stringify(env.G.state); env.event('garden:harvested', harvested('pumpkin', 2)); await env.flush();
  assert.equal(env.flightNodes().length, 1); assert.ok(env.drawings.some(value => value.crop === 'pumpkin' && value.stage === 3)); assert.match(entry.textContent, /刚收好 南瓜 ×2/); assert.match(entry.textContent, /篮子里 · 5 份/); assert.equal(JSON.stringify(env.G.state), before);
  const live = env.document.querySelector('.harvest-feedback-live'); assert.match(live.textContent, /南瓜 ×2/); assert.equal(live.getAttribute('aria-live'), 'polite'); assert.equal(env.intervals(), 0); assert.equal(env.frames.size, 0);
});
test('花园面板遮住场景时从可见收获按钮飞向抽屉内小篮子', async () => {
  const env = setup(); env.mount(); env.G.render.harvestOrigin = () => ({ x: 460, y: 580 }); env.event('garden:harvested', harvested()); await env.flush(); const flight = env.flightNodes()[0];
  assert.equal(flight.style['--harvest-from-x'], '248px'); assert.equal(flight.style['--harvest-from-y'], '542px'); assert.equal(flight.style['--harvest-to-x'], '55px'); assert.equal(env.document.querySelector('.harvest-basket-float').hidden, true);
});
test('事件后同次刷新替换DOM、panel:change再绘制仍只飞一次到新篮子', async () => {
  const env = setup(); const old = env.mount().entry; env.event('garden:harvested', harvested('blueberry', 3)); const current = env.mount().entry; env.event('panel:change', { open: true }); await env.flush();
  assert.equal(old.isConnected, false); assert.match(current.textContent, /蓝莓 ×3/); assert.equal(env.flightNodes().length, 1); env.event('state:change', env.G.state); env.event('panel:change', { open: true }); await env.flush(); assert.equal(env.flightNodes().length, 1);
  env.panel.dataset.kind = 'shop'; env.event('panel:change', { open: true }); assert.equal(env.flightNodes().length, 0);
});
test('两帧延迟的同布局panel刷新不会抹掉已起飞的作物或再次播放', async () => {
  const env = setup(); env.mount(); env.event('garden:harvested', harvested('blueberry', 2));
  env.context.requestAnimationFrame(() => { env.mount(); env.context.requestAnimationFrame(() => env.event('panel:change', { open: true })); });
  await env.flush(); const flight = env.flightNodes()[0]; assert.ok(flight); assert.equal(env.frames.size, 1);
  await env.flush(); assert.equal(env.flightNodes().length, 1); assert.equal(env.flightNodes()[0], flight); assert.equal(env.frames.size, 0);
  env.mount(); env.event('panel:change', { open: true }); assert.equal(env.flightNodes()[0], flight); assert.match(env.document.querySelector('.harvest-feedback-live').textContent, /蓝莓 ×2/);
});
test('面板开关、种类或几何确实改变时立即取消在途，同种面板不例外', async () => {
  for (const change of [env => { env.panel.className = 'hidden'; }, env => { env.panel.dataset.kind = 'shop'; }, env => { env.panel.box = Object.assign({}, env.panel.box, { top: env.panel.box.top - 20 }); }]) {
    const env = setup(); env.mount(); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 1); change(env); env.event('panel:change', { open: true }); assert.equal(env.flightNodes().length, 0); assert.equal(env.timers.size, 0);
  }
});
test('面板外框相同但起点、篮子或镜头投影变了也结束旧路径', async () => {
  for (const change of [(env, nodes) => { nodes.button.box.top -= 20; }, (env, nodes) => { nodes.entry.querySelector('.harvest-basket-art').box = { left: 90, top: 345, width: 58, height: 55 }; }]) {
    const env = setup(), nodes = env.mount(); env.event('garden:harvested', harvested()); await env.flush(); change(env, nodes); env.event('panel:change', { open: true }); assert.equal(env.flightNodes().length, 0);
  }
  const env = setup(); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 1); env.event('panel:change', { open: false }); assert.equal(env.flightNodes().length, 1); env.G.render.harvestOrigin = () => ({ x: 490, y: 520 }); env.event('panel:change', { open: false }); assert.equal(env.flightNodes().length, 0);
});
test('场景收获使用视口原点和屏内短暂篮子，点击能打开真实收获篮', async () => {
  const env = setup(); env.event('garden:harvested', harvested('carrot')); await env.flush(); const floating = env.document.querySelector('.harvest-basket-float'), flight = env.flightNodes()[0];
  assert.equal(floating.hidden, false); assert.match(floating.textContent, /胡萝卜 ×1/); assert.equal(flight.style['--harvest-from-x'], '408px'); floating.querySelector('button').click(); assert.deepEqual(env.opened, ['garden']);
  for (const [id, timer] of Array.from(env.timers)) if (timer.delay === 2400) { env.timers.delete(id); timer.fn(); } assert.equal(floating.hidden, true);
});
test('失败、未知作物、无效数量和普通刷新都不触发飞行或播报', async () => {
  const env = setup(); env.mount(); for (const event of [null, harvested('unknown'), harvested('__proto__'), harvested('daisy', 0), harvested('daisy', 1.5), harvested('daisy', 10000), harvested('daisy', 1, -1), Object.assign(harvested(), { ok: false })]) env.event('garden:harvested', event);
  env.event('garden:harvest_failed', harvested()); env.event('state:change', env.G.state); await env.flush(); assert.equal(env.flightNodes().length, 0); assert.equal(env.document.querySelector('.harvest-feedback-live').textContent, '');
});
test('同一事件对象不重复，独立的下一次真实收获仍可播放', async () => {
  const env = setup(), event = harvested(); env.mount(); env.event('garden:harvested', event); env.event('garden:harvested', event); await env.flush(); assert.equal(env.flightNodes().length, 1); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 2);
});
test('快速连续收获队列与在途作物各自最多4个，不补播溢出对象', async () => {
  const env = setup(); env.mount(); for (let i = 0; i < 10; i++) env.event('garden:harvested', harvested(i % 2 ? 'carrot' : 'daisy')); await env.flush(); assert.equal(env.flightNodes().length, 4); assert.equal(env.frames.size, 0);
  for (let i = 0; i < 3; i++) { env.event('garden:harvested', harvested('pumpkin')); await env.flush(); assert.equal(env.flightNodes().length, 4); } assert.ok(env.timers.size <= 4);
});
test('减少动态仅保留真实作物、数量和一次状态正文，没有飞行或持续动画帧', async () => {
  const env = setup({ reduced: true }), { entry } = env.mount(); env.event('garden:harvested', harvested('rainbow_flower', 4)); await env.flush(); assert.equal(env.flightNodes().length, 0); assert.match(entry.textContent, /彩虹花 ×4/); assert.ok(env.drawings.some(value => value.crop === 'rainbow_flower')); assert.match(env.document.querySelector('.harvest-feedback-live').textContent, /彩虹花 ×4/); assert.equal(env.frames.size, 0); assert.equal(env.timers.size, 0);
});
test('后台同时取消待起飞和在途；回到前台不补播', async () => {
  const env = setup(); env.mount(); env.event('garden:harvested', harvested()); env.document.hidden = true; env.domEvent('visibilitychange'); await env.flush(); assert.equal(env.flightNodes().length, 0); assert.equal(env.frames.size, 0); env.document.hidden = false; env.domEvent('visibilitychange'); await env.flush(); assert.equal(env.flightNodes().length, 0);
  env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 1); env.document.hidden = true; env.domEvent('visibilitychange'); assert.equal(env.flightNodes().length, 0); assert.equal(env.timers.size, 0);
});
test('换档清除旧数量、待播、在途与状态正文；普通重绘只同步真实总库存', async () => {
  const env = setup(), { entry } = env.mount(); env.event('garden:harvested', harvested('sakura')); await env.flush(); env.event('garden:harvested', harvested('daisy')); env.G.state.garden.harvest = { blueberry: 7 }; env.event('state:replace', env.G.state); await env.flush();
  assert.equal(env.flightNodes().length, 0); assert.match(entry.textContent, /篮子里 · 7 份/); assert.doesNotMatch(entry.textContent, /刚收好/); assert.equal(env.document.querySelector('.harvest-feedback-live').textContent, ''); assert.equal(env.timers.size, 0);
});
test('resize、pagehide、滚动、镜头指针/滚轮和减少动态变更都清理在途', async () => {
  for (const stop of [env => env.windowEvent('resize'), env => env.windowEvent('pagehide'), env => env.domEvent('scroll'), env => env.domEvent('wheel'), env => env.domEvent('pointerdown', { target: env.scene }), env => env.reduce(true), env => { env.panel.className = 'hidden'; env.event('panel:change', { open: false }); }]) {
    const env = setup(); env.mount(); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 1); stop(env); assert.equal(env.flightNodes().length, 0); assert.equal(env.timers.size, 0);
  }
});
test('起点在屏外、抽屉遮挡或模态前景时不飞；不向隐藏底栏造目标', async () => {
  const env = setup(); env.G.render.harvestOrigin = () => ({ x: 440, y: 900 }); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 0);
  env.panel.className = ''; env.panel.dataset.kind = 'shop'; env.G.render.harvestOrigin = () => ({ x: 440, y: 500 }); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 0);
  const modal = env.document.createElement('div'); modal.className = 'modal-backdrop'; env.document.body.append(modal); env.event('garden:harvested', harvested()); await env.flush(); assert.equal(env.flightNodes().length, 0); assert.equal(env.frames.size, 0);
});
test('动画end或短超时都释放DOM与定时器；重复init不新增监听或层', async () => {
  const env = setup(); env.mount(); env.G.ui.harvestFeedback.init(); env.G.ui.harvestFeedback.init(); assert.equal(env.document.querySelectorAll('.harvest-feedback-layer').length, 1); assert.equal(env.documentEvents.get('visibilitychange').length, env.initialVisibilityListeners + 1);
  env.event('garden:harvested', harvested()); await env.flush(); env.animateEnd(env.flightNodes()[0]); assert.equal(env.flightNodes().length, 0); assert.equal(env.timers.size, 0);
  env.event('garden:harvested', harvested()); await env.flush(); for (const [id, timer] of Array.from(env.timers)) { assert.ok(timer.delay <= 1200); env.timers.delete(id); timer.fn(); } assert.equal(env.flightNodes().length, 0); assert.equal(env.timers.size, 0);
});
test('十二种成熟作物都调用现有绘图；CSS短动画且装饰层不阻挡点击', async () => {
  const env = setup({ reduced: true }); env.mount(); for (const crop of env.G.data.crops) { env.event('garden:harvested', harvested(crop.id)); await env.flush(); } const ids = new Set(env.drawings.map(value => value.crop)); env.G.data.crops.forEach(crop => assert.ok(ids.has(crop.id), crop.id));
  const css = fs.readFileSync(path.join(root, 'css/harvest-feedback.css'), 'utf8'); assert.match(css, /\.harvest-feedback-layer\s*\{[^}]*pointer-events:none/); assert.match(css, /harvest-into-basket\s+\.82s/); assert.match(css, /prefers-reduced-motion:reduce/);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组收获飞入小篮子检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
