'use strict';
// 真实摄影系统 + 合成内存存档 + 轻DOM。Canvas编码为替身；不启动服务/浏览器，不读取私人相册。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), JPEG = 'data:image/jpeg;base64,/9j/AA==', PNG = 'data:image/png;base64,iVBORw0KGgo=';
const plain = value => JSON.parse(JSON.stringify(value)), tests = [], test = (name, fn) => tests.push([name, fn]);
const flush = async () => { for (let index = 0; index < 18; index++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function photo(id, caption = '独立的配文🌷') { return { id, at: 1793318400000, name: '小屋照片 ' + id, image: JPEG, width: 480, height: 360, decor: { frame: 'cream', caption, stickers: [{ uid: 'heart_' + id, stickerId: 'heart', x: .4, y: .6, scale: 1 }] } }; }
function harness(options = {}) {
  const documentEvents = new Map(), windowEvents = new Map(), frameQueue = [], dialogs = [], sounds = [], toasts = [], imageCalls = [], downloads = [], editorCalls = [], paints = [], updateOptions = [];
  let currentModal = null, panelCloses = 0, controlCloses = 0;
  const on = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const removeListener = (map, name, fn) => { map.set(name, (map.get(name) || []).filter(value => value !== fn)); };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.attributes = {}; this.listeners = new Map(); this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; } }; this._text = ''; this.hidden = false; this.disabled = false; this.value = ''; this.width = 480; this.height = 360; }
    get parentNode() { return this.parentElement; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || null; }
    get childNodes() { return this.children; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { for (let node of nodes) { if (typeof node === 'string') { const text = new Node('span'); text.textContent = node; node = text; } node.remove(); this.children.push(node); node.parentElement = this; } }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    replaceWith(node) { const parent = this.parentElement; if (!parent) return; const index = parent.children.indexOf(this); this.remove(); node.remove(); parent.children.splice(index, 0, node); node.parentElement = parent; }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; } }
    contains(node) { while (node) { if (node === this) return true; node = node.parentElement; } return false; }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); if (name === 'class') this.className = String(value); if (name === 'autofocus') this.autofocus = true; if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, fn) { on(this.listeners, name, fn); }
    removeEventListener(name, fn) { removeListener(this.listeners, name, fn); }
    dispatch(name, values = {}) { const event = Object.assign({ type: name, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }, values); for (const fn of [...this.listeners.get(name) || []]) fn(event); return event; }
    click() { if (!this.disabled) this.dispatch('click'); }
    requestSubmit() { this.dispatch('submit'); }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    scrollIntoView() {}
    getClientRects() { return this.hidden ? [] : [{}]; }
    getBoundingClientRect() { return { width: 480, height: 360, top: 0, left: 0 }; }
    matches(selector) {
      return selector.split(',').some(part => { let value = part.trim(); if (value === '*') return true; if (value.startsWith('#')) return this.id === value.slice(1); const excludes = [...value.matchAll(/:not\(\[([^\]]+)\]\)/g)].map(match => match[1]); value = value.replace(/:not\([^)]*\)/g, ''); if (excludes.some(name => name === 'disabled' ? this.disabled : this.attributes[name] !== undefined)) return false;
        const attrs = [...value.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)]; value = value.replace(/\[[^\]]+\]/g, ''); const tag = value.match(/^[a-z]+/i); if (tag && this.tagName !== tag[0].toUpperCase()) return false;
        if ([...value.matchAll(/\.([\w-]+)/g)].some(match => !this.classList.contains(match[1]))) return false;
        return attrs.every(([, name, expected]) => { const val = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] : name === 'autofocus' ? (this.autofocus ? '' : this.attributes[name]) : this.attributes[name]; return val !== undefined && (expected === undefined || String(val) === expected); }); });
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { const self = this; return { contains(name) { return self.className.split(/\s+/).includes(name); }, add(...names) { for (const name of names) if (!this.contains(name)) self.className += ' ' + name; }, remove(...names) { self.className = self.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); }, toggle(name, force) { const enabled = force === undefined ? !this.contains(name) : force; if (enabled) this.add(name); else this.remove(name); return enabled; } }; }
    getContext() { if (!this.context) { const base = { measureText: value => ({ width: [...String(value)].length * 10 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }; this.context = new Proxy(base, { get: (value, key) => key in value ? value[key] : () => {} }); } return this.context; }
    toDataURL(type) { return type === 'image/png' ? PNG : JPEG; }
  }
  const document = { hidden: false, activeElement: null, createElement: tag => new Node(tag), addEventListener: (name, fn) => on(documentEvents, name, fn), removeEventListener: (name, fn) => removeListener(documentEvents, name, fn) };
  document.body = new Node('body'); document.querySelectorAll = selector => document.body.querySelectorAll(selector); document.querySelector = selector => document.body.querySelector(selector); document.getElementById = id => document.body.querySelector('#' + id);
  const scene = new Node('canvas'); scene.id = 'scene'; scene.width = 1200; scene.height = 900; document.body.append(scene);
  class BaseImage { set src(value) { this.value = value; Promise.resolve().then(() => this.onload?.()); } }
  const context = vm.createContext({ console, document, Image: BaseImage, Blob, URL, atob, queueMicrotask, performance: { now: () => 1 }, requestAnimationFrame: fn => { frameQueue.push(fn); return frameQueue.length; }, cancelAnimationFrame() {}, setTimeout: fn => { frameQueue.push(fn); return frameQueue.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); context.window = context; context.addEventListener = (name, fn) => on(windowEvents, name, fn); context.removeEventListener = (name, fn) => removeListener(windowEvents, name, fn);
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/photography.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/render/photo-decoration.js', 'js/systems/photography.js'].forEach(load);
  const G = context.Game; G.store.init(); G.store.update(state => { state.album = plain(options.album || []); state.albumTrash = plain(options.trash || []); state.quests.stats.photos = state.album.length + state.albumTrash.length; });
  const draw = G.draw.photoDecoration.draw; G.draw.photoDecoration.draw = (...args) => { paints.push({ decor: plain(args[2]), width: args[0].width, height: args[0].height }); return draw(...args); };
  const update = G.store.update; G.store.update = (fn, opts) => { updateOptions.push(opts); return update(fn, opts); };
  G.utils.download = (filename, bytes, type) => { downloads.push({ filename, bytes: Buffer.from(bytes), type }); return true; };
  G.audio = { play: value => sounds.push(value), stopSpeech() {} };
  G.ui = { toast: value => toasts.push(value), panel: { close() { panelCloses++; } }, controls: { close() { controlCloses++; }, isOpen: () => false, label(control, text) { const label = new Node('label'), copy = new Node('span'); copy.textContent = text; label.append(copy, control); return label; } }, photoEditor: { open(value) { editorCalls.push(value); }, close() { throw new Error('相册不应负责关闭编辑器内部会话'); } }, modal(options) {
    currentModal?.close(); const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), body = new Node('div'), close = new Node('button'); overlay.className = 'modal-backdrop'; element.className = 'modal-card'; element.setAttribute('role', 'dialog'); element.tabIndex = -1; close.textContent = '✕'; close.setAttribute('aria-label', '关闭对话框'); const title = new Node('h2'); title.textContent = options.title; body.append(options.content); element.append(title, close, body); overlay.append(element); document.body.append(overlay);
    let closed = false; const keydown = event => { if (event.key === 'Escape') { event.preventDefault(); handle.close(); } };
    const handle = { element, body, options, close() { if (closed) return; closed = true; overlay.remove(); removeListener(documentEvents, 'keydown', keydown); if (currentModal === handle) currentModal = null; options.onClose?.(); if (previous?.isConnected) previous.focus(); G.bus.emit('modal:closed', {}); } }; close.addEventListener('click', () => handle.close()); document.addEventListener('keydown', keydown); dialogs.push(handle); currentModal = handle; frameQueue.push(() => { if (!element.isConnected) return; const first = body.querySelector('[autofocus]') || body.querySelector('button:not([disabled]), input:not([disabled])') || close; first.focus(); }); return handle;
  } };
  const originalImage = G.sys.photography.image; G.sys.photography.image = id => { imageCalls.push(id); return Promise.resolve({ ok: true, image: JPEG, width: 480, height: 360 }); };
  load('js/ui/photography.js');
  const key = name => document.querySelector('[data-ui-focus="album-v2-' + name + '"]');
  const current = () => dialogs.filter(handle => handle.element.isConnected).at(-1);
  const text = () => current()?.element.textContent || '';
  const frames = () => { frameQueue.splice(0).forEach(fn => fn(0)); };
  const open = async (mode = 'album') => { G.ui.photography.open({ mode }); await flush(); frames(); await flush(); return current(); };
  const click = async name => { const control = key(name); assert.ok(control, '缺少操作 ' + name + '；当前：' + text()); control.click(); await flush(); frames(); await flush(); return control; };
  const entry = async id => click('entry-' + id);
  const loadImages = () => { for (const image of document.querySelectorAll('img')) if (image.src) image.dispatch('load'); };
  const emitKey = key => { const event = { key, preventDefault() {}, stopPropagation() {} }; for (const fn of [...documentEvents.get('keydown') || []]) fn(event); };
  return { G, document, dialogs, sounds, toasts, imageCalls, downloads, editorCalls, paints, updateOptions, originalImage, key, current, text, frames, open, click, entry, loadImages, emitKey, panelCloses: () => panelCloses, controlCloses: () => controlCloses };
}

test('默认/camera沿用编辑器协议，相册空态读真实双容量且没有伪造记录', async () => {
  const e = harness(), before = JSON.stringify(e.G.state); e.G.ui.photography.open(); assert.equal(e.editorCalls.length, 1); assert.equal(typeof e.editorCalls[0].onAlbum, 'function'); e.G.ui.photography.open({ mode: 'camera' }); assert.equal(e.editorCalls.length, 2);
  await e.open(); assert.match(e.key('tab-album').textContent, /0\s*\/\s*12/); assert.match(e.key('tab-trash').textContent, /0\s*\/\s*12/); assert.equal(e.document.querySelectorAll('.av-entry').length, 0); assert.match(e.text(), /第一张/); assert.ok(e.panelCloses() >= 3); assert.ok(e.controlCloses() >= 3); assert.equal(JSON.stringify(e.G.state), before);
  await e.click('tab-trash'); assert.match(e.text(), /回收夹空/); assert.equal(e.document.querySelectorAll('.av-entry').length, 0); assert.equal(JSON.stringify(e.G.state), before);
});

test('网格来自真实系统副本，名称/日期与相片详情保持独立配文', async () => {
  const item = photo('one'), e = harness({ album: [item] }), before = JSON.stringify(e.G.state); await e.open(); assert.equal(e.document.querySelectorAll('.av-entry').length, 1); assert.match(e.key('entry-one').textContent, /小屋照片 one/); assert.match(e.key('entry-one').textContent, /10月|10\/30|10-30|30/); assert.deepEqual(e.imageCalls, ['one']);
  await e.entry('one'); assert.match(e.text(), /小屋照片 one/); assert.match(e.text(), /独立的配文🌷/); assert.ok(e.key('download')); assert.ok(e.key('rename')); assert.ok(e.key('remove')); assert.equal(JSON.stringify(e.G.state), before);
});

test('满册显示真实12容量及整理提示，不自动覆盖；回收满时保留原图', async () => {
  const e = harness({ album: Array.from({ length: 12 }, (_, i) => photo('a' + i)), trash: Array.from({ length: 12 }, (_, i) => photo('t' + i)) }); await e.open(); assert.match(e.key('tab-album').textContent, /12\s*\/\s*12/); assert.match(e.key('tab-trash').textContent, /12\s*\/\s*12/); assert.equal(e.document.querySelectorAll('.av-entry').length, 12); assert.match(e.text(), /装满|已满|满啦/);
  await e.entry('a0'); const before = JSON.stringify(e.G.state), handle = e.current(); await e.click('remove'); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.current(), handle); assert.match(e.text(), /回收夹.*12|回收夹.*满/); assert.equal(e.sounds.includes('success'), false);
});

