'use strict';
// MC-077：真实ui.js + 真实目录/规则，轻DOM只替代浏览器；不读取私人存档，不起服务。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setup } = require('./fixtures/resident-life.cjs');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [], test = (name, run) => tests.push({ name, run });
function harness() {
  const env = setup(), { G, document, panel, world } = env, proto = Object.getPrototypeOf(panel);
  const scrollCalls = [], focusCalls = [], worldPageTop = 96;
  let mobileView = false;
  const browser = { Game: G, innerWidth: 1280, innerHeight: 900, scrollY: 0, pageYOffset: 0,
    matchMedia: query => ({ matches: mobileView && query === '(max-width: 600px)' }) };
  const scroll = top => { browser.scrollY = top; browser.pageYOffset = top; };
  browser.scrollTo = options => { scrollCalls.push(plain(options)); scroll(options.top); };
  const mobile = (value = true) => { mobileView = value; browser.innerWidth = value ? 397 : 1280; browser.innerHeight = value ? 799 : 900; };
  world.getBoundingClientRect = () => ({ left: 0, top: worldPageTop - browser.scrollY, width: world.width, height: world.height });
  proto.focus = function (options) { document.activeElement = this; focusCalls.push({ node: this, options: options === undefined ? undefined : plain(options) }); };
  proto.matches = function (selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector.includes(' ')) { const parts = selector.trim().split(/\s+/), last = parts.pop(); if (!this.matches(last)) return false; let parent = this.parentElement; while (parent) { if (parent.matches(parts.join(' '))) return true; parent = parent.parentElement; } return false; }
    const excluded = [...selector.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]); if (excluded.some(part => this.matches(part))) return false;
    selector = selector.replace(/:not\([^)]+\)/g, '');
    const attrs = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    const simple = selector.replace(/\[[^\]]+\]/g, ''), id = simple.match(/#([\w-]+)/), tag = simple.match(/^[a-z]+/i), classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    if (id && this.id !== id[1]) return false;
    if (tag && this.tagName !== tag[0].toUpperCase()) return false;
    if (classes.some(name => !this.classList.contains(name))) return false;
    return attrs.every(([, name, expected]) => { const key = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : null, value = key ? this.dataset[key] : name === 'disabled' ? this.disabled ? '' : undefined : this.attributes[name]; return value !== undefined && (expected === undefined || String(value) === expected); });
  };
  Object.defineProperty(proto, 'classList', { configurable: true, get() {
    const change = (name, add) => { const all = new Set(this.className.split(/\s+/).filter(Boolean)); if (add) all.add(name); else all.delete(name); this.className = [...all].join(' '); return add; };
    return { contains: name => this.className.split(/\s+/).includes(name), add: name => change(name, true), remove: name => change(name, false), toggle: (name, force) => change(name, force === undefined ? !this.className.split(/\s+/).includes(name) : force) };
  } });
  proto.contains = function (target) { return this === target || this.children.some(child => child.contains(target)); };
  proto.replaceWith = function (next) { const parent = this.parentElement; if (!parent) return; const at = parent.children.indexOf(this); parent.children[at] = next; next.parentElement = parent; this.parentElement = null; if (this.contains(document.activeElement)) document.activeElement = document.body; };
  proto.removeAttribute = function (name) { delete this.attributes[name]; };
  proto.getAttribute = function (name) { return this.attributes[name] ?? null; };
  proto.getClientRects = function () { return this.hidden || this.classList.contains('hidden') ? [] : [this.getBoundingClientRect()]; };
  proto.fire = function (name, values = {}) { const event = Object.assign({ target: this, preventDefault() { this.prevented = true; } }, values); (this.listeners.get(name) || []).forEach(fn => fn(event)); return event; };
  proto.setSelectionRange = function (start, end) { this.selectionStart = start; this.selectionEnd = end; };
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.removeEventListener = (name, callback) => { const list = env.documentListeners.get(name) || []; env.documentListeners.set(name, list.filter(fn => fn !== callback)); };
  const app = document.createElement('div'); app.id = 'app'; document.body.append(app); app.append(world, panel);
  const add = (id, parent = app, tag = 'div') => { const existing = document.getElementById(id); if (existing) return existing; const node = document.createElement(tag); node.id = id; parent.append(node); return node; };
  ['panel-title', 'panel-subtitle', 'panel-body', 'panel-close'].forEach(id => add(id, panel));
  for (const id of ['hud', 'house-name', 'level-label', 'xp-label', 'coin-count', 'heart-count', 'save-status', 'sound-toggle', 'settings-button', 'quest-button', 'guide-button', 'zoom-in', 'zoom-out', 'zoom-fit', 'zoom-yard', 'zoom-sea', 'camera-orbit', 'house-view-controls', 'dock', 'modal-root', 'toast-root', 'island-date']) add(id);
  document.getElementById('quest-button').append(document.createElement('span'));
  add('xp-fill', add('xp-track')); add('scene-hint', world); add('selection-tools', world);
  env.load('js/data/deals.js'); env.load('js/systems/deals.js');
  const frameQueue = [], beginCalls = [], cancelCalls = [], buyCalls = [], navigation = [], modals = [], sounds = [];
  let beginResult = { ok: true, message: '可以摆放。' };
  const baseModal = G.ui.modal, toast = G.ui.toast;
  G.audio = { init() {}, play: sound => sounds.push(sound), stopSpeech() {}, unlock() {}, toggleMute() {}, getVoices: () => [] };
  G.ui.controls = {
    close() {}, isOpen: () => false, isInteracting: () => false, enhanceRange() {},
    label(control, text) { const node = document.createElement('label'), copy = document.createElement('span'); copy.textContent = text; node.append(copy, control); return node; },
    select(options, value, onChange) { const node = document.createElement('button'); node.dataset.cuteControl = 'select'; node.options = plain(options); node.value = value; node.textContent = options.find(item => String(item.id) === String(value))?.name || ''; node.choose = next => { assert.ok(options.some(item => String(item.id) === String(next)), '真实选项存在：' + next); node.value = next; node.focus(); onChange(next); }; return node; },
    color(value, key) { const node = document.createElement('input'); node.type = 'color'; node.value = value; if (key) node.dataset.uiFocus = key; return node; }
  };
  G.ui.furnitureRarity = { decorate() {} };
  G.render = {
    camera: { fit() {}, focusRoom() {}, focusYard() {}, focusGarden() {}, focusSea() {}, zoom() {} },
    drawThumbnail() {}, drawCharacter() {},
    beginPlacement(defId, roomId) { beginCalls.push([defId, roomId]); if (beginResult.ok) { G.runtime.placing = defId; G.runtime.activeRoomId = roomId; G.runtime.selected = null; G.runtime.mode = 'decorate'; G.bus.emit('house:view', { floor: 1, view: 'cutaway', previewFourFloors: false }); } return { ...beginResult }; },
    cancelPlacement() { cancelCalls.push(G.runtime.placing); G.runtime.placing = null; G.runtime.selected = null; G.runtime.mode = 'explore'; G.bus.emit('placement:cancelled', {}); }
  };
  const context = vm.createContext({ window: browser, document, console, location: { search: '' }, URLSearchParams,
    requestAnimationFrame: fn => { frameQueue.push(fn); return frameQueue.length; }, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, performance: { now: () => 1 } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/ui.js'), 'utf8'), context, { filename: 'js/ui/ui.js' });
  G.ui.toast = toast;
  G.ui.modal = options => { modals.push(options); return baseModal(options); };
  const actualOpen = G.ui.open; G.ui.open = (kind, options) => { navigation.push([kind, plain(options || {})]); return actualOpen(kind, options); };
  const actualBuy = G.sys.economy.buy; G.sys.economy.buy = (id, price) => { buyCalls.push([id, price]); return actualBuy(id, price); };
  env.at('2026-10-30');
  G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.wallet.heart = 10000; state.tutorial.done = true; state.tutorial.step = 8; state.inventory.bed_basic = 2; });
  const bedroom = G.sys.building.buildRoom(0, 0, 'bedroom').roomId, living = G.sys.building.buildRoom(0, 1, 'living').roomId;
  G.ui.init();
  const takeFrames = () => frameQueue.splice(0), runFrames = callbacks => callbacks.forEach(fn => fn(0));
  const flush = () => { let passes = 0; do { assert.ok(++passes < 30, 'UI刷新应收敛'); env.frames(); runFrames(takeFrames()); } while (frameQueue.length); };
  flush();
  const body = () => document.getElementById('panel-body');
  const key = name => document.querySelectorAll('[data-ui-focus="' + name + '"]').at(-1) || null;
  const item = id => body().querySelectorAll('.item-card').find(card => card.querySelectorAll('canvas').some(canvas => canvas.dataset.furniture === id)) || null;
  const buy = id => item(id)?.querySelector('button') || null;
  const input = (name, value) => { const target = key(name); assert.ok(target, name); target.value = value; target.focus(); target.fire('input'); flush(); };
  const choose = (name, value) => { const target = key(name); assert.ok(target, name); target.choose(value); flush(); };
  const click = name => { const target = key(name); assert.ok(target, name); target.click(); flush(); return target; };
  const open = (kind, options) => { G.ui.open(kind, options); flush(); };
  return { ...env, G, bedroom, living, body, key, item, buy, input, choose, click, open, flush, takeFrames, runFrames, mobile, scroll, scrollCalls, focusCalls, worldPageTop, scrollY: () => browser.scrollY, navigation, modals, beginCalls, cancelCalls, buyCalls, sounds, begin(result) { beginResult = result; } };
}
function unchanged(env, state, buys = 0) { assert.equal(JSON.stringify(env.G.state), state); assert.equal(env.buyCalls.length, buys); }
function owned(env, id, count = 2) { env.G.store.update(state => { state.inventory[id] = count; }); env.flush(); }
function themeItem(env, theme) { return env.G.data.furniture.find(def => def.theme === theme && !def.rewardOnly && !def.festivalId && def.place !== 'yard' && (def.currency || 'coin') === 'coin' && def.price > 0); }

