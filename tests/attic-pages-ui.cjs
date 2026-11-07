'use strict';
// MC-079：真实 data/store/save/系统和创意/摄影 UI；轻 DOM、绘图、编码与相机仅替代浏览器边界。
// 不 require 会自行执行的旧检查，不初始化 scene，不读取玩家存档、真实照片或浏览器。
// 本轮仅 node --check；本文件的事务/UI检查是否通过，由总集另行串行运行确认。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const JPEG = 'data:image/jpeg;base64,/9j/AA==', PNG = 'data:image/png;base64,iVBORw0KGgo=';
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [], test = (name, fn) => tests.push([name, fn]);
const flush = async () => { for (let i = 0; i < 18; i++) await Promise.resolve(); };
const succeeds = value => { assert.equal(value?.ok, true, value?.message || '真实系统应返回成功'); return value; };
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js']);
const systems = new Set(['js/systems/systems.js', 'js/systems/creative.js', 'js/systems/observatory.js', 'js/systems/photography.js']);
const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map(match => match[1].split('?')[0]).filter(file => core.has(file) || file.startsWith('js/data/') || systems.has(file));
let environments = [];

function harness({ attic = true, studio = true, ordinary = true } = {}) {
  const storage = new Map(), writes = [], frames = new Map(), timers = new Map(), documentEvents = new Map(), windowEvents = new Map();
  const dialogs = [], sources = [], focuses = [], views = [], selections = [], sounds = [], toasts = [], updates = [], paints = [], images = [], errors = [];
  let sequence = 0, currentModal = null, rejectWrites = false, holdImages = false, panelCloses = 0;
  const clock = new Date(2026, 9, 30, 21).getTime(), RealDate = Date;
  class FixedDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const remove = (map, type, fn) => map.set(type, (map.get(type) || []).filter(value => value !== fn));
  const listen = (map, type, fn, options = {}) => {
    if (options?.signal?.aborted) return;
    if (!map.has(type)) map.set(type, []); map.get(type).push(fn);
    options?.signal?.addEventListener('abort', () => remove(map, type, fn), { once: true });
  };
  class Node {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.className = ''; this.attributes = {}; this.dataset = {}; this.listeners = new Map();
      this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
      this._text = ''; this.hidden = false; this.disabled = false; this.value = ''; this.width = 480; this.height = 360; this.clientWidth = 700; this.clientHeight = 560; this.capture = new Set();
    }
    get parentNode() { return this.parentElement; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || null; }
    get childNodes() { return this.children; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) {
      for (let node of nodes) {
        if (typeof node === 'string') { const copy = new Node('span'); copy.textContent = node; node = copy; }
        node.remove(); this.children.push(node); node.parentElement = this;
      }
    }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; } }
    contains(node) { for (let value = node; value; value = value.parentElement) if (value === this) return true; return false; }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === 'id') this.id = String(value);
      if (key === 'class') this.className = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
    getAttribute(key) { return this.attributes[key] ?? null; }
    hasAttribute(key) { return this.attributes[key] !== undefined; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, fn, options) { listen(this.listeners, type, fn, options); }
    removeEventListener(type, fn) { remove(this.listeners, type, fn); }
    dispatch(type, extra = {}) {
      const event = Object.assign({ type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.immediate = true; } }, extra);
      for (const fn of [...this.listeners.get(type) || []]) { fn(event); if (event.immediate) break; }
      return event;
    }
    dispatchEvent(event) { return this.dispatch(event.type, event); }
    click() { if (!this.disabled) return this.dispatch('click'); }
    requestSubmit() { this.dispatch('submit'); }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    scrollIntoView() {}
    getClientRects() { return this.hidden ? [] : [{}]; }
    getBoundingClientRect() { return { width: 480, height: 360, left: 0, top: 0, right: 480, bottom: 360 }; }
    setPointerCapture(id) { this.capture.add(id); }
    hasPointerCapture(id) { return this.capture.has(id); }
    releasePointerCapture(id) { this.capture.delete(id); }
    matches(selector) {
      return selector.split(',').some(part => {
        let value = part.trim(); if (value === '*') return true; if (value.startsWith('#')) return this.id === value.slice(1);
        const not = [...value.matchAll(/:not\(\[([^\]]+)\]\)/g)].map(match => match[1]); value = value.replace(/:not\([^)]*\)/g, '');
        if (not.some(key => key === 'disabled' ? this.disabled : this.hasAttribute(key))) return false;
        const attributes = [...value.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)]; value = value.replace(/\[[^\]]+\]/g, '');
        const tag = value.match(/^[a-z]+/i); if (tag && this.tagName !== tag[0].toUpperCase()) return false;
        if ([...value.matchAll(/\.([\w-]+)/g)].some(match => !this.classList.contains(match[1]))) return false;
        return attributes.every(([, key, expected]) => {
          const actual = key.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] : this.attributes[key];
          return actual !== undefined && (expected === undefined || String(actual) === expected);
        });
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() {
      const node = this;
      return {
        contains(name) { return node.className.split(/\s+/).includes(name); },
        add(...names) { for (const name of names) if (!this.contains(name)) node.className += ' ' + name; },
        remove(...names) { node.className = node.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
        toggle(name, force) { const enabled = force === undefined ? !this.contains(name) : force; if (enabled) this.add(name); else this.remove(name); return enabled; }
      };
    }
    getContext() {
      if (!this.context) this.context = new Proxy({ measureText: value => ({ width: [...String(value)].length * 10 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
      return this.context;
    }
    toDataURL(type) { return type === 'image/png' ? PNG : JPEG; }
  }
  const document = { hidden: false, activeElement: null, createElement: tag => new Node(tag), addEventListener: (type, fn, options) => listen(documentEvents, type, fn, options), removeEventListener: (type, fn) => remove(documentEvents, type, fn) };
  document.body = new Node('body'); document.getElementById = id => document.body.querySelector('#' + id);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector); document.querySelector = selector => document.body.querySelector(selector);
  const scene = new Node('canvas'); scene.id = 'scene'; scene.width = 1280; scene.height = 960; document.body.append(scene);
  class TestImage {
    set src(value) { this.value = value; images.push(this); if (!holdImages) Promise.resolve().then(() => this.onload?.()); }
  }
  class TestResizeObserver { constructor(fn) { this.fn = fn; } observe(node) { this.node = node; } disconnect() { this.disconnected = true; } }
  class TestAbortController extends AbortController { constructor() { super(); require('node:events').setMaxListeners(0, this.signal); } }
  const context = vm.createContext({
    console: { log() {}, warn() {}, error: (...args) => errors.push(args.map(String)) }, Date: FixedDate, document, Image: TestImage, Blob, URL, atob,
    AbortController: TestAbortController, ResizeObserver: TestResizeObserver, queueMicrotask, performance: { now: () => clock },
    requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: fn => { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => ++sequence, clearInterval() {}
  });
  context.window = context; context.innerWidth = 1280; context.innerHeight = 960; context.matchMedia = () => ({ matches: false });
  context.addEventListener = (type, fn, options) => listen(windowEvents, type, fn, options); context.removeEventListener = (type, fn) => remove(windowEvents, type, fn);
  context.localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (rejectWrites) throw new Error('QuotaExceededError'); storage.set(key, String(value)); writes.push({ key, json: String(value) }); } };
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  files.forEach(load);
  const G = context.Game; G.store.init(G.save.load()); G.sys.init(); G.save.init();
  G.store.update(state => { state.level = 17; state.wallet.coin = 10000; state.settings.dayMode = 'night'; });
  const ordinaryId = ordinary ? succeeds(G.sys.building.buildRoom(0, 0, 'bedroom')).roomId : null;
  const studioId = studio ? succeeds(G.sys.building.buildRoom(0, ordinary ? 1 : 0, 'studio')).roomId : null;
  if (attic) succeeds(G.sys.observatory.build());
  assert.equal(G.store.atticRoomId, 'attic:observatory'); assert.ok(G.save.flush());
  G.draw = G.draw || {};
  G.draw.creative = { drawFrame(...args) { paints.push({ type: 'creative', target: args[0] }); }, drawPixels(...args) { paints.push({ type: 'pixels', target: args[0] }); } };
  G.draw.photoDecoration = {
    draw(target, base, decor) { paints.push({ type: 'photo', target, base, decor: plain(decor) }); return target; },
    stickerBox(sticker, width, height) { return { x: sticker.x * width, y: sticker.y * height, w: 40, h: 40 }; }
  };
  G.render = { captureScene(settings) { sources.push(plain(settings)); const canvas = new Node('canvas'); canvas.width = 1280; canvas.height = 960; return canvas; }, setHouseView(value) { views.push(plain(value)); }, camera: { focusRoom: id => focuses.push(id) } };
  G.audio = { play: value => sounds.push(value), stopSpeech() {} };
  G.utils.download = () => true;
  const update = G.store.update; G.store.update = (fn, options) => { updates.push(options); return update(fn, options); };
  G.ui = {
    panel: { close() { panelCloses++; } }, selection() { selections.push(plain(G.runtime.selected)); }, open() {}, toast: value => toasts.push(value),
    controls: {
      close() {}, isOpen: () => false, enhanceRange() {},
      select(items, value, action) {
        const node = new Node('button'); node.className = 'ui-input cute-select'; node.dataset.cuteControl = 'select'; node.setAttribute('role', 'combobox'); node.value = value; node.items = plain(items);
        // 只接受真实 UI 给出的选项；旧节点仍调用回调，让产品自身关闭/换档守卫接受检验。
        node.change = next => { const option = node.items.find(item => item.id === next); assert.ok(option, 'UI没有提供此空间：' + next); assert.notEqual(option.disabled, true); node.value = next; action?.(next); };
        return node;
      },
      label(control, text) { const label = new Node('div'), copy = new Node('span'); label.className = 'ui-field'; copy.className = 'ui-field-label'; copy.textContent = text; label.append(copy, control); return label; }
    },
    modal(options) {
      currentModal?.close();
      const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), body = new Node('div'), title = new Node('h2'), close = new Node('button');
      overlay.className = 'modal-backdrop'; element.className = 'modal-card'; body.className = 'modal-body'; title.textContent = options.title; close.textContent = '关闭';
      body.append(options.content); element.append(title, close, body); overlay.append(element); document.body.append(overlay);
      let closed = false;
      const handle = { element, body, close() { if (closed) return; closed = true; overlay.remove(); if (currentModal === handle) currentModal = null; options.onClose?.(); if (previous?.isConnected) previous.focus(); G.bus.emit('modal:closed', {}); } };
      close.addEventListener('click', () => handle.close()); currentModal = handle; dialogs.push(handle); return handle;
    }
  };
  load('js/ui/creative.js'); load('js/ui/photo-editor.js');
  const current = () => currentModal?.element.isConnected ? currentModal : null;
  const query = selector => current()?.element.querySelector(selector), all = selector => current()?.element.querySelectorAll(selector) || [];
  const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); };
  const settle = async () => { await flush(); frame(); await flush(); };
  const text = () => current()?.element.textContent || '';
  const button = name => all('button').find(node => typeof name === 'string' ? node.textContent === name : name.test(node.textContent));
  const click = async target => { const node = typeof target === 'string' || target instanceof RegExp ? button(target) : target; assert.ok(node, '缺少真实按钮：' + target + '；' + text()); node.click(); await settle(); return node; };
  const env = {
    G, context, ordinaryId, studioId, storage, writes, frames, timers, sources, focuses, views, selections, sounds, toasts, updates, paints, images, errors, document,
    current, query, all, frame, settle, text, button, click, atticId: G.store.atticRoomId,
    disk: () => storage.get(G.data.balance.saveKey), reject: value => { rejectWrites = value; }, panelCloses: () => panelCloses,
    holdImages(value) { holdImages = value; }, releaseImages() { images.splice(0).forEach(image => image.onload?.()); },
    async gallery() { G.ui.creative.open(); await settle(); },
    async detail(id) { await this.gallery(); const card = all('.creative-art-card').find(node => node.getAttribute('aria-label') === '查看画作：' + G.sys.creative.get(id).name); await click(card); },
    async photo(options) { G.ui.photoEditor.open(options); await settle(); },
    into(value) { context.__fixtureJson = JSON.stringify(value); try { return vm.runInContext('JSON.parse(__fixtureJson)', context); } finally { delete context.__fixtureJson; } }
  };
  environments.push(env); return env;
}