test('图片等待系统合成与原生load，失败/解码失败均有重试入口', async () => {
  const e = harness({ album: [photo('one')] }), pending = deferred(); e.G.sys.photography.image = () => pending.promise; await e.open(); assert.match(e.text(), /展开|载入|加载/); pending.resolve({ ok: true, image: JPEG }); await flush(); const image = e.document.querySelector('img'); assert.equal(image.src, JPEG); image.dispatch('load'); await flush(); assert.equal(e.document.querySelector('.av-image-status')?.textContent.includes('正在'), false);
  e.G.sys.photography.image = () => Promise.resolve({ ok: false, message: '合成图片暂时失败' }); await e.open(); assert.match(e.text(), /合成图片暂时失败/); assert.ok(e.key('image-retry-one')); e.G.sys.photography.image = () => Promise.resolve({ ok: true, image: JPEG }); await e.click('image-retry-one'); const retryImage = e.document.querySelector('img'); retryImage.dispatch('error'); await flush(); assert.ok(e.key('image-retry-one')); assert.match(e.text(), /重试|再试/);
});

test('隐藏重试按钮前同步移焦到所属entry/preview/dialog，迟到图片不抢新焦点', async () => {
  const e = harness({ album: [photo('one')] }); e.G.sys.photography.image = () => Promise.resolve({ ok: false, message: '合成图片失败' }); await e.open(); const gridRetry = e.key('image-retry-one'), gridPending = deferred(); e.G.sys.photography.image = () => gridPending.promise; gridRetry.focus(); gridRetry.click(); assert.equal(e.document.activeElement, e.key('entry-one')); assert.ok(e.document.activeElement.isConnected); assert.equal(gridRetry.hidden, true); await flush(); e.key('tab-album').focus(); const tab = e.document.activeElement; gridPending.resolve({ ok: true, image: JPEG }); await flush(); e.document.querySelector('img').dispatch('load'); e.frames(); assert.equal(e.document.activeElement, tab, '图片迟到成功不能从新控件抢焦点');
  e.G.sys.photography.image = () => Promise.resolve({ ok: false, message: '合成详情图片失败' }); await e.entry('one'); const detailRetry = e.key('image-retry-one'), detailPending = deferred(); e.G.sys.photography.image = () => detailPending.promise; detailRetry.focus(); detailRetry.click(); assert.equal(e.document.activeElement, e.key('preview')); assert.ok(e.document.activeElement.isConnected); assert.equal(detailRetry.hidden, true); await flush(); e.key('download').focus(); const download = e.document.activeElement; detailPending.resolve({ ok: true, image: JPEG }); await flush(); e.document.querySelector('img').dispatch('load'); e.frames(); assert.equal(e.document.activeElement, download);
  const list = e.G.sys.photography.list; e.G.sys.photography.list = () => { throw new Error('合成读取异常'); }; await e.open(); const readRetry = e.key('read-retry'), readPending = deferred(), dialog = e.current(); e.G.sys.photography.list = () => readPending.promise; readRetry.focus(); readRetry.click(); assert.equal(e.document.activeElement, dialog.element); assert.ok(e.document.activeElement.isConnected); assert.equal(readRetry.hidden, true); readPending.resolve(list()); await flush(); e.frames(); await flush(); assert.equal(e.document.activeElement, e.key('tab-album')); assert.ok(e.document.activeElement.isConnected);
});

