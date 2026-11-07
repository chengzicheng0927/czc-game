'use strict';
// 只用合成DOM矩形核验相机契约与真实导航意图；不读取存档，不起浏览器或服务。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture() {
  let mobile = false;
  const tasks = [], events = [], ids = new Map(), calls = [], observers = [];
  function mutation(record) {
    observers.forEach(observer => {
      if (observer.targets.some(([target, options]) => record.target === target && (record.type === 'childList' ? options.childList : options.attributes && (!options.attributeFilter || options.attributeFilter.includes(record.attributeName))))) observer.records.push(record);
    });
  }
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; this.records = []; observers.push(this); }
    observe(target, options) { this.targets.push([target, options]); }
    disconnect() { this.targets = []; this.records = []; }
  }
  class Node {
    constructor() { this.dataset = {}; this.children = []; this.attrs = {}; this.box = { left: 0, top: 0, width: 0, height: 0 }; this.classes = new Set(); this.style = { setProperty: (name, value) => { this.style[name] = value; mutation({ type: 'attributes', target: this, attributeName: 'style' }); } }; }
    get classList() {
      const s = this.classes, change = (name, add) => { const had = s.has(name); if (add) s.add(name); else s.delete(name); if (had !== add) mutation({ type: 'attributes', target: this, attributeName: 'class' }); return add; };
      return { add: n => change(n, true), remove: n => change(n, false), contains: n => s.has(n), toggle: (n, value) => change(n, value === undefined ? !s.has(n) : value) };
    }
    getBoundingClientRect() { return { ...this.box, right: this.box.left + this.box.width, bottom: this.box.top + this.box.height }; }
    getClientRects() { return this.classes.has('hidden') ? [] : [this.getBoundingClientRect()]; }
    append(...nodes) { this.children.push(...nodes); nodes.forEach(node => { node.parentElement = this; }); mutation({ type: 'childList', target: this }); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; nodes.forEach(node => { node.parentElement = this; }); mutation({ type: 'childList', target: this }); }
    remove() { if (!this.parentElement) return; const parent = this.parentElement; parent.children = parent.children.filter(node => node !== this); this.parentElement = null; mutation({ type: 'childList', target: parent }); }
    querySelectorAll(selector) { const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]); return descendants(this).filter(child => child.classes.has(selector.slice(1))); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener() {}
  }
  const node = id => { if (!ids.has(id)) ids.set(id, new Node()); return ids.get(id); };
  node('scene').box = { left: 0, top: 0, width: 1280, height: 720 };
  node('panel').box = { left: 882, top: 120, width: 370, height: 484 }; node('panel').classes.add('hidden');
  node('home-paper').box = { left: 952, top: 120, width: 300, height: 370 };
  const G = { ui: { panel: { close() { node('panel').classes.add('hidden'); calls.push('close'); } }, controls: { close() { calls.push('controls'); } }, selection() { calls.push('selection'); }, photography: { open() { calls.push('photography'); } }, calendar: { open() { calls.push('calendar'); } } }, runtime: {}, render: { camera: { fit() { calls.push('fit'); } }, setHouseView(patch) { calls.push(patch); } }, bus: { emit(name, data) { events.push({ name, data }); } } };
  const body = new Node();
  const gameDialog = () => node('modal-root').querySelectorAll('.modal-card').find(dialog => dialog.classes.has('minigame-modal') || dialog.classes.has('bakery-modal')) || null;
  const document = { body, getElementById: node, createElement: () => new Node(), createElementNS: () => new Node(), querySelectorAll: () => [], querySelector(selector) { return selector === '.minigame-modal, .bakery-modal' ? gameDialog() : node(selector); } };
  const window = {
    Game: G, innerWidth: 1280, innerHeight: 720, MutationObserver: Observer, matchMedia: () => ({ matches: mobile }), addEventListener() {}, scrollTo() { calls.push('scroll'); },
    // 模拟真实visibility语义：CSS隐藏纸面与HUD，getClientRects仍保留原矩形。
    getComputedStyle(target) {
      const takeover = body.classes.has('is-photographing') || body.classes.has('is-creating') || !!gameDialog();
      const hiddenByTakeover = takeover && ['home-paper', 'hud', 'quick-nav', '.dock-wrap'].some(id => target === node(id));
      return { display: target.classes.has('hidden') ? 'none' : target.style.display || 'block', visibility: target.style.visibility || (hiddenByTakeover ? 'hidden' : 'visible') };
    }
  };
  const sandbox = vm.createContext({ window, document, requestAnimationFrame(fn) { tasks.push(fn); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ui/visual-shell.js'), 'utf8'), sandbox);
  function deliver() { observers.forEach(observer => { if (observer.records.length) { const records = observer.records.splice(0); observer.callback(records); } }); }
  return {
    G, node, body, events, calls, tasks, observers, deliver, mobile(value) { mobile = value; },
    visibility(target, value) { target.style.visibility = value; mutation({ type: 'attributes', target, attributeName: 'style' }); },
    modal(kind) { const overlay = new Node(), dialog = new Node(); dialog.classes.add('modal-card'); if (kind) dialog.classes.add(kind); overlay.append(dialog); node('modal-root').append(overlay); return { overlay, dialog }; },
    flush() { let turns = 0; do { assert.ok(++turns < 50, '布局观察不得自触发循环'); deliver(); if (tasks.length) tasks.shift()(); } while (tasks.length || observers.some(observer => observer.records.length)); }
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, fn) { fn(); count++; console.log('ok ' + count + ' - ' + name); }
test('DOM初始化前返回完整scene，不依赖游戏状态和存档', () => {
  const f = fixture(); assert.deepEqual(plain(f.G.ui.sceneViewport()), { x: 0, y: 0, width: 1280, height: 720, layout: 'none', panel: null });
});
test('桌面主页按实际纸面板宽度留出相机空间；不扣侧栏高度', () => {
  const f = fixture(); f.G.ui.visualShell.init(); f.flush();
  const v = f.G.ui.sceneViewport(); assert.equal(v.layout, 'side'); assert.equal(v.height, 486); assert.ok(v.x + v.width < 952); assert.equal(v.panel.width, 300);
  const e = f.events.find(e => e.name === 'panel:change').data; assert.equal(e.open, false); assert.equal(e.height, 0); assert.equal(e.viewport.panel.width, 300);
});
test('侧栏变更报告真实open/height与双坐标bounds，viewport使用scene CSS像素', () => {
  const f = fixture(); f.G.ui.visualShell.init(); f.flush(); f.node('panel').classes.delete('hidden'); f.G.ui.visualShell.sync('garden'); f.flush();
  const e = f.events.filter(e => e.name === 'panel:change').at(-1).data;
  assert.equal(e.open, true); assert.equal(e.height, 484); assert.equal(e.layout, 'side'); assert.equal(e.bounds.left, 882); assert.equal(e.viewport.panel.x, 882); assert.equal(e.viewport.height, 486);
  f.node('scene').box.left = 20; f.node('scene').box.top = 10; const shifted = f.G.ui.sceneViewport(); assert.equal(shifted.panel.x, 862); assert.equal(shifted.panel.y, 110);
});
test('手机正常流面板在canvas外，不缩小场景；切尺寸重新测量', () => {
  const f = fixture(); f.G.ui.visualShell.init(); f.flush(); f.mobile(true);
  f.node('scene').box = { left: 25, top: 170, width: 365, height: 330 }; f.node('panel').box = { left: 16, top: 508, width: 358, height: 900 }; f.node('panel').classes.delete('hidden');
  f.G.ui.visualShell.sync('residents'); f.flush();
  assert.deepEqual(plain(f.G.ui.sceneViewport()), { x: 0, y: 0, width: 365, height: 330, layout: 'none', panel: null });
  assert.equal(f.events.filter(e => e.name === 'panel:change').at(-1).data.open, true);
});
test('返回主页清理临时摆放和选择，即使面板已经关闭；不写持久状态', () => {
  const f = fixture(); f.G.runtime.mode = 'decorate'; f.G.runtime.placing = 'bed'; f.G.runtime.selected = { uid: 'item' }; f.G.ui.visualShell.action('home');
  assert.equal(f.G.runtime.mode, 'explore'); assert.equal(f.G.runtime.placing, null); assert.equal(f.G.runtime.selected, null); assert.ok(f.calls.includes('fit')); assert.ok(f.calls.includes('scroll'));
});
test('点“我的小屋”还原初始全景：先离开串门、关面板，home-paper只收不切换，玩家回站位，镜头重置前panelKind已发布为null', () => {
  const f = fixture(), G = f.G, order = [], app = f.node('app'), shell = G.ui.visualShell;
  shell.init(); f.flush();
  G.runtime.player = { zone: 'room_a', x: 1, z: 1, walking: true }; G.runtime.activeRoomId = 'room_a'; G.runtime.mode = 'decorate'; G.runtime.placing = 'bed'; G.runtime.selected = { uid: 'item' };
  G.visitSession = { active: () => true, leave() { order.push('leave'); } };
  G.playerMovement = { resetKeys() { order.push('keys'); }, toYard(...args) { order.push('yard:' + args.length); } };
  G.render.camera.goHome = () => order.push('goHome:' + G.runtime.shellLayout.panelKind);
  f.node('panel').classes.delete('hidden'); shell.sync('garden'); f.flush(); assert.equal(G.runtime.shellLayout.panelKind, 'garden');
  app.classList.add('home-paper-open');
  shell.action('home');
  assert.deepEqual(order, ['leave', 'keys', 'yard:0', 'goHome:null'], '串门→按键→默认站位（toYard不带参数）→发布null后重置镜头');
  assert.equal(app.classList.contains('home-paper-open'), false); assert.equal(app.classList.contains('has-open-panel'), false); assert.ok(f.node('panel').classList.contains('hidden'));
  assert.equal(G.runtime.activeRoomId, null); assert.equal(G.runtime.mode, 'explore'); assert.equal(G.runtime.placing, null); assert.equal(G.runtime.selected, null);
  assert.equal(app.dataset.surface, 'home'); assert.ok(f.calls.includes('scroll'));
  shell.action('home'); assert.equal(app.classList.contains('home-paper-open'), false, '再点一次不再切换home-paper；展开由#home-paper-toggle专管');
  G.visitSession.active = () => false; order.length = 0; shell.action('home'); assert.equal(order[0], 'leave', '未切场景也先调用幂等leave，取消可能在途的串门');
});
test('读取小屋或敲门等待时点“我的小屋”也取消串门，不以已切场景作为退出条件', () => {
  for (const pending of ['loading', 'knocking']) {
    const f = fixture(), G = f.G, exits = [];
    let phase = pending;
    G.visitSession = { active: () => false, state: () => ({ phase }), leave() { exits.push(phase); phase = 'idle'; } };
    G.runtime.mode = 'explore';
    G.ui.visualShell.action('home');
    assert.deepEqual(exits, [pending], pending + '期间仍交给会话层取消读取或敲门');
    assert.equal(G.visitSession.state().phase, 'idle');
    assert.equal(G.runtime.mode, 'explore'); assert.ok(f.calls.includes('fit'));
    G.ui.visualShell.action('home');
    assert.deepEqual(exits, [pending, 'idle'], '重复回家继续使用会话层的幂等退出');
  }
});
test('摄影/活动派发到现有modal API，而非不存在的panel键', () => {
  const f = fixture(); f.G.ui.visualShell.action('photography'); f.G.ui.visualShell.action('calendar'); assert.deepEqual(f.calls, ['photography', 'calendar']);
});
test('同一帧多次布局请求只合并一轮测量，无持续轮询', () => {
  const f = fixture(); f.G.ui.visualShell.init(); f.flush(); const before = f.events.length;
  f.G.ui.visualShell.scheduleLayout(); f.G.ui.visualShell.scheduleLayout(); f.G.ui.visualShell.scheduleLayout(); assert.equal(f.tasks.length, 1); f.flush(); assert.equal(f.events.length, before + 2); assert.equal(f.tasks.length, 0);
});
test('visibility隐藏的纸面仍有矩形，但不再计入侧栏，恢复时重新通知', () => {
  const f = fixture(); f.G.ui.visualShell.init(); f.flush(); const before = f.G.ui.sceneViewport(), eventCount = f.events.length;
  f.visibility(f.node('home-paper'), 'hidden'); assert.equal(f.node('home-paper').getClientRects().length, 1); assert.equal(f.node('home-paper').getBoundingClientRect().width, 300);
  const hidden = f.G.ui.sceneViewport(); assert.equal(hidden.layout, 'none'); assert.equal(hidden.panel, null); assert.ok(hidden.width > before.width);
  f.deliver(); assert.equal(f.tasks.length, 1); f.flush(); assert.equal(f.events.length, eventCount + 2); assert.equal(f.events.at(-1).data.viewport.panel, null);
  f.visibility(f.node('home-paper'), 'visible'); f.flush(); assert.equal(f.G.ui.sceneViewport().layout, 'side'); assert.equal(f.events.at(-1).data.viewport.panel.width, 300);
});
test('摄影和画板从无功能panel的主页接管，完整scene可用，退出恢复主页侧栏', () => {
  for (const flag of ['is-photographing', 'is-creating']) {
    const f = fixture(); f.G.ui.visualShell.init(); f.flush(); const before = f.events.length;
    f.body.classList.add(flag); f.deliver(); assert.equal(f.tasks.length, 1); assert.equal(f.node('home-paper').getClientRects().length, 1);
    assert.deepEqual(plain(f.G.ui.sceneViewport()), { x: 0, y: 0, width: 1280, height: 720, layout: 'none', panel: null });
    f.flush(); assert.equal(f.events.length, before + 2); const entered = f.events.filter(event => event.name === 'panel:change').at(-1).data; assert.equal(entered.open, false); assert.equal(entered.height, 0); assert.equal(entered.viewport.layout, 'none');
    f.body.classList.remove(flag); f.flush(); assert.equal(f.G.ui.sceneViewport().layout, 'side'); assert.equal(f.G.runtime.shellLayout.takeover, false); assert.equal(f.events.length, before + 4);
  }
});
test('小游戏与烘焙modal增删触发接管，迟加dialog类也能检测，关闭恢复', () => {
  for (const kind of ['minigame-modal', 'bakery-modal']) {
    const f = fixture(); f.G.ui.visualShell.init(); f.flush(); const modal = f.modal(); f.flush(); const before = f.events.length;
    modal.dialog.classList.add(kind); f.deliver(); assert.equal(f.tasks.length, 1); f.flush();
    assert.equal(f.events.length, before + 2); assert.deepEqual(plain(f.G.ui.sceneViewport()), { x: 0, y: 0, width: 1280, height: 720, layout: 'none', panel: null });
    modal.overlay.remove(); f.flush(); assert.equal(f.G.ui.sceneViewport().layout, 'side'); assert.equal(f.events.length, before + 4);
    const direct = f.modal(kind); f.flush(); assert.equal(f.G.ui.sceneViewport().layout, 'none'); direct.overlay.remove(); f.flush(); assert.equal(f.G.ui.sceneViewport().layout, 'side');
  }
});
test('同帧接管属性变化合并，棋子内容与app兼容style不制造额外测量', () => {
  const f = fixture(); f.G.ui.visualShell.init(); f.flush(); const before = f.events.length;
  f.body.classList.add('is-photographing'); f.body.classList.add('is-creating'); f.deliver(); assert.equal(f.tasks.length, 1); f.flush(); assert.equal(f.events.length, before + 2);
  f.body.classList.remove('is-photographing'); f.flush(); assert.equal(f.events.length, before + 2);
  f.body.classList.remove('is-creating'); f.flush(); const modal = f.modal('minigame-modal'); f.flush(); const current = f.events.length;
  const cell = new (f.node('scene').constructor)(); modal.dialog.append(cell); cell.replaceChildren(new (cell.constructor)()); modal.dialog.classList.add('is-playing');
  f.node('app').style.setProperty('--open-panel-height', '0px'); f.deliver(); assert.equal(f.tasks.length, 0); f.flush(); assert.equal(f.events.length, current);
});
console.log(count + ' checks passed');