function art(e, name = '阁楼的一朵小花') { return succeeds(e.G.sys.creative.save({ name, pixels: '1' + '.'.repeat(255) })).art; }
function room(e, id = e.atticId) { const value = e.G.store.decorRoom(e.G.state, id); assert.ok(value, '必须由真实 decorRoom 解析目标'); return value; }
function picker(e) { const value = e.query('[data-ui-focus="creative-room"]'); assert.ok(value, '缺少真实创意空间 picker'); return value; }
function choose(node, id) { assert.ok(node.items.some(item => item.id === id), '不可绕过真实可选项'); node.change(id); }
function snapshot(e) { return { object: e.G.state, json: JSON.stringify(e.G.state), disk: e.disk(), map: JSON.stringify([...e.storage]), runtime: JSON.stringify(e.G.runtime), writes: e.writes.length, focuses: e.focuses.length, views: e.views.length, selections: e.selections.length }; }
function unchanged(e, before) {
  assert.equal(e.G.state, before.object); assert.equal(JSON.stringify(e.G.state), before.json); assert.equal(e.disk(), before.disk); assert.equal(JSON.stringify([...e.storage]), before.map);
  assert.equal(JSON.stringify(e.G.runtime), before.runtime); assert.equal(e.writes.length, before.writes); assert.equal(e.focuses.length, before.focuses); assert.equal(e.views.length, before.views); assert.equal(e.selections.length, before.selections);
}
function watch(G) { const events = [], off = ['state:change', 'save:committed', 'creative:changed', 'item:placed', 'room:decorated', 'photo:captured'].map(type => G.bus.on(type, value => events.push({ type, value: plain(value) }))); return { events, stop() { off.forEach(fn => fn()); } }; }
function assertLocation(e, id, uid = null, floor = 'attic') {
  assert.equal(e.G.runtime.mode, 'explore'); assert.equal(e.G.runtime.placing, null); assert.equal(e.G.runtime.activeRoomId, id);
  assert.deepEqual(plain(e.G.runtime.selected), uid ? { roomId: id, uid } : null);
  assert.equal(e.focuses.at(-1), id); assert.deepEqual(e.views.at(-1), { floor, view: 'cutaway', previewFourFloors: false }); assert.deepEqual(e.selections.at(-1), uid ? { roomId: id, uid } : null);
}
async function selectPhotoRoom(e, id) {
  const scope = e.query('[data-photo-scope="scope"]'), destination = e.query('[data-photo-room="room"]');
  assert.ok(scope); assert.ok(destination); choose(scope, 'room'); choose(destination, id); await e.settle(); return { scope, destination };
}
function restoreEmpty(e) { succeeds(e.G.save.restore(e.into(plain(e.G.store.defaultState())), { source: 'local' })); }