test('列表和详情读取失败/同步异常可重试且不伪装空册', async () => {
  const e = harness({ album: [photo('one')] }), list = e.G.sys.photography.list; e.G.sys.photography.list = () => { throw new Error('合成读取异常'); }; await e.open(); assert.match(e.text(), /重试|再试|没能|失败|重新读取/); assert.equal(e.document.querySelectorAll('.av-entry').length, 0); assert.doesNotMatch(e.text(), /第一张，会是什么/); e.G.sys.photography.list = list; await e.open(); await e.entry('one'); assert.ok(e.key('download'));
});

test('改名以30Unicode码点计数，保留IME合成和emoji，不改独立配文', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); await e.click('rename'); const input = e.key('name'), caption = e.G.state.album[0].decor.caption; assert.ok(input); assert.notEqual(input.maxLength, 30); input.value = '🌷'.repeat(31); input.dispatch('compositionstart'); input.dispatch('input', { isComposing: true }); assert.equal([...input.value].length, 31); await e.click('submit-name'); assert.equal(e.G.state.album[0].name, '小屋照片 one', '输入法合成期间不能提交名字'); assert.equal([...input.value].length, 31); input.dispatch('compositionend'); assert.equal([...input.value].length, 30); assert.match(e.text(), /30\s*\/\s*30/); await e.click('submit-name'); assert.equal([...e.G.state.album[0].name].length, 30); assert.equal(e.G.state.album[0].decor.caption, caption); assert.equal(e.G.state.quests.stats.photos, 1);
});

