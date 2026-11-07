'use strict';
// 加载真实共享ui.js及服饰目录，通过页面拿到真实来源回调；无浏览器、服务或私人存档。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const ids = new Map(), apis = {}, shown = [], events = new Map();
  let writes = 0;
  class Node {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.style = {}; this.listeners = new Map(); this._text = ''; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    append(...children) { this.children.push(...children); children.forEach(child => { child.parentElement = this; }); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
    click() { if (!this.disabled) (this.listeners.get('click') || []).forEach(fn => fn({ target: this })); }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    replaceWith(next) { const parent = this.parentElement; if (!parent) return; const index = parent.children.indexOf(this); parent.children[index] = next; next.parentElement = parent; this.parentElement = null; if (this.contains(document.activeElement)) document.activeElement = null; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const nodes = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      return nodes.filter(child => {
        if (selector === '*') return true;
        if (selector.startsWith('.')) return (child.className || '').split(/\s+/).includes(selector.slice(1));
        const data = selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);
        return data ? child.dataset[data[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] === data[2] : child.tagName === selector.toUpperCase();
      });
    }
    focus() { document.activeElement = this; }
  }
  const node = id => { if (!ids.has(id)) ids.set(id, new Node()); return ids.get(id); };
  const document = { activeElement: null, getElementById: node, createElement: tag => new Node(tag), querySelectorAll: () => [], addEventListener() {} };
  const G = {
    data: {}, state: { tutorial: { done: true }, residents: { lily: { roomId: 'room_lily' } }, house: { rooms: {}, floors: [] }, avatar: { owned: { top_cloud: true } } },
    runtime: { avatarUI: { tab: 'presets', category: 'dress', filter: 'owned', facing: -1, savedSlot: 2 } },
    store: { update() { writes++; throw new Error('来源导航不能写存档'); } }, sys: {}, render: { camera: {} },
    bus: { on(name, fn) { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); }, emit(name, payload) { (events.get(name) || []).forEach(fn => fn(payload)); } },
    audio: { init() {}, stopSpeech() {} },
    ui: { controls: { close() {} } }
  };
  const window = { Game: G, matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ window, document, console, location: { search: '' }, URLSearchParams, requestAnimationFrame(fn) { fn(); }, setTimeout() {} });
  for (const file of ['js/data/outfits.js', 'js/ui/ui.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  G.ui.selection = () => {};
  G.ui.panel = { open(descriptor) { node('panel-body').replaceChildren(descriptor.content); node('panel-title').textContent = descriptor.title; } };
  function source(key) { return { panel(api) { apis[key] = api; return { title: key, content: new Node() }; } }; }
  G.ui.residentBook = source('residents'); G.ui.questBook = source('quests'); G.ui.collectionBook = source('collection');
  G.ui.avatar = { panel() { shown.push(plain(G.runtime.avatarUI)); return { title: '衣橱', content: new Node() }; } };
  return { G, apis, shown, node, document, writes: () => writes, source(name) { G.ui.open(name); return apis[name]; } };
}
let count = 0;
function test(name, fn) { fn(); count++; console.log('ok ' + count + ' - ' + name); }
function unchanged(f, saved) { assert.equal(JSON.stringify(f.G.state), saved); assert.equal(f.writes(), 0); }
test('居民换装心愿从预设进入衣服页，按definition服饰定位且保留原筛选', () => {
  const f = fixture(), saved = JSON.stringify(f.G.state), api = f.source('residents');
  api.navigate({ definition: { type: 'outfit', outfitId: 'top_berry' } }, 'lily');
  assert.equal(f.shown.length, 1); assert.equal(f.shown[0].tab, 'clothes'); assert.equal(f.shown[0].category, f.G.data.outfitById.top_berry.category); assert.equal(f.shown[0].filter, 'owned');
  assert.equal(f.G.runtime.activeRoomId, 'room_lily'); assert.equal(f.shown[0].facing, -1); assert.equal(f.shown[0].savedSlot, 2); unchanged(f, saved);
});
test('居民显式avatar来源从形象进入衣服页，action服饰优先且保留shop筛选', () => {
  const f = fixture(); Object.assign(f.G.runtime.avatarUI, { tab: 'face', filter: 'shop' }); const saved = JSON.stringify(f.G.state);
  f.source('residents').navigate({ action: { panel: 'avatar', outfitId: 'acc_star' }, definition: { type: 'outfit', outfitId: 'top_berry' } }, 'lily');
  assert.equal(f.shown[0].tab, 'clothes'); assert.equal(f.shown[0].category, 'acc'); assert.equal(f.shown[0].filter, 'shop'); unchanged(f, saved);
});
test('共享成长册和图鉴来源在avatar渲染前选衣服页，按实际拥有状态选owned或shop', () => {
  for (const source of ['quests', 'collection']) for (const [id, filter, tab] of [['top_cloud', 'owned', 'presets'], ['shoes_ballet', 'shop', 'face']]) {
    const f = fixture(); f.G.runtime.avatarUI.tab = tab; const saved = JSON.stringify(f.G.state);
    f.source(source).navigate({ panel: 'avatar', outfitId: id });
    assert.equal(f.shown.length, 1); assert.equal(f.shown[0].tab, 'clothes'); assert.equal(f.shown[0].category, f.G.data.outfitById[id].category); assert.equal(f.shown[0].filter, filter); unchanged(f, saved);
  }
});
test('缺少有效服饰ID的通用来源仍打开衣服页，保留类别及原shop回退行为', () => {
  for (const outfitId of [undefined, 'missing_outfit']) {
    const f = fixture(), saved = JSON.stringify(f.G.state); f.G.runtime.avatarUI.tab = 'face';
    f.source('quests').navigate({ panel: 'avatar', outfitId });
    assert.equal(f.shown[0].tab, 'clothes'); assert.equal(f.shown[0].category, 'dress'); assert.equal(f.shown[0].filter, 'shop'); unchanged(f, saved);
  }
});
test('普通打开衣橱保持形象或预设页签及类别筛选，不被来源导航修正扩大影响', () => {
  for (const tab of ['presets', 'face', 'clothes']) {
    const f = fixture(); Object.assign(f.G.runtime.avatarUI, { tab, category: 'shoes', filter: 'shop' }); const saved = JSON.stringify(f.G.state), before = plain(f.G.runtime.avatarUI);
    f.G.ui.open('avatar'); f.G.ui.open('avatar');
    assert.deepEqual(f.shown, [before, before]); unchanged(f, saved);
  }
});
test('非衣橱来源不修改衣橱运行态，也不渲染衣橱', () => {
  const f = fixture(), saved = JSON.stringify(f.G.state), before = plain(f.G.runtime.avatarUI);
  f.source('quests').navigate({ panel: 'residents' });
  assert.equal(f.shown.length, 0); assert.deepEqual(plain(f.G.runtime.avatarUI), before); unchanged(f, saved);
});
test('恢复家园视角按钮真实绑定resetView优先，旧相机回退fit，保留receiver与明确语义', () => {
  const f = fixture(), saved = JSON.stringify(f.G.state); let resets = 0, fits = 0;
  const camera = f.G.render.camera;
  camera.resetView = function () { assert.equal(this, camera); resets++; };
  camera.fit = function () { assert.equal(this, camera); fits++; };
  f.G.ui.refresh = () => {}; f.G.ui.init();
  const restore = f.node('zoom-fit'); assert.equal(restore.attrs['aria-label'], '恢复家园视角'); assert.equal(restore.attrs.title, '恢复家园视角');
  restore.click(); assert.equal(resets, 1); assert.equal(fits, 0);
  delete camera.resetView; restore.click(); assert.equal(resets, 1); assert.equal(fits, 1);
  unchanged(f, saved);
});
test('转动按钮读取实际pan/orbit，重复点击与外部事件同步pressed和提示，恢复回pan', () => {
  const f = fixture(), saved = JSON.stringify(f.G.state), calls = [], camera = f.G.render.camera; let mode = 'pan', resets = 0;
  camera.getInteractionMode = function () { assert.equal(this, camera); return mode; };
  camera.setInteractionMode = function (next) { assert.equal(this, camera); calls.push(next); mode = next; f.G.bus.emit('camera:interaction', { mode }); };
  camera.resetView = function () { assert.equal(this, camera); resets++; mode = 'pan'; f.G.bus.emit('camera:interaction', { mode }); };
  f.G.ui.refresh = () => {}; f.G.ui.init(); const toggle = f.node('camera-orbit'), hint = f.node('scene-hint');
  assert.equal(toggle.disabled, false); assert.equal(toggle.attrs['aria-pressed'], 'false'); assert.match(hint.textContent, /鼠标或单指拖动平移/);
  toggle.click(); assert.equal(calls.at(-1), 'orbit'); assert.equal(toggle.attrs['aria-pressed'], 'true'); assert.match(hint.textContent, /拖动转动视角/);
  toggle.click(); assert.equal(calls.at(-1), 'pan'); assert.equal(toggle.attrs['aria-pressed'], 'false'); assert.match(hint.textContent, /拖动平移/);
  mode = 'orbit'; f.G.bus.emit('camera:interaction', { mode }); assert.equal(toggle.attrs['aria-pressed'], 'true');
  f.node('zoom-fit').click(); assert.equal(resets, 1); assert.equal(mode, 'pan'); assert.equal(toggle.attrs['aria-pressed'], 'false'); assert.match(hint.textContent, /拖动平移/);
  f.G.data.furnitureById = { yard_test: { place: 'yard' } }; f.G.runtime.placing = 'yard_test'; camera.setInteractionMode('orbit'); assert.match(hint.textContent, /点前院摆放/); assert.equal(toggle.attrs['aria-pressed'], 'true');
  unchanged(f, saved);
});
test('视角API缺失或模式无效时禁用并解释，不把旧渲染器冒称为可转', () => {
  for (const capability of ['none', 'get-only', 'set-only', 'invalid']) {
    const f = fixture(), camera = f.G.render.camera;
    if (capability === 'get-only' || capability === 'invalid') camera.getInteractionMode = () => capability === 'invalid' ? 'unknown' : 'pan';
    if (capability === 'set-only' || capability === 'invalid') camera.setInteractionMode = () => { throw new Error('不可用接口不应调用'); };
    f.G.ui.refresh = () => {}; f.G.ui.init(); const toggle = f.node('camera-orbit');
    assert.equal(toggle.disabled, true); assert.equal(toggle.attrs['aria-pressed'], 'false'); assert.match(toggle.attrs['aria-description'], /尚未提供视角切换/); toggle.click();
    assert.doesNotMatch(f.node('scene-hint').textContent, /拖动转动视角/);
  }
});
function houseFixture(floors = 3) {
  const f = fixture(), changes = [], houseView = { floor: 'all', view: 'cutaway', previewFourFloors: false };
  f.G.state.house.floors = Array.from({ length: floors }, () => ({ slots: [null, null, null] })); f.G.state.level = floors === 3 ? 18 : 1;
  f.G.sys.building = { capacity: () => ({ floors, slots: 3 }) };
  f.G.render.getHouseView = () => ({ ...houseView });
  f.G.render.setHouseView = patch => { changes.push(plain(patch)); Object.assign(houseView, patch); f.G.bus.emit('house:view', { ...houseView }); };
  f.G.ui.refresh = () => {}; f.G.ui.init();
  return { ...f, changes, houseView, nav: () => f.node('house-view-controls').querySelector('.house-nav-world') };
}
test('主页纸面挂载完整真实楼层与视角导航，各楼层与阁楼回调可达且不建房', () => {
  const f = houseFixture(), saved = JSON.stringify(f.G.state); assert.ok(f.nav()); assert.equal(f.node('world').querySelector('.house-nav-world'), null);
  assert.deepEqual(f.nav().querySelector('.house-floor-tabs').children.map(button => button.dataset.floorFocus), ['all', '1', '2', '3', 'attic']);
  assert.deepEqual(f.nav().querySelector('.house-view-tabs').children.map(button => button.textContent), ['全屋剖面', '小屋外观']);
  assert.match(f.nav().querySelector('.house-expansion').textContent, /第4层扩建预览.*Lv.25/);
  for (const floor of [1, 2, 3, 'attic', 'all']) {
    const button = f.nav().querySelector('[data-floor-focus="' + floor + '"]'); assert.equal(button.disabled, false); button.click();
    assert.equal(f.houseView.floor, floor); assert.equal(f.changes.at(-1).floor, floor); assert.equal(f.nav().querySelector('[data-floor-focus="' + floor + '"]').attrs['aria-pressed'], 'true');
  }
  unchanged(f, saved);
});
test('剖面外观与第4层预览走既有回调，替换后保持键盘焦点和楼层滚动', () => {
  const f = houseFixture(), saved = JSON.stringify(f.G.state), third = f.nav().querySelector('[data-floor-focus="3"]');
  f.nav().querySelector('.house-floor-tabs').scrollLeft = 48; third.focus(); third.click();
  assert.notEqual(f.document.activeElement, third); assert.equal(f.document.activeElement.dataset.floorFocus, '3'); assert.equal(f.nav().querySelector('.house-floor-tabs').scrollLeft, 48);
  for (const view of ['exterior', 'cutaway']) {
    const button = f.nav().querySelector('[data-house-view="' + view + '"]'); button.focus(); button.click(); assert.equal(f.houseView.view, view); assert.equal(f.document.activeElement.dataset.houseView, view);
  }
  f.nav().querySelector('.house-expansion').focus(); f.nav().querySelector('.house-expansion').click(); assert.equal(f.houseView.previewFourFloors, true);
  const fourth = f.nav().querySelector('[data-floor-focus="4"]'); assert.match(fourth.textContent, /预览/); fourth.click(); assert.equal(f.houseView.floor, 4);
  f.nav().querySelector('.house-expansion').focus(); f.nav().querySelector('.house-expansion').click(); assert.equal(f.houseView.previewFourFloors, false); assert.equal(f.houseView.floor, 'all');
  assert.equal(f.nav().querySelector('[data-floor-focus="4"]'), null); assert.equal(f.G.state.house.floors.length, 3); unchanged(f, saved);
});
test('未开放楼层明确禁用，只有开启扩建预览才可查看未来层，不修改旧存档', () => {
  const f = houseFixture(1), saved = JSON.stringify(f.G.state);
  for (const floor of ['2', '3']) { const button = f.nav().querySelector('[data-floor-focus="' + floor + '"]'); assert.equal(button.disabled, true); assert.match(button.textContent, /未开放/); button.click(); }
  assert.equal(f.changes.length, 0);
  f.nav().querySelector('.house-expansion').click(); const fourth = f.nav().querySelector('[data-floor-focus="4"]'); assert.equal(fourth.disabled, false); assert.match(fourth.attrs['aria-label'], /扩建预览/); fourth.click();
  assert.equal(f.houseView.floor, 4); assert.equal(f.G.state.house.floors.length, 1); unchanged(f, saved);
});
console.log(count + ' checks passed');