test('无阁楼的创意 picker 只列真实普通房，并保留楼层房型标签', async () => {
  const e = harness({ attic: false }), saved = art(e); await e.detail(saved.id);
  const choices = picker(e).items;
  assert.deepEqual(choices.map(value => value.id).sort(), Object.keys(e.G.state.house.rooms).sort());
  assert.equal(choices.some(value => value.id === e.atticId), false); assert.equal(e.G.store.decorRoom(e.G.state, e.atticId), null);
  assert.match(choices.find(value => value.id === e.ordinaryId).name, /卧室.*1楼第1间/); assert.match(choices.find(value => value.id === e.studioId).name, /画室.*1楼第2间/);
});

test('已建阁楼进入真实创意选项，默认当前阁楼且不混入普通房或楼层格', async () => {
  const e = harness(), saved = art(e); e.G.runtime.activeRoomId = e.atticId; await e.detail(saved.id);
  const control = picker(e); assert.equal(control.value, e.atticId); assert.match(control.items.find(value => value.id === e.atticId).name, /阁楼.*天文台|天文台.*阁楼/);
  assert.deepEqual(control.items.map(value => value.id).sort(), plain(e.G.store.decorRooms(e.G.state).map(([id]) => id).sort()));
  assert.equal(Object.hasOwn(e.G.state.house.rooms, e.atticId), false); assert.equal(e.G.state.house.floors.some(floor => floor.slots.includes(e.atticId)), false);
});