test('空名字/系统改名失败/同步异常保留表单和值，成功才播放成功声', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); await e.click('rename'); const input = e.key('name'); input.value = '   '; input.dispatch('input'); await e.click('submit-name'); assert.ok(e.key('name')); assert.equal(e.G.state.album[0].name, '小屋照片 one'); assert.equal(e.sounds.includes('success'), false);
  input.value = '新名字🌙'; input.dispatch('input'); const original = e.G.sys.photography.rename; e.G.sys.photography.rename = () => ({ ok: false, message: '合成改名拒绝' }); await e.click('submit-name'); assert.equal(e.key('name'), input); assert.equal(input.value, '新名字🌙'); assert.match(e.text(), /合成改名拒绝/); e.G.sys.photography.rename = () => { throw new Error('同步异常'); }; await e.click('submit-name'); assert.equal(e.key('name'), input); assert.equal(e.sounds.includes('success'), false); e.G.sys.photography.rename = original; await e.click('submit-name'); assert.equal(e.G.state.album[0].name, '新名字🌙'); assert.ok(e.sounds.includes('success'));
});

test('下载委托真实系统合成底图和装饰PNG，不增加照片/累计', async () => {
  const item = photo('one'), e = harness({ album: [item] }); await e.open(); await e.entry('one'); const before = JSON.stringify(e.G.state); await e.click('download'); assert.equal(e.downloads.length, 1); assert.equal(e.downloads[0].type, 'image/png'); assert.match(e.downloads[0].filename, /\.png$/); assert.deepEqual(e.downloads[0].bytes, Buffer.from(PNG.split(',')[1], 'base64')); assert.deepEqual(e.paints.at(-1).decor, item.decor); assert.equal(JSON.stringify(e.G.state), before); assert.ok(e.key('download')); assert.equal(e.key('download').disabled, false);
});

