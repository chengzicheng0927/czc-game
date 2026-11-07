'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const coreFiles = [
  'js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js',
  'js/data/furniture-expansion.js', 'js/data/residents-expansion.js',
  'js/data/progression.js', 'js/data/achievements.js', 'js/data/audio.js',
  'js/data/minigames.js', 'js/data/garden.js', 'js/data/calendar.js',
  'js/data/outfits.js', 'js/data/yard.js', 'js/data/crafting.js',
  'js/data/house-styles.js', 'js/data/layout-templates.js', 'js/data/exterior.js',
  'js/data/photography.js', 'js/data/creative.js', 'js/data/gifts.js',
  'js/core/utils.js', 'js/core/bus.js', 'js/data/observatory.js',
  'js/data/deals.js', 'js/data/login.js', 'js/core/store.js',
  'js/core/public-house.js', 'js/core/save.js', 'js/systems/systems.js',
  'js/systems/yard.js', 'js/systems/exterior.js', 'js/systems/house-styles.js',
  'js/systems/room-layout.js', 'js/systems/layout-templates.js',
  'js/systems/observatory.js', 'js/render/room-space.js', 'js/render/room-shell.js', 'js/render/polish.js',
  'js/render/sea-map.js', 'js/render/scene.js'
];

function makeCanvas() {
  const ops = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '12px sans-serif',
    globalAlpha: 1, textAlign: 'left', textBaseline: 'alphabetic'
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop === 'measureText') return text => ({ width: String(text || '').length * 8 });
      return (...args) => { ops.push([prop, ...args]); };
    },
    set(target, prop, value) {
      target[prop] = value;
      ops.push(['set:' + prop, value]);
      return true;
    }
  });
  return {
    width: 1280, height: 720, style: {}, ops,
    getContext: () => ctx,
    setAttribute() {},
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };
}