test('已建阁楼不冒充普通 studio，真实画室建好后才解除创作门槛', async () => {
  const e = harness({ studio: false }); await e.gallery();
  assert.equal(e.G.sys.creative.status().hasStudio, false); assert.equal(e.G.sys.creative.status().unlocked, false); assert.equal(e.button('画一幅').disabled, true); assert.match(e.text(), /先建一间画室/);
  const before = snapshot(e); assert.equal(e.G.sys.creative.save({ name: '不能越过画室', pixels: '.'.repeat(256) }).ok, false); unchanged(e, before);
  succeeds(e.G.sys.building.buildRoom(0, 1, 'studio')); await e.gallery(); assert.equal(e.G.sys.creative.status().unlocked, true); assert.equal(e.button('画一幅').disabled, false);
});

test('阁楼挂画经真实 picker 提交，持久保存、全屋唯一并定位真实 UID', async () => {
  const e = harness(), saved = art(e); await e.detail(saved.id); choose(picker(e), e.atticId);
  const before = snapshot(e), stats = e.G.state.quests.stats.itemsPlaced, events = watch(e.G); await e.click('装框挂墙'); events.stop();
  const placed = e.G.sys.creative.placement(saved.id); assert.ok(placed); assert.equal(placed.roomId, e.atticId); assert.equal(e.current(), null);
  assert.equal(room(e).items.filter(value => value.artId === saved.id).length, 1); assert.equal(e.G.state.quests.stats.itemsPlaced, stats + 1);
  assert.equal(e.writes.length, before.writes + 1); assert.equal(e.updates.at(-1).persist, true); assert.equal(JSON.parse(e.disk()).house.attic.room.items[0].uid, placed.uid);
  assert.equal(events.events.filter(value => value.type === 'item:placed').length, 1); assert.equal(events.events.filter(value => value.type === 'save:committed').length, 1);
  assert.equal(e.G.state.inventory.custom_art_frame, undefined); assert.equal(e.G.state.collection.custom_art_frame, undefined); assertLocation(e, e.atticId, placed.uid);
  const unique = snapshot(e); assert.equal(e.G.sys.creative.place(saved.id, e.ordinaryId).ok, false); unchanged(e, unique);
});