test('下载false/拒绝/同步异常保留详情可重试，只有ok反馈成功', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); const handle = e.current();
  for (const method of [() => Promise.resolve({ ok: false, message: '合成下载失败' }), () => Promise.reject(new Error('异步拒绝')), () => { throw new Error('同步异常'); }]) { e.G.sys.photography.download = method; await e.click('download'); assert.equal(e.current(), handle); assert.equal(e.key('download').disabled, false); assert.equal(e.sounds.includes('success'), false); assert.match(e.text(), /下载|重试|再试/); }
  e.G.sys.photography.download = () => Promise.resolve({ ok: true, message: '合成下载准备好' }); await e.click('download'); assert.ok(e.sounds.includes('success'));
});

test('回收/恢复均由真实系统迁移，回收详情只提供下载恢复和永久删除', async () => {
  const e = harness({ album: [photo('one')] }), serialized = JSON.stringify(e.G.state.album[0]); await e.open(); await e.entry('one'); await e.click('remove'); assert.equal(e.G.state.album.length, 0); assert.equal(JSON.stringify(e.G.state.albumTrash[0]), serialized); await e.click('tab-trash'); await e.entry('one'); assert.ok(e.key('download')); assert.ok(e.key('restore')); assert.ok(e.key('purge')); assert.equal(e.key('rename'), null); assert.equal(e.key('remove'), null); assert.equal(e.text().includes('编辑装饰'), false); await e.click('restore'); assert.equal(e.G.state.albumTrash.length, 0); assert.equal(JSON.stringify(e.G.state.album[0]), serialized); assert.equal(e.G.state.quests.stats.photos, 1);
});

test('写动作前重读系统当前位置，旧详情不能管理已经移走的照片', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); let removeCalls = 0; e.G.sys.photography.remove = () => { removeCalls++; return { ok: true, message: '不应调用' }; }; e.G.store.update(state => state.albumTrash.push(state.album.pop())); const before = JSON.stringify(e.G.state), handle = e.current(); await e.click('remove'); assert.equal(removeCalls, 0); assert.equal(e.current(), handle); assert.equal(JSON.stringify(e.G.state), before); assert.match(e.text(), /位置.*变化|重新查看/); assert.equal(e.sounds.includes('success'), false);
});