test('装扮显式roomId定位真实房间，选择家具前不改存档', () => {
  const e = harness(); e.G.runtime.activeRoomId = e.bedroom; const before = JSON.stringify(e.G.state);
  e.open('decor', { roomId: e.living }); assert.equal(e.G.runtime.activeRoomId, e.living); assert.ok(e.item('bed_basic')); unchanged(e, before);
});

test('摆放成功交给beginPlacement且不消耗库存，无selected仍有持续取消与换件工具', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const before = JSON.stringify(e.G.state);
  const furniture = e.item('bed_basic'); assert.ok(furniture); furniture.click(); e.flush(); assert.deepEqual(e.beginCalls.at(-1), ['bed_basic', e.living]); assert.equal(e.G.runtime.selected, null);
  const tools = e.document.getElementById('selection-tools'); assert.equal(tools.classList.contains('hidden'), false); assert.ok(tools.classList.contains('placement-toolbar')); assert.match(tools.textContent, /摆放/); assert.match(tools.textContent, /客厅/);
  assert.ok(e.key('placement-cancel')); assert.ok(e.key('placement-change')); e.click('placement-cancel'); assert.equal(e.cancelCalls.length, 1); assert.equal(e.G.runtime.placing, null); assert.equal(tools.classList.contains('hidden'), true); unchanged(e, before);
});