test('阁楼墙纸保存真实同 ID 引用和底色，再次选择同画不重复提交', async () => {
  const e = harness(), saved = art(e), old = plain(room(e).wallpaper), stats = e.G.state.quests.stats.wallpaperChanges;
  await e.detail(saved.id); choose(picker(e), e.atticId); const writes = e.writes.length; await e.click('铺成墙纸');
  assert.deepEqual(plain(room(e).wallpaper), { pattern: 'custom', color: old.color, color2: old.color2, artId: saved.id });
  assert.equal(e.G.state.quests.stats.wallpaperChanges, stats + 1); assert.equal(e.writes.length, writes + 1); assert.equal(e.updates.at(-1).persist, true);
  assert.equal(JSON.parse(e.disk()).house.attic.room.wallpaper.artId, saved.id); assertLocation(e, e.atticId);
  await e.detail(saved.id); choose(picker(e), e.atticId); const again = e.writes.length; await e.click('铺成墙纸');
  assert.equal(e.writes.length, again); assert.equal(e.G.state.quests.stats.wallpaperChanges, stats + 1); assertLocation(e, e.atticId);
});

test('普通房挂画和墙纸沿原接口提交，标签与一楼 cutaway 定位保留', async () => {
  const e = harness(), first = art(e, '普通房挂画'), second = art(e, '普通房墙纸');
  await e.detail(first.id); const control = picker(e); assert.match(control.items.find(value => value.id === e.ordinaryId).name, /卧室.*1楼第1间/); choose(control, e.ordinaryId); await e.click('装框挂墙');
  const placed = e.G.sys.creative.placement(first.id); assert.equal(placed.roomId, e.ordinaryId); assertLocation(e, e.ordinaryId, placed.uid, 1);
  await e.detail(second.id); choose(picker(e), e.ordinaryId); await e.click('铺成墙纸');
  assert.equal(room(e, e.ordinaryId).wallpaper.artId, second.id); assert.equal(JSON.parse(e.disk()).house.rooms[e.ordinaryId].wallpaper.artId, second.id); assertLocation(e, e.ordinaryId, null, 1);
  assert.equal(room(e).items.length, 0); assert.equal(room(e).wallpaper.pattern, 'stars');
});