test('相册满时拒绝恢复并停留回收详情，不覆盖二十四张照片', async () => {
  const e = harness({ album: Array.from({ length: 12 }, (_, i) => photo('a' + i)), trash: Array.from({ length: 12 }, (_, i) => photo('t' + i)) }); await e.open(); await e.click('tab-trash'); await e.entry('t0'); const before = JSON.stringify(e.G.state), handle = e.current(); await e.click('restore'); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.current(), handle); assert.match(e.text(), /相册.*满|12张/); assert.equal(e.sounds.includes('success'), false);
});

test('永久删除有明确不可恢复确认，取消无损；成功只删除指定回收照片', async () => {
  const e = harness({ album: [photo('active')], trash: [photo('one'), photo('two')] }); await e.open(); await e.click('tab-trash'); await e.entry('one'); const before = JSON.stringify(e.G.state); await e.click('purge'); assert.match(e.text(), /不能.*找回|不能.*恢复|不可恢复|无法恢复/); assert.ok(e.key('confirm-purge')); await e.click('back'); assert.equal(JSON.stringify(e.G.state), before); assert.ok(e.key('entry-one'), '取消返回回收夹并保留原照片'); await e.entry('one'); await e.click('purge'); await e.click('confirm-purge'); assert.deepEqual(Array.from(e.G.state.albumTrash, item => item.id), ['two']); assert.equal(e.G.state.album[0].id, 'active'); assert.equal(e.G.state.quests.stats.photos, 3);
});

test('删除/移动/恢复同步异常与系统false不关闭原视图，按钮可再次尝试', async () => {
  const e = harness({ album: [photo('one')], trash: [photo('two')] }); await e.open(); await e.entry('one'); const before = JSON.stringify(e.G.state); e.G.sys.photography.remove = () => { throw new Error('合成移动异常'); }; const detail = e.current(); await e.click('remove'); assert.equal(e.current(), detail); assert.equal(e.key('remove').disabled, false); await e.click('back'); await e.click('tab-trash'); await e.entry('two'); e.G.sys.photography.restore = () => { throw new Error('合成恢复异常'); }; const trashDetail = e.current(); await e.click('restore'); assert.equal(e.current(), trashDetail); await e.click('purge'); e.G.sys.photography.purge = () => ({ ok: false, message: '合成删除拒绝' }); const confirm = e.current(); await e.click('confirm-purge'); assert.equal(e.current(), confirm); assert.match(e.text(), /合成删除拒绝/); e.G.sys.photography.purge = () => { throw new Error('合成删除异常'); }; await e.click('confirm-purge'); assert.equal(e.current(), confirm); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.sounds.includes('success'), false);
});

test('旧列表异步在关闭/重开/切标签/换档后不能替换新视图', async () => {
  for (const transition of ['close', 'reopen', 'tab', 'replace']) { const e = harness({ album: [photo('one')], trash: [photo('two')] }), pending = deferred(), list = e.G.sys.photography.list; e.G.sys.photography.list = () => pending.promise; e.G.ui.photography.open({ mode: 'album' }); await flush(); const stale = e.current(); e.G.sys.photography.list = list;
    if (transition === 'close') stale.close(); else if (transition === 'reopen') await e.open(); else if (transition === 'tab') { if (e.key('tab-trash')) await e.click('tab-trash'); else { stale.close(); await e.open(); await e.click('tab-trash'); } } else e.G.bus.emit('state:replace', e.G.state);
    const expected = e.current(), text = e.text(); pending.resolve([photo('late')]); await flush(); e.frames(); await flush(); assert.equal(e.current(), expected, transition); assert.equal(e.text(), text, transition); assert.equal(e.key('entry-late'), null); }
});

test('旧图片成功/失败和下载反馈在换页与关闭后均失效', async () => {
  const e = harness({ album: [photo('one'), photo('two')] }); await e.open(); await e.entry('one'); const pendingImage = deferred(); e.G.sys.photography.image = () => pendingImage.promise; await e.open(); const staleImage = e.document.querySelector('img'); await e.click('tab-trash'); const text = e.text(); pendingImage.resolve({ ok: true, image: 'data:image/jpeg;base64,T0xE' }); await flush(); assert.equal(e.text(), text); assert.notEqual(staleImage.src, 'data:image/jpeg;base64,T0xE');
  e.G.sys.photography.image = () => Promise.resolve({ ok: true, image: JPEG }); await e.open(); await e.entry('one'); const download = deferred(); e.G.sys.photography.download = () => download.promise; e.key('download').click(); await flush(); await e.click('back'); const handle = e.current(), toasts = e.toasts.length, sounds = e.sounds.length; download.resolve({ ok: true, message: '旧下载成功不应冒出' }); await flush(); assert.equal(e.current(), handle); assert.equal(e.toasts.length, toasts); assert.equal(e.sounds.length, sounds);
});