test('beginPlacement拒绝时保留原装扮面板并解释，不留下假预览或减库存', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const before = JSON.stringify(e.G.state); e.begin({ ok: false, message: '这个房间已经收起，请重新选择。' });
  e.item('bed_basic').click(); e.flush(); assert.equal(e.panel.classList.contains('hidden'), false); assert.equal(e.panel.dataset.kind, 'decor'); assert.equal(e.G.runtime.placing, null); assert.match(e.toasts.at(-1), /房间已经收起/); unchanged(e, before);
});

test('换一件和成功/取消事件同步工具与提示，不依赖Esc退出', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); e.item('bed_basic').click(); e.flush(); e.click('placement-change');
  assert.equal(e.cancelCalls.length, 1); assert.equal(e.panel.dataset.kind, 'decor'); assert.equal(e.panel.classList.contains('hidden'), false); assert.equal(e.G.runtime.activeRoomId, e.living);
  e.item('bed_basic').click(); e.flush(); e.G.runtime.placing = null; e.G.bus.emit('scene:placed', { roomId: e.living, defId: 'bed_basic', result: { ok: true } }); e.flush();
  assert.equal(e.document.getElementById('selection-tools').classList.contains('hidden'), true); assert.doesNotMatch(e.document.getElementById('scene-hint').textContent, /正在摆放|点房间摆放/);
});

test('同ID换档后旧家具摆放按钮不能启动新档摆放，工具与提示不留旧房', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const oldPlacement = e.item('bed_basic');
  oldPlacement.click(); e.flush(); assert.ok(e.key('placement-cancel'));
  e.G.store.replace(e.parse(e.G.state)); e.flush(); const saved = JSON.stringify(e.G.state), begins = e.beginCalls.length;
  oldPlacement.click(); e.flush(); assert.equal(JSON.stringify(e.G.state), saved); assert.equal(e.beginCalls.length, begins); assert.notEqual(e.G.runtime.activeRoomId, e.living);
  assert.equal(e.document.getElementById('selection-tools').classList.contains('hidden'), true); assert.doesNotMatch(e.document.getElementById('scene-hint').textContent, /客厅.*第2间/);
});