test('挂墙与墙纸遭本机拒写或写入租约拒绝时，原 JSON/磁盘/窗口保留且不定位', async () => {
  for (const action of ['装框挂墙', '铺成墙纸']) for (const refusal of ['quota', 'lease']) {
    const e = harness(), saved = art(e); await e.detail(saved.id); choose(picker(e), e.atticId);
    if (refusal === 'quota') e.reject(true); else e.G.store.setWriteGuard(() => ({ ok: false, message: '合成写入租约拒绝' }));
    const before = snapshot(e), handle = e.current(), events = watch(e.G), successes = e.sounds.filter(value => value === 'success').length;
    await e.click(action); events.stop(); unchanged(e, before); assert.equal(e.current(), handle); assert.equal(handle.element.isConnected, true);
    assert.deepEqual(events.events, []); assert.equal(e.sounds.filter(value => value === 'success').length, successes); assert.match(e.toasts.at(-1), /暂时没能放进存档/);
    e.reject(false); e.G.store.setWriteGuard(null);
  }
});

test('已有挂画的查看按钮重读移动后的真实 placement，不重复挂画或写盘', async () => {
  const e = harness(), saved = art(e), placed = succeeds(e.G.sys.creative.place(saved.id, e.atticId, 35, 45));
  await e.detail(saved.id); assert.equal(e.button('这幅已挂好了').disabled, true); const locate = e.button('看看墙上这幅'); assert.ok(locate);
  succeeds(e.G.sys.decorating.move(e.atticId, placed.uid, e.ordinaryId, 60, 50)); const before = snapshot(e), events = watch(e.G);
  await e.click(locate); events.stop(); assert.equal(e.writes.length, before.writes); assert.equal(JSON.stringify(e.G.state), before.json); assert.deepEqual(events.events, []);
  assertLocation(e, e.ordinaryId, placed.uid, 1); assert.equal(room(e).items.length, 0); assert.equal(room(e, e.ordinaryId).items.filter(value => value.artId === saved.id).length, 1);
  await e.detail(saved.id); const missing = e.button('看看墙上这幅'); succeeds(e.G.sys.creative.remove(saved.id)); const gone = snapshot(e), handle = e.current();
  await e.click(missing); unchanged(e, gone); assert.equal(e.current(), handle); assert.match(e.toasts.at(-1), /位置有了变化/);
});

test('关闭或真实换档后的旧挂墙/墙纸/查看按钮无写入、toast或定位，也不关闭新窗口', async () => {
  for (const transition of ['close', 'replace']) for (const action of ['装框挂墙', '铺成墙纸', '看看墙上这幅']) {
    const e = harness(), saved = art(e); if (action === '看看墙上这幅') succeeds(e.G.sys.creative.place(saved.id, e.atticId));
    await e.detail(saved.id); choose(picker(e), e.atticId); const stale = e.button(action); assert.ok(stale);
    if (transition === 'close') e.current().close(); else restoreEmpty(e);
    const other = e.G.ui.modal({ title: '其它页面', content: e.document.createElement('p') }), before = snapshot(e), toastCount = e.toasts.length;
    stale.dispatch('click'); await e.settle(); unchanged(e, before); assert.equal(e.toasts.length, toastCount); assert.equal(e.current(), other);
  }
});