test('换档只关闭本模块窗口，旧按钮不能写入新档或关闭其它模块', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); const remove = e.key('remove'); e.G.bus.emit('state:replace', e.G.state); assert.equal(e.current(), undefined); const before = JSON.stringify(e.G.state); remove.click(); await flush(); assert.equal(JSON.stringify(e.G.state), before); const other = e.G.ui.modal({ title: '其它模块', content: e.document.createElement('p') }); e.G.bus.emit('state:replace', e.G.state); assert.equal(other.element.isConnected, true);
});

test('编辑入口传真实photo/onAlbum/onSaved，关闭/HUD交接不丢同步回调且迟到回调失效', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); const edit = Array.from(e.current().element.querySelectorAll('button')).find(node => node.textContent === '编辑装饰'); assert.ok(edit); edit.click(); await flush(); const options = e.editorCalls.at(-1); assert.equal(options.photo.id, 'one'); assert.equal(options.photo.decor.caption, '独立的配文🌷'); assert.equal(typeof options.onAlbum, 'function'); assert.equal(typeof options.onSaved, 'function'); options.onSaved(); await flush(); e.frames(); await flush(); assert.ok(e.key('download'));
  await e.open('camera'); const camera = e.editorCalls.at(-1); const editor = e.G.ui.modal({ title: '编辑器替身', content: e.document.createElement('p') }); editor.close(); camera.onAlbum(); await flush(); e.frames(); await flush(); assert.ok(e.key('tab-album'), '编辑器同步close→callback应被接住');
  await e.open('camera'); const stale = e.editorCalls.at(-1); e.G.bus.emit('state:replace', e.G.state); const other = e.G.ui.modal({ title: '其它模块', content: e.document.createElement('p') }); stale.onAlbum(); stale.onSaved?.(); await flush(); assert.equal(other.element.isConnected, true); assert.equal(e.current(), other);
});

test('编辑器同步打开异常保留原详情/网格及操作入口，恢复后可重试', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); await e.entry('one'); const openEditor = e.G.ui.photoEditor.open; e.G.ui.photoEditor.open = () => { throw new Error('合成编辑器打开异常'); }; const detail = e.current(); await e.click('edit'); assert.equal(e.current(), detail); assert.ok(e.key('edit')); assert.equal(e.key('edit').disabled, false); assert.match(e.text(), /暂时没有打开|重试|再试/); assert.equal(e.sounds.includes('success'), false); e.G.ui.photoEditor.open = openEditor; await e.click('edit'); assert.equal(e.editorCalls.at(-1).photo.id, 'one'); assert.equal(detail.element.isConnected, false);
  await e.open(); e.G.ui.photoEditor.open = () => { throw new Error('合成相机打开异常'); }; const album = e.current(); await e.click('camera'); assert.equal(e.current(), album); assert.ok(e.key('entry-one')); assert.ok(e.key('camera')); assert.equal(e.sounds.includes('success'), false); e.G.ui.photoEditor.open = openEditor; await e.click('camera'); assert.equal(e.editorCalls.at(-1).photo, undefined); assert.equal(album.element.isConnected, false);
  await e.open(); await e.entry('one'); e.G.ui.photoEditor.open = () => { e.G.ui.modal({ title: '先打开的编辑器替身', content: e.document.createElement('p') }); throw new Error('创建modal后异常'); }; await e.click('edit'); assert.ok(e.key('edit')); assert.equal(e.key('edit').disabled, false); assert.match(e.current().element.querySelector('.av-status').textContent, /暂时没有打开|重试|再试/, 'fallback重建后不能清掉编辑器失败反馈'); assert.equal(e.sounds.includes('success'), false);
});