function dragData(dropEffect = 'none') {
  return { values: new Map(), dropEffect, effectAllowed: '', setData(type, value) { this.values.set(type, value); } };
}
test('HTML拖放先通过begin定位，RAF后收起面板，未放下拖放可清除预览', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const before = JSON.stringify(e.G.state), furniture = e.item('bed_basic'), dataTransfer = dragData();
  const start = furniture.fire('dragstart', { dataTransfer });
  assert.notEqual(start.prevented, true); assert.deepEqual(e.beginCalls.at(-1), ['bed_basic', e.living]); assert.equal(e.panel.classList.contains('hidden'), false, '原生拖影捕获前保留来源DOM'); assert.equal(furniture.isConnected, true, 'beginPlacement同步house:view不可提前替换拖拽来源');
  assert.equal(dataTransfer.values.get('application/x-marshmallow-item'), 'bed_basic'); assert.equal(dataTransfer.values.get('application/x-marshmallow-furniture'), 'bed_basic'); assert.equal(dataTransfer.values.get('text/plain'), 'bed_basic'); assert.equal(dataTransfer.effectAllowed, 'copy');
  e.flush(); assert.equal(e.panel.classList.contains('hidden'), true); assert.equal(e.G.runtime.placing, 'bed_basic');
  furniture.fire('dragend', { dataTransfer }); e.flush(); assert.equal(e.cancelCalls.length, 1); assert.equal(e.G.runtime.placing, null); assert.equal(e.document.getElementById('selection-tools').classList.contains('hidden'), true); unchanged(e, before);
});

test('HTML拖放begin拒绝会preventDefault，保留面板且不发布假家具拖拽数据', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const before = JSON.stringify(e.G.state), dataTransfer = dragData(); e.begin({ ok: false, message: '请先选真实房间。' });
  const start = e.item('bed_basic').fire('dragstart', { dataTransfer }); e.flush();
  assert.equal(start.prevented, true); assert.equal(dataTransfer.values.size, 0); assert.equal(e.panel.classList.contains('hidden'), false); assert.equal(e.G.runtime.placing, null); assert.match(e.toasts.at(-1), /真实房间/); unchanged(e, before);
});

test('HTML已接受的drop不误取消，成功事件清工具，同ID换档后旧拖柄被拒绝', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const furniture = e.item('bed_basic'), dataTransfer = dragData('copy');
  furniture.fire('dragstart', { dataTransfer }); e.flush(); furniture.fire('dragend', { dataTransfer }); e.flush(); assert.equal(e.cancelCalls.length, 0); assert.equal(e.G.runtime.placing, 'bed_basic');
  e.G.runtime.placing = null; e.G.bus.emit('scene:placed', { roomId: e.living, defId: 'bed_basic', result: { ok: true } }); e.flush(); assert.equal(e.document.getElementById('selection-tools').classList.contains('hidden'), true);
  e.G.store.replace(e.parse(e.G.state)); e.flush(); const before = JSON.stringify(e.G.state), begins = e.beginCalls.length, staleTransfer = dragData();
  const stale = furniture.fire('dragstart', { dataTransfer: staleTransfer }); e.flush(); assert.equal(stale.prevented, true); assert.equal(staleTransfer.values.size, 0); assert.equal(e.beginCalls.length, begins); unchanged(e, before);
});

test('触屏关闭入口取消已经收起面板的摆放，预览与工具一起退出', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); e.item('bed_basic').click(); e.flush();
  assert.equal(e.panel.classList.contains('hidden'), true); const before = JSON.stringify(e.G.state);
  e.G.ui.panel.close(); e.flush(); assert.equal(e.G.runtime.placing, null); assert.equal(e.document.getElementById('selection-tools').classList.contains('hidden'), true); assert.equal(e.cancelCalls.length, 1); unchanged(e, before);
});

test('打开装饰不再强切到房间所在楼层；缩到某层时有整屋出口；关闭面板恢复整屋', () => {
  const e = harness(); e.open('decor', { roomId: e.living });
  assert.notEqual(e.G.runtime.houseView?.floor, 2, '打开装饰默认保持整屋，不能被切到房间的楼层');
  e.G.runtime.houseView = { floor: 1, view: 'cutaway', previewFourFloors: false }; e.open('decor', { roomId: e.living });
  const back = e.body().querySelectorAll('button').find(node => node.textContent === '整屋'); assert.ok(back, '缩到某一层时装饰面板要有“整屋”按钮');
  back.click(); e.flush(); assert.equal(e.G.runtime.houseView.floor, 'all');
  e.G.runtime.houseView = { floor: 2, view: 'cutaway', previewFourFloors: false }; e.G.ui.panel.close(); e.flush();
  assert.equal(e.G.runtime.houseView.floor, 'all', '退出建造装饰后恢复整屋');
});

module.exports = { harness, unchanged, owned, themeItem, plain };
if (require.main === module) (async () => { for (const { name, run } of tests) { await run(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组装扮摆放UI检查通过（内存DOM，不替代真实桌面/手机验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