function createEnv() {
  const sceneCanvas = makeCanvas();
  const context = vm.createContext({
    console, Math, Date, Number, String, Boolean, Array, Object, Set, Map, JSON, RegExp,
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    location: { search: '', pathname: '/', protocol: 'http:' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      hidden: false,
      getElementById: id => id === 'scene' ? sceneCanvas : null,
      createElement: () => makeCanvas(),
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => []
    }
  });
  context.window = context;
  context.addEventListener = () => {};
  for (const file of coreFiles) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  const G = context.Game;
  G.store.init();
  G.render.init();
  return { G, sceneCanvas };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('家园与建造多层视角：setHouseView支持整屋/单层/阁楼聚焦、剖面/外观切换与Lv.25第4层预览', () => {
  const { G } = createEnv();
  const initialView = G.render.getHouseView();
  assert.equal(initialView.floor, 'all');
  assert.equal(initialView.view, 'cutaway');
  assert.equal(initialView.previewFourFloors, false);

  G.render.setHouseView({ floor: 2, view: 'exterior', previewFourFloors: true });
  const updated = G.render.getHouseView();
  assert.equal(updated.floor, 2);
  assert.equal(updated.view, 'exterior');
  assert.equal(updated.previewFourFloors, true);

  G.render.setHouseView({ floor: 'attic' });
  assert.equal(G.render.getHouseView().floor, 'attic');
});

test('4层扩建预览与楼层聚焦严守不改写等级与真实存档的不变量', () => {
  const { G } = createEnv();
  const r1 = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
  G.sys.decorating.place('bed_basic', r1, 40, 120);
  const snapshotBefore = JSON.stringify(G.state);

  // 开启 Lv.25 第4层预览并切换各楼层与外观视角并抓图渲染
  G.render.setHouseView({ previewFourFloors: true, floor: 4, view: 'cutaway' });
  G.render.captureScene({ width: 960, height: 640 });
  G.render.setHouseView({ floor: 1, view: 'exterior' });
  G.render.captureScene({ width: 960, height: 640, viewMode: 'exterior', floorFocus: 1 });
  G.render.setHouseView({ floor: 'attic', view: 'cutaway' });
  G.render.captureScene({ width: 960, height: 640, floorFocus: 'attic' });
  G.render.setHouseView({ previewFourFloors: false, floor: 'all', view: 'cutaway' });

  const snapshotAfter = JSON.stringify(G.state);
  assert.equal(snapshotAfter, snapshotBefore, 'Lv.25 4层预览与楼层聚焦不得修改真实等级、楼层、房间或家具存档');
  assert.equal(G.state.level, 1);
  assert.equal(G.state.house.floors.length, 1);
  assert.equal(G.state.house.rooms[r1].items.length, 1);
});

test('小屋外观视角绘制外立面门窗，剖面视角恢复室内渲染', () => {
  const { G } = createEnv();
  G.sys.building.buildRoom(0, 0, 'bedroom');
  const cutawayCanvas = G.render.captureScene({ width: 960, height: 640, viewMode: 'cutaway' });
  const exteriorCanvas = G.render.captureScene({ width: 960, height: 640, viewMode: 'exterior' });
  assert.ok(cutawayCanvas.ops.length > 50);
  assert.ok(exteriorCanvas.ops.length > 50);
  assert.notEqual(
    JSON.stringify(cutawayCanvas.ops),
    JSON.stringify(exteriorCanvas.ops),
    '全屋剖面与小屋外观应渲染不同画面结构'
  );
});

test('云海邻里微缩浮空岛包含泥土底座、青草坪、小树与在线亮灯', () => {
  const { G } = createEnv();
  G.seaMap.setHouses([
    { id: '11111111-1111-4111-8111-111111111111', title: '桃桃云端屋', online: { count: 2, displayNames: ['桃桃', '豆豆'], hostOnline: true } }
  ]);
  const canvas = makeCanvas();
  G.seaMap.draw(canvas.getContext('2d'), { time: 1, scale: 0.5, reducedMotion: true });
  const fills = canvas.ops.filter(op => op[0] === 'set:fillStyle').map(op => op[1]);
  assert.ok(fills.includes('#C79C79'), '应包含微缩浮空岛泥土底座');
  assert.ok(fills.includes('#ADE498'), '应包含微缩浮空岛草坪');
  assert.ok(fills.includes('#77C66E'), '应包含微缩浮空岛小树');
  assert.ok(fills.includes('#FFE9A8'), '在线小屋应点亮暖色窗户');
});

test('建造与装饰面板接入多层导航条、5合一分页（家具/房间/外观/前院/布局）与背包搜索框', () => {
  const { G } = createEnv();
  // 挂载轻量 DOM 以加载 ui/panel.js 与 ui/ui.js
  function domNode(tag) {
    const listeners = {};
    const node = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '', id: '', textContent: '', value: '', type: '', hidden: false,
      dataset: {}, attributes: {}, style: { setProperty() {} }, children: [], parentElement: null,
      classList: {
        add(...tokens) { const set = new Set(node.className.split(/\s+/).filter(Boolean)); tokens.forEach(t => set.add(t)); node.className = [...set].join(' '); },
        remove(...tokens) { const set = new Set(node.className.split(/\s+/).filter(Boolean)); tokens.forEach(t => set.delete(t)); node.className = [...set].join(' '); },
        toggle(token, force) { const set = new Set(node.className.split(/\s+/).filter(Boolean)); const on = force === undefined ? !set.has(token) : !!force; if (on) set.add(token); else set.delete(token); node.className = [...set].join(' '); return on; },
        contains(token) { return node.className.split(/\s+/).filter(Boolean).includes(token); }
      },
      append(...items) { items.flat().filter(Boolean).forEach(child => { if (typeof child === 'object') { child.parentElement = node; node.children.push(child); } }); },
      replaceChildren(...items) { node.children = []; node.append(...items); },
      replaceWith(next) { if (!node.parentElement) return; const idx = node.parentElement.children.indexOf(node); if (idx >= 0) { next.parentElement = node.parentElement; node.parentElement.children[idx] = next; } },
      remove() { if (!node.parentElement) return; node.parentElement.children = node.parentElement.children.filter(c => c !== node); node.parentElement = null; },
      setAttribute(k, v) { node.attributes[k] = String(v); },
      getAttribute(k) { return node.attributes[k]; },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      removeEventListener() {},
      click() { (listeners.click || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {}, target: node })); },
      focus() {},
      contains(target) { return node === target || node.children.some(c => c.contains && c.contains(target)); },
      getClientRects: () => [{ width: 40, height: 24 }],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const out = [];
        const match = el => {
          if (sel.startsWith('.')) return el.classList && el.classList.contains(sel.slice(1));
          if (sel === 'canvas') return el.tagName === 'CANVAS';
          const m = /^\[data-([a-z-]+)="([^"]+)"\]$/.exec(sel);
          if (m) {
            const key = m[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            return el.dataset && el.dataset[key] === m[2];
          }
          return false;
        };
        const walk = cur => { (cur.children || []).forEach(ch => { if (match(ch)) out.push(ch); walk(ch); }); };
        walk(node);
        return out;
      }
    };
    return node;
  }
  const byId = new Map();
  const getById = id => { if (!byId.has(id)) { const n = domNode('div'); n.id = id; byId.set(id, n); } return byId.get(id); };
  G.audio = { init() {}, play() {}, speak: () => ({ ok: true }), stopSpeech() {}, toggleMute() {}, unlock() {} };
  G.ui = {
    controls: {
      label(ctrl, text) { const w = domNode('label'); w.textContent = text; w.append(ctrl); return w; },
      select(opts, val, onChange) { const s = domNode('select'); s.value = val || (opts[0] && opts[0].id) || ''; s.options = opts; s.trigger = v => { s.value = v; if (onChange) onChange(v); }; return s; },
      color(val) { const c = domNode('input'); c.value = val; return c; },
      enhanceRange() {},
      isOpen: () => false,
      isInteracting: () => false
    },
    observatory: { entry: () => domNode('button'), panel: () => ({ title: '天文台', content: domNode('div') }) },
    furnitureRarity: { decorate() {} },
    panel: {
      open(spec) { const body = getById('panel-body'); body.replaceChildren(spec.content); getById('panel').classList.remove('hidden'); },
      close() { getById('panel').classList.add('hidden'); }
    }
  };
  const uiContext = vm.createContext({
    window: { Game: G, addEventListener() {} }, Game: G, console, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: fn => fn(),
    location: { search: '' },
    document: {
      activeElement: domNode('body'),
      body: domNode('body'),
      getElementById: getById,
      createElement: tag => tag === 'canvas' ? Object.assign(domNode('canvas'), makeCanvas()) : domNode(tag),
      addEventListener() {}, removeEventListener() {},
      querySelector: () => null, querySelectorAll: () => []
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/ui.js'), 'utf8'), uiContext, { filename: 'js/ui/ui.js' });

  G.ui.open('build');
  const panelBody = getById('panel-body');
  assert.ok(panelBody.querySelector('.decorate-suite-tabs'), '建造面板应包含5合一切换栏');
  assert.ok(panelBody.querySelector('.house-navigation'), '建造面板应包含多层小屋导航');
  assert.ok(panelBody.querySelector('.house-layout-grid'), '建造面板应包含多层房间格总览');

  // 点击看看第4层扩建预览
  const expandBtn = panelBody.querySelector('.house-expansion');
  assert.ok(expandBtn && expandBtn.textContent.includes('看看第4层扩建'));
  expandBtn.click();
  assert.equal(G.render.getHouseView().previewFourFloors, true);
  assert.equal(G.state.level, 1, '开启4层扩建预览不修改真实小屋等级');
  const floor4Btn = getById('panel-body').querySelector('[data-floor-focus="4"]');
  assert.ok(floor4Btn, '开启4层扩建预览后应出现4F按钮');

  // 打开装饰面板并检查搜索框
  G.ui.open('decor');
  assert.ok(getById('panel-body').querySelector('[data-ui-focus="decor-search"]'), '装饰背包面板应包含家具搜索输入框');
});

console.log('\n' + passed + ' 组第一批原型接入专项检查通过。');