test('焦点key唯一，表单Enter路径可用，Escape关闭使旧事件失效', async () => {
  const e = harness({ album: [photo('one')] }); await e.open(); let nodes = e.current().element.querySelectorAll('[data-ui-focus]'); assert.equal(new Set(nodes.map(node => node.dataset.uiFocus)).size, nodes.length); e.key('tab-album').dispatch('keydown', { key: 'ArrowRight' }); await flush(); e.frames(); await flush(); assert.equal(e.key('tab-trash').getAttribute('aria-selected'), 'true'); assert.equal(e.document.activeElement, e.key('tab-trash')); e.key('tab-trash').dispatch('keydown', { key: 'Home' }); await flush(); e.frames(); await flush(); assert.equal(e.key('tab-album').getAttribute('aria-selected'), 'true'); assert.equal(e.document.activeElement, e.key('tab-album')); await e.entry('one'); await e.click('rename'); const name = e.key('name'); assert.equal(e.document.activeElement, name); name.value = '键盘输入🌙'; name.dispatch('input'); const form = e.document.querySelector('form'); assert.ok(form); form.requestSubmit(); await flush(); e.frames(); await flush(); assert.equal(e.G.state.album[0].name, '键盘输入🌙'); assert.ok(e.document.activeElement?.isConnected); const old = e.key('remove'); e.emitKey('Escape'); assert.equal(e.current(), undefined); old.click(); await flush(); assert.equal(e.G.state.album.length, 1);
});

test('摄影写操作保持普通store.update，未调用同步commit或伪造拍摄计数', async () => {
  const e = harness({ album: [photo('one')] }); e.G.save = { commit() { throw new Error('本批不应同步commit'); } }; await e.open(); await e.entry('one'); await e.click('rename'); e.key('name').value = '普通保存'; e.key('name').dispatch('input'); await e.click('submit-name'); await e.click('remove'); assert.ok(e.updateOptions.length >= 2); assert.ok(e.updateOptions.every(value => value === undefined)); assert.equal(e.G.state.quests.stats.photos, 1);
});

test('合法最长名字和配文全文可达，详情操作与编辑后同步返回保留内容', async () => {
  const item = photo('long'), name = '长名字🌷'.repeat(7) + '🙂🌙', caption = '独立配文🌷'.repeat(6); item.name = name; item.decor.caption = caption; assert.equal([...name].length, 30); assert.equal([...caption].length, 30);
  const e = harness({ album: [item] }), before = JSON.stringify(e.G.state); await e.open();
  const entry = e.key('entry-long'); assert.ok(entry?.isConnected); assert.equal(entry.type, 'button'); assert.equal(entry.getAttribute('aria-label'), '查看相片：' + name); assert.ok(entry.textContent.includes(name));
  const selectedTab = e.key('tab-album'); assert.equal(selectedTab.getAttribute('role'), 'tab'); assert.equal(selectedTab.getAttribute('aria-selected'), 'true'); assert.equal(selectedTab.getAttribute('aria-controls'), e.current().element.querySelector('.av-page').id);
  await e.entry('long'); assert.ok(e.text().includes(name)); assert.ok(e.text().includes(caption)); assert.equal(e.document.querySelector('img').alt, name);
  for (const key of ['back', 'download', 'edit', 'rename', 'remove']) { const control = e.key(key); assert.ok(control?.isConnected, key + '应可达'); assert.equal(control.type, 'button'); assert.equal(control.hidden, false); assert.equal(control.disabled, false); }
  await e.click('edit'); const options = e.editorCalls.at(-1); assert.equal(options.photo.id, item.id); assert.equal(options.photo.name, name); assert.equal(options.photo.decor.caption, caption); assert.equal(e.current(), undefined, '交给编辑器时旧相册详情已关闭');
  options.onSaved(); await flush(); e.frames(); await flush(); assert.ok(e.key('edit')); assert.ok(e.text().includes(name)); assert.ok(e.text().includes(caption));
  await e.click('back'); assert.ok(e.key('entry-long')); assert.equal(e.key('camera').disabled, false); assert.equal(JSON.stringify(e.G.state), before);
  const source = fs.readFileSync(path.join(root, 'js/ui/photography.js'), 'utf8'); assert.doesNotMatch(source, /persist\s*:\s*true|save\.commit|localStorage|fetch\s*\(/); assert.match(source, /photoEditor\.open/);
});
(async () => { for (const [name, fn] of tests) { await fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组相册界面隔离检查通过（轻DOM/模拟编码，正式桌面/390px与PNG目视待验）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