test('摄影无阁楼时空间选项不伪造阁楼，无任何空间时仍提供整屋', async () => {
  const e = harness({ attic: false }); await e.photo();
  const control = e.query('[data-photo-room="room"]'); assert.ok(control); assert.equal(control.items.some(value => value.id === e.atticId), false);
  assert.deepEqual(control.items.map(value => value.id).sort(), Object.keys(e.G.state.house.rooms).sort()); assert.match(control.items.find(value => value.id === e.ordinaryId).name, /卧室.*1楼第1间/);
  const atticOnly = harness({ attic: true, ordinary: false, studio: false }); await atticOnly.photo();
  assert.deepEqual(atticOnly.query('[data-photo-room="room"]').items.map(value => value.id), [atticOnly.atticId]);
  assert.notEqual(atticOnly.query('[data-photo-scope="scope"]').items.find(value => value.id === 'room').disabled, true);
  await selectPhotoRoom(atticOnly, atticOnly.atticId); assert.deepEqual(atticOnly.sources.at(-1), { scope: 'room', roomId: atticOnly.atticId }); assert.equal(atticOnly.query('.photo-shutter').disabled, false);
  const empty = harness({ attic: false, ordinary: false, studio: false }); await empty.photo();
  const scope = empty.query('[data-photo-scope="scope"]'); assert.equal(scope.items.find(value => value.id === 'room').disabled, true); assert.equal(empty.query('[data-photo-room="room"]'), null);
  assert.deepEqual(empty.sources, [{ scope: 'house' }]); assert.equal(empty.query('.photo-shutter').disabled, false);
});

test('摄影通过真实选项选择阁楼并以 room/atticId 准备及拍摄，普通房和缓存仍可用', async () => {
  const e = harness(); await e.photo(); const control = e.query('[data-photo-room="room"]'); assert.match(control.items.find(value => value.id === e.atticId).name, /阁楼.*天文台|天文台.*阁楼/);
  await selectPhotoRoom(e, e.atticId); assert.deepEqual(e.sources.at(-1), { scope: 'room', roomId: e.atticId });
  const state = snapshot(e), sourceCount = e.sources.length, photos = e.G.state.quests.stats.photos, events = watch(e.G);
  await e.click(e.query('.photo-shutter')); events.stop(); assert.equal(e.sources.length, sourceCount); assert.equal(e.G.state.album.length, 1); assert.equal(e.G.state.quests.stats.photos, photos + 1);
  assert.equal(events.events.filter(value => value.type === 'photo:captured').length, 1); assert.equal(e.G.state.album[0].image, JPEG); assert.equal(e.G.runtime.latestPhoto.canvas.width, 1280);
  // 摄影仍是普通 store.update；不把 UI 扩成 persist:true 或宣称快门即时写盘。
  assert.equal(e.updates.at(-1), undefined); assert.equal(e.disk(), state.disk);
  choose(control, e.ordinaryId); await e.settle(); assert.deepEqual(e.sources.at(-1), { scope: 'room', roomId: e.ordinaryId });
  const cached = e.sources.length; choose(control, e.ordinaryId); await e.settle(); assert.equal(e.sources.length, cached);
  await e.click('更新取景'); assert.equal(e.sources.length, cached + 1); assert.deepEqual(e.sources.at(-1), { scope: 'room', roomId: e.ordinaryId });
});

test('编辑旧照不提供新空间取景，真实装饰提交保持底图/名称/数量/累计', async () => {
  const e = harness(); await e.photo(); await e.click(e.query('.photo-shutter')); const original = plain(e.G.state.album[0]); e.current().close();
  // 清运行态大图，使本次编辑走真实 photography.base 的 Image 解码分支。
  e.G.bus.emit('state:replace', e.G.state); const sourceCount = e.sources.length; let callbacks = 0;
  await e.photo({ photo: original, onSaved() { assert.equal(e.current(), null, '应先同步关闭再回调'); callbacks++; } });
  assert.equal(e.query('[data-photo-scope="scope"]'), null); assert.equal(e.query('[data-photo-room="room"]'), null); assert.equal(e.sources.length, sourceCount); assert.equal(e.query('.photo-shutter').disabled, false);
  const captionTab = e.query('[data-tool="caption"]'); await e.click(captionTab); const input = e.query('.photo-caption-input'); input.value = '阁楼旧照的新配文'; input.dispatch('input'); await e.settle();
  const count = e.G.state.quests.stats.photos; await e.click(e.query('.photo-shutter'));
  assert.equal(callbacks, 1); assert.equal(e.G.state.album.length, 1); assert.equal(e.G.state.quests.stats.photos, count); assert.equal(e.G.state.album[0].image, original.image); assert.equal(e.G.state.album[0].name, original.name);
  assert.equal(e.G.state.album[0].decor.caption, '阁楼旧照的新配文'); assert.equal(e.sources.length, sourceCount);
});

test('已准备目标消失后旧快门和空间选项清底图并拒拍，不回退整屋或保存成功', async () => {
  for (const target of ['attic', 'ordinary']) {
    const e = harness(), id = target === 'attic' ? e.atticId : e.ordinaryId; await e.photo(); const { destination } = await selectPhotoRoom(e, id), shutter = e.query('.photo-shutter'); assert.equal(shutter.disabled, false);
    // 没有公开拆阁楼动作；合成经真实校验的外部状态变化，单独检验同档目标失效守卫。
    if (target === 'attic') e.G.store.update(state => { state.house.attic = null; }); else succeeds(e.G.sys.building.demolishRoom(id));
    const before = snapshot(e), captures = e.sources.length, successes = e.sounds.filter(value => value === 'shutter').length, events = watch(e.G);
    await e.click(shutter); events.stop(); unchanged(e, before); assert.deepEqual(events.events, []); assert.equal(shutter.disabled, true); assert.equal(e.query('.photo-editor-canvas').hidden, true);
    assert.match(e.text(), /空间已经不在|重新打开取景/); assert.equal(e.sources.length, captures); assert.equal(e.sounds.filter(value => value === 'shutter').length, successes);
    choose(destination, id); await e.settle(); await e.click('更新取景'); unchanged(e, before); assert.equal(e.sources.length, captures); assert.equal(e.G.state.album.length, 0);
  }
});

test('关闭/换档使旧摄影选项和快门失效，迟到旧照 Image 不回生或触发成功回调', async () => {
  for (const transition of ['close', 'replace']) {
    const e = harness(); await e.photo(); const { scope, destination } = await selectPhotoRoom(e, e.atticId), shutter = e.query('.photo-shutter');
    if (transition === 'close') e.current().close(); else restoreEmpty(e);
    const other = e.G.ui.modal({ title: '新页面', content: e.document.createElement('p') }), before = snapshot(e), sourceCount = e.sources.length, toastCount = e.toasts.length;
    choose(scope, 'room'); choose(destination, e.atticId); shutter.dispatch('click'); await e.settle(); unchanged(e, before); assert.equal(e.sources.length, sourceCount); assert.equal(e.toasts.length, toastCount); assert.equal(e.current(), other);

    const late = harness(); await late.photo(); await late.click(late.query('.photo-shutter')); const photo = plain(late.G.state.album[0]); late.current().close(); late.G.bus.emit('state:replace', late.G.state); late.holdImages(true);
    let callbacks = 0; await late.photo({ photo, onSaved() { callbacks++; } }); assert.ok(late.images.length); const staleCanvas = late.query('.photo-editor-canvas'), staleSave = late.query('.photo-shutter'); assert.equal(staleSave.disabled, true);
    if (transition === 'close') late.current().close(); else restoreEmpty(late);
    const fresh = late.G.ui.modal({ title: '另一个新页面', content: late.document.createElement('p') }), old = snapshot(late), successful = late.sounds.length, events = watch(late.G);
    late.releaseImages(); await late.settle(); staleSave.dispatch('click'); await late.settle(); events.stop(); unchanged(late, old);
    assert.deepEqual(events.events, []); assert.equal(callbacks, 0); assert.equal(late.sounds.length, successful); assert.equal(late.current(), fresh); assert.equal(staleCanvas.width, 1); assert.equal(staleCanvas.height, 1);
  }
});

(async () => {
  for (const [name, fn] of tests) {
    environments = []; await fn();
    for (const e of environments) assert.deepEqual(e.errors, [], '真实产品事件不能静默抛错');
    console.log('✓ ' + name);
  }
  console.log('\n' + tests.length + ' 组阁楼创意/摄影 UI 合成检查通过；仅验证真实提交、选项与边界参数，不代表场景、摄影像素或浏览器验收。');
})().catch(error => { console.error(error); process.exitCode = 1; });
