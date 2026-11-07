'use strict';
// 创意data/系统/绘制 + 合成内存存档与轻DOM；不读取主场景或私人作品。PNG编码替身，真实PNG另验。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), PNG = 'data:image/png;base64,iVBORw0KGgo=';
const plain = value => JSON.parse(JSON.stringify(value)), tests = [], test = (name, fn) => tests.push([name, fn]);
const flush = async () => { for (let index = 0; index < 18; index++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const blank = '.'.repeat(256);
function art(id = 'one', pixels = '0' + blank.slice(1)) { return { id, name: '小画 ' + id, pixels }; }
function harness(options = {}) {
  const documentEvents = new Map(), documentCapture = new WeakMap(), windowEvents = new Map(), frames = new Map(), timers = new Map(), dialogs = [], sounds = [], toasts = [], paints = [], downloads = [], updateOptions = [], observers = [];
  let clock = 100000, nextId = 0, currentModal = null, controlCloses = 0;
  const register = (map, name, fn, opts = {}) => { if (opts.signal?.aborted) return; if (!map.has(name)) map.set(name, []); map.get(name).push(fn); opts.signal?.addEventListener('abort', () => remove(map, name, fn), { once: true }); };
  const remove = (map, name, fn) => map.set(name, (map.get(name) || []).filter(value => value !== fn));
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.attributes = {}; this.listeners = new Map(); this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } }; this._text = ''; this.hidden = false; this.disabled = false; this.value = ''; this.width = 480; this.height = 360; this.clientWidth = 700; this.clientHeight = 560; this.capture = new Set(); }
    get parentNode() { return this.parentElement; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || null; }
    get childNodes() { return this.children; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { for (let node of nodes) { if (typeof node === 'string') { const child = new Node('span'); child.textContent = node; node = child; } node.remove(); this.children.push(node); node.parentElement = this; } }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; } }
    contains(node) { while (node) { if (node === this) return true; node = node.parentElement; } return false; }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); if (name === 'class') this.className = String(value); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return this.attributes[name] !== undefined; }
    requestSubmit() { this.dispatch('submit'); }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, fn, opts) { register(this.listeners, name, fn, opts); }
    removeEventListener(name, fn) { remove(this.listeners, name, fn); }
    dispatch(name, values = {}) { const event = Object.assign({ type: name, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; this.immediate = true; } }, values); for (const fn of [...this.listeners.get(name) || []]) { fn(event); if (event.immediate) break; } return event; }
    dispatchEvent(event) { return this.dispatch(event.type, event); }
    click() { if (!this.disabled) return this.dispatch('click'); }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    scrollIntoView() {}
    setPointerCapture(id) { this.capture.add(id); }
    hasPointerCapture(id) { return this.capture.has(id); }
    releasePointerCapture(id) { this.capture.delete(id); }
    getClientRects() { return this.hidden ? [] : [{}]; }
    getBoundingClientRect() { return { width: 480, height: 360, top: 0, left: 0, right: 480, bottom: 360 }; }
    matches(selector) { return selector.split(',').some(part => { let value = part.trim(); if (value === '*') return true; if (value.startsWith('#')) return this.id === value.slice(1); const excludes = [...value.matchAll(/:not\(\[([^\]]+)\]\)/g)].map(match => match[1]); value = value.replace(/:not\([^)]*\)/g, ''); if (excludes.some(name => name === 'disabled' ? this.disabled : this.attributes[name] !== undefined)) return false; const attrs = [...value.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)]; value = value.replace(/\[[^\]]+\]/g, ''); const tag = value.match(/^[a-z]+/i); if (tag && this.tagName !== tag[0].toUpperCase()) return false; if ([...value.matchAll(/\.([\w-]+)/g)].some(match => !this.classList.contains(match[1]))) return false; return attrs.every(([, name, expected]) => { const val = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] : this.attributes[name]; return val !== undefined && (expected === undefined || String(val) === expected); }); }); }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { const self = this; return { contains(name) { return self.className.split(/\s+/).includes(name); }, add(...names) { for (const name of names) if (!this.contains(name)) self.className += ' ' + name; }, remove(...names) { self.className = self.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); }, toggle(name, force) { const enabled = force === undefined ? !this.contains(name) : force; if (enabled) this.add(name); else this.remove(name); return enabled; } }; }
    getContext() { if (!this.context) { const base = { measureText: value => ({ width: [...String(value)].length * 10 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }; this.context = new Proxy(base, { get: (value, key) => key in value ? value[key] : () => {} }); } return this.context; }
    toDataURL(type) { assert.equal(type,'image/png'); return PNG; }
  }
  const document = { hidden: false, activeElement: null, createElement: tag => new Node(tag), addEventListener(name, fn, opts) { documentCapture.set(fn, opts === true || !!opts?.capture); register(documentEvents, name, fn, opts); }, removeEventListener: (name, fn) => remove(documentEvents, name, fn) };
  document.body = new Node('body'); document.querySelectorAll = selector => document.body.querySelectorAll(selector); document.querySelector = selector => document.body.querySelector(selector); document.getElementById = id => document.body.querySelector('#' + id);
  const RealDate = Date; class TestDate extends RealDate { static now() { return clock; } }
  class BaseImage { set src(value) { this.value = value; Promise.resolve().then(() => this.onload?.()); } }
  class TestResizeObserver { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe(node) { this.node = node; } disconnect() { this.disconnected = true; } }
  class TestAbortController extends AbortController { constructor() { super(); require('node:events').setMaxListeners(0, this.signal); } }
  const context = vm.createContext({ console, document, Image: BaseImage, Blob, URL, atob, AbortController: TestAbortController, Date: TestDate, queueMicrotask, ResizeObserver: TestResizeObserver, performance: { now: () => clock }, requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id), setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => ++nextId, clearInterval() {} });
  context.localStorage = { getItem: () => null, setItem() {} };
  context.window = context; context.innerWidth = options.width || 1280; context.innerHeight = 960; context.matchMedia = () => ({ matches: !!options.reducedMotion }); context.addEventListener = (name, fn, opts) => register(windowEvents, name, fn, opts); context.removeEventListener = (name, fn) => remove(windowEvents, name, fn);
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/creative.js', 'js/render/creative.js'].forEach(load);
  const G = context.Game; G.store.init(); G.sys.init();
  if (!options.locked) { G.store.update(state => { state.level = 7; state.wallet.coin = 10000; }); assert.ok(G.sys.building.buildRoom(0, 0, 'studio').ok); }
  G.store.update(state => { state.customArts = plain(options.arts || []); });
  const focusCalls = [], selected = [], buildCalls = [];
  G.render = { camera: { focusRoom: id => focusCalls.push(id) } };
  const draw = G.draw.creative.drawPixels; G.draw.creative.drawPixels = (...args) => { paints.push({ target: args[0], pixels: args[1] }); return draw(...args); };
  const update = G.store.update; G.store.update = (fn, opts) => { updateOptions.push(opts); return update(fn, opts); };
  G.utils.download = (filename, bytes, type) => { downloads.push({ filename, bytes: Buffer.from(bytes), type }); return true; };
  G.audio = { play: value => sounds.push(value), stopSpeech() {} };
  G.ui = { panel: { close() {} }, selection() { selected.push(plain(G.runtime.selected)); }, open(...args) { buildCalls.push(args); }, toast: value => toasts.push(value), controls: { close() { controlCloses++; }, isOpen: () => false, enhanceRange() {}, select(items, value, action) { const node = new Node('button'); node.value = value; node.items = plain(items); node.setAttribute('role', 'combobox'); node.change = next => { node.value = next; action?.(next); }; return node; }, label(control, text) { const label = new Node('label'), copy = new Node('span'); label.className = 'ui-field'; copy.textContent = text; label.append(copy, control); return label; } }, modal(options) {
    currentModal?.close(); const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), head = new Node('div'), body = new Node('div'), close = new Node('button'); overlay.className = 'modal-backdrop'; element.className = 'modal-card'; head.className = 'modal-head'; body.className = 'modal-body'; element.setAttribute('role', 'dialog'); element.tabIndex = -1; close.textContent = '关闭'; close.setAttribute('aria-label', '关闭对话框'); const title = new Node('h2'); title.textContent = options.title; body.append(options.content); head.append(title, close); element.append(head, body); overlay.append(element); document.body.append(overlay);
    // 与真实ui.modal一致：capture阶段收到Escape便关闭，不在替身里替编辑器兜底IME。
    let closed = false; const keydown = event => { if (G.ui.controls.isOpen()) return; if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); handle.close(); } };
    const handle = { element, body, options, close() { if (closed) return; closed = true; overlay.remove(); remove(documentEvents, 'keydown', keydown); if (currentModal === handle) currentModal = null; options.onClose?.(); if (previous?.isConnected) previous.focus(); G.bus.emit('modal:closed', {}); } }; close.addEventListener('click', () => handle.close()); document.addEventListener('keydown', keydown, true); dialogs.push(handle); currentModal = handle; frames.set(++nextId, () => { if (element.isConnected) (body.querySelector('[autofocus]') || body.querySelector('button:not([disabled]), input:not([disabled])') || close).focus(); }); return handle;
  } };
  load('js/ui/creative.js');
  const current = () => dialogs.filter(handle => handle.element.isConnected).at(-1), query = selector => current()?.element.querySelector(selector), all = selector => current()?.element.querySelectorAll(selector) || [];
  const text = () => current()?.element.textContent || '';
  const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); };
  const advance = value => { clock += value; const due = [...timers].filter(([, timer]) => timer.at <= clock); due.forEach(([id, timer]) => { timers.delete(id); timer.fn(); }); frame(); };
  const button = value => all('button').find(node => typeof value === 'string' ? node.textContent === value : value.test(node.textContent));
  const click = async value => { const node = typeof value === 'string' || value instanceof RegExp ? button(value) : value; assert.ok(node, '缺少按钮 ' + value + '；当前：' + text()); node.click(); await flush(); frame(); await flush(); return node; };
  const open = async opts => { G.ui.creative.open(opts); await flush(); frame(); await flush(); return current(); };
  const canvas = () => query('.creative-pixel-canvas');
  const pixels = () => paints.filter(paint => paint.target === canvas()?.getContext('2d')).at(-1)?.pixels;
  const pointer = (type, id, x, y, extra = {}) => canvas().dispatch(type, Object.assign({ pointerId: id, pointerType: 'touch', button: 0, clientX: (x + .5) / 16 * 480, clientY: (y + .5) / 16 * 360 }, extra));
  const key = (value, extra = {}) => { const event = canvas().dispatch('keydown', { key: value, ...extra }); frame(); return event; };
  const stroke = (x = 0, y = 0, toX = x, toY = y, end = 'pointerup') => { pointer('pointerdown', 1, x, y); pointer('pointermove', 1, toX, toY); pointer(end, 1, toX, toY); frame(); };
  const emit = (name, values = {}) => {
    const event = Object.assign({ type: name, target: document, currentTarget: document, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; this.immediate = true; } }, values);
    const listeners = [...documentEvents.get(name) || []];
    // 同一document的capture监听按注册顺序执行；stopPropagation不会跳过该阶段其它监听。
    for (const capture of [true, false]) { if (!capture && event.stopped) break; for (const fn of listeners.filter(value => documentCapture.get(value) === capture)) { if (!(documentEvents.get(name) || []).includes(fn)) continue; fn(event); if (event.immediate) return event; } }
    return event;
  };
  return { G, context, document, dialogs, sounds, toasts, paints, downloads, updateOptions, frames, current, query, all, text, frame, button, click, open, canvas, pixels, pointer, stroke, key, emit, focusCalls, selected, buildCalls, documentEvents, observers, controlCloses: () => controlCloses };
}

const editor = e => e.open({ mode:'editor' });
const detail = async (e, id = 'one') => { await e.open(); await e.click(e.query('[aria-label="查看画作：小画 ' + id + '"]') || e.all('.creative-art-card').find(node => node.getAttribute('aria-label').includes('小画 ' + id))); };
const nameInput = e => e.query('.creative-name-input');
const color = (e, code) => e.click(e.query('[data-creative-color="' + code + '"]'));
const renameInput = e => e.query('input');

test('真实空画册、容量与错误重试，不用示例作品填空', async () => {
  const e = harness(); await e.open(); assert.equal(e.all('.creative-art-card').length,0); assert.match(e.text(), /0 \/ 20/); assert.match(e.text(), /画册还是空的/);
  const read = e.G.sys.creative.list; e.G.sys.creative.list = () => { throw Error('合成读取失败'); }; await e.open(); assert.match(e.text(), /暂时没能打开/); assert.ok(e.button('重新读取画册')); e.G.sys.creative.list=read; await e.click('重新读取画册'); assert.match(e.text(), /第一幅画/);
});
test('未知作品返回画册并说明原因，不伪造编辑对象', async () => {
  const e = harness(); await e.open({mode:'editor',id:'missing'}); assert.equal(e.canvas(),null); assert.match(e.text(), /找不到/); assert.equal(e.G.state.customArts.length,0);
});
test('24真实色和名称全部可达，雪白与透明橡皮分开', async () => {
  const e = harness(); await editor(e); const C=e.G.data.creativeConfig; assert.equal(e.all('.creative-color').length,24);
  for(let i=0;i<24;i++){ const c=e.all('.creative-color')[i]; assert.equal(c.dataset.creativeColor,C.symbols[i]); assert.match(c.getAttribute('aria-label'),new RegExp(C.paletteNames[i])); assert.equal(c.style['--creative-color'],C.palette[i]); }
  await color(e,'6'); e.stroke(); assert.equal(e.pixels()[0],'6'); e.key('e'); e.stroke(); assert.equal(e.pixels()[0],'.'); assert.match(e.text(), /橡皮：擦回透明/);
});
test('Bresenham拖线补满对角，一整笔只占一次撤销且可重做', async () => {
  const e=harness(); await editor(e); e.stroke(0,0,15,15); const drawn=e.pixels(); for(let i=0;i<16;i++)assert.equal(drawn[i*17],'9'); assert.equal([...drawn].filter(v=>v==='9').length,16);
  await e.click('撤销'); assert.equal(e.pixels(),blank); assert.equal(e.button('撤销').disabled,true); await e.click('重做'); assert.equal(e.pixels(),drawn);
});
test('画笔忽略第二指，up/cancel/lostcapture各提交与释放', async () => {
  for(const ending of ['pointerup','pointercancel','lostpointercapture']){ const e=harness(); await editor(e); e.pointer('pointerdown',1,0,0); e.pointer('pointerdown',2,10,0); e.pointer('pointermove',2,15,0); e.pointer(ending,1,0,0); e.frame(); assert.equal(e.pixels(),'9'+blank.slice(1)); assert.equal(e.canvas().capture.size,0); e.pointer('pointermove',1,15,0); e.frame(); assert.equal(e.pixels(),'9'+blank.slice(1)); await e.click('撤销'); assert.equal(e.pixels(),blank); }
});
test('填充只走四邻，第一指持有capture时忽略第二指', async () => {
  const pattern='0'+blank.slice(1,17)+'0'+blank.slice(18),e=harness({arts:[art('one',pattern)]}); await e.open({mode:'editor',id:'one'}); e.key('f'); e.pointer('pointerdown',1,0,0); e.pointer('pointerdown',2,1,1); e.pointer('pointerup',2,1,1); e.frame(); assert.equal(e.pixels()[0],'9'); assert.equal(e.pixels()[17],'0'); assert.equal(e.canvas().capture.has(1),true); e.pointer('pointerup',1,0,0); await e.click('撤销'); assert.equal(e.pixels(),pattern);
});
test('填充与清空各可撤销，无变化不记历史', async () => {
  const e=harness(); await editor(e); e.key('f'); e.stroke(); assert.equal(e.pixels(),'9'.repeat(256)); e.stroke(); await e.click('撤销'); assert.equal(e.pixels(),blank); assert.equal(e.button('撤销').disabled,true); await e.click('重做'); await e.click('清空画布'); assert.equal(e.pixels(),blank); await e.click('撤销'); assert.equal(e.pixels(),'9'.repeat(256));
});
test('50步历史上限，Ctrl/Meta Z/ShiftZ/Y与新操作清redo', async () => {
  const e=harness(); await editor(e); for(let i=0;i<55;i++)e.stroke(i%16,Math.floor(i/16)); for(let i=0;i<50;i++)e.key('z',{ctrlKey:true}); assert.equal([...e.pixels()].filter(v=>v==='9').length,5); assert.equal(e.button('撤销').disabled,true);
  e.key('Z',{metaKey:true,shiftKey:true}); assert.equal([...e.pixels()].filter(v=>v==='9').length,6); e.key('y',{ctrlKey:true}); assert.equal([...e.pixels()].filter(v=>v==='9').length,7); e.stroke(15,15); assert.equal(e.button('重做').disabled,true);
});
test('箭头、Space/Enter、B/E/F与Delete/Backspace均限定画布焦点', async () => {
  const e=harness(); await editor(e); for(let i=0;i<20;i++)e.key('ArrowLeft'); e.key('ArrowRight'); e.key('ArrowDown'); e.key('Enter'); assert.equal(e.pixels()[17],'9'); e.key('Delete'); assert.equal(e.pixels()[17],'.'); e.key(' '); e.key('Backspace'); assert.equal(e.pixels()[17],'.'); e.key('f'); assert.match(e.text(),/填充颜色/); e.key('b'); assert.match(e.text(),/画笔颜色/);
  const before=e.pixels(),input=nameInput(e); input.focus(); for(const k of ['b','e','f','Delete','Enter','z']){ input.dispatch('keydown',{key:k,ctrlKey:k==='z'}); e.canvas().dispatch('keydown',{key:k,target:input}); } e.frame(); assert.equal(e.pixels(),before);
});
test('名字按20 Unicode码点，IME不截断、不保存、capture Escape不关窗', async () => {
  const e=harness(); await editor(e); const input=nameInput(e),handle=e.current(); input.focus(); input.dispatch('compositionstart'); input.value='🌷'.repeat(21); input.dispatch('input',{isComposing:true}); assert.equal([...input.value].length,21); await e.click('保存画作'); assert.equal(e.G.state.customArts.length,0);
  for(const flag of [true,false]){ const ev=e.emit('keydown',{target:input,key:'Escape',isComposing:flag}); assert.equal(e.current(),handle); assert.equal(ev.immediate,true); assert.equal(ev.defaultPrevented,false); }
  input.dispatch('compositionend'); e.frame(); assert.equal([...input.value].length,20); assert.equal(input.maxLength,40); await e.click('保存画作'); assert.equal([...e.G.state.customArts[0].name].length,20); assert.match(e.text(),/20 \/ 20字/);
});
test('改名的IME Enter/Escape与空名错误保持原作品', async () => {
  const e=harness({arts:[art()]}); await detail(e); await e.click('改名字'); const input=renameInput(e),before=JSON.stringify(e.G.state); input.dispatch('compositionstart'); input.value='🌸'.repeat(21); input.dispatch('input',{isComposing:true}); assert.equal(input.dispatch('keydown',{key:'Enter',isComposing:true}).defaultPrevented,true); await e.click('收好名字'); assert.equal(JSON.stringify(e.G.state),before); assert.equal(e.emit('keydown',{target:input,key:'Escape'}).immediate,true);
  input.dispatch('compositionend'); assert.equal([...input.value].length,20); input.value=' \n '; input.dispatch('input'); await e.click('收好名字'); assert.equal(e.G.state.customArts[0].name,'小画 one'); assert.equal(input.getAttribute('aria-invalid'),'true'); input.value='  新名字🌷  '; input.dispatch('input'); await e.click('收好名字'); assert.equal(e.G.state.customArts[0].name,'新名字🌷');
});
test('关闭留本页草稿和光标，重开续画但历史丢弃', async () => {
  const e=harness(); await editor(e); const old=e.canvas(); e.stroke(4,5); nameInput(e).value=''; nameInput(e).dispatch('input'); e.current().close(); assert.equal(old.width,1); assert.equal(e.document.body.classList.contains('is-creating'),false); assert.equal(e.G.runtime.creativeDrafts.new.name,''); await editor(e); assert.equal(e.pixels()[84],'9'); assert.equal(nameInput(e).value,''); assert.equal(e.button('撤销').disabled,true); assert.match(e.text(),/第5列，第6行/);
});
test('new与各作品ID草稿隔离，保存成功仅清对应草稿且原位编辑', async () => {
  const e=harness({arts:[art('one'),art('two')]}); await editor(e); e.stroke(2,2); e.current().close(); await e.open({mode:'editor',id:'one'}); e.stroke(3,3); e.current().close(); await e.open({mode:'editor',id:'two'}); e.stroke(4,4); e.current().close(); assert.ok(e.G.runtime.creativeDrafts.new); assert.ok(e.G.runtime.creativeDrafts['art:one']); assert.ok(e.G.runtime.creativeDrafts['art:two']); await e.open({mode:'editor',id:'one'}); await e.click('保存修改'); assert.equal(e.G.state.customArts.length,2); assert.equal(e.G.state.customArts[0].id,'one'); assert.equal(e.G.runtime.creativeDrafts['art:one'],undefined); assert.ok(e.G.runtime.creativeDrafts.new); assert.ok(e.G.runtime.creativeDrafts['art:two']);
});
test('本机持久拒写保留草稿与原画/引用/统计，不发成功事件', async () => {
  const e=harness({arts:[art()]}); await e.open({mode:'editor',id:'one'}); e.stroke(5,5); const before=JSON.stringify(e.G.state),events=[]; e.G.bus.on('creative:changed',v=>events.push(v)); e.context.localStorage.setItem=()=>{throw Error('QuotaExceededError');}; await e.click('保存修改'); assert.equal(JSON.stringify(e.G.state),before); assert.equal(events.length,0); assert.equal(e.sounds.includes('success'),false); assert.equal(e.G.runtime.creativeDrafts['art:one'].pixels[85],'9'); assert.match(e.text(),/暂时没能放进存档/); assert.equal(e.updateOptions.at(-1).persist,true); e.context.localStorage.setItem=()=>{}; await e.click('保存修改'); assert.equal(e.G.state.customArts[0].pixels[85],'9'); assert.equal(e.G.runtime.creativeDrafts['art:one'],undefined);
});
test('满20幅禁止新建但允许已有ID编辑，不增加副本', async () => {
  const e=harness({arts:Array.from({length:20},(_,i)=>art('art'+i))}); await e.open(); assert.equal(e.button('画一幅').disabled,true); await e.open({mode:'editor'}); assert.equal(e.canvas(),null); assert.match(e.text(),/20幅/); await e.open({mode:'editor',id:'art0'}); e.stroke(1,1); await e.click('保存修改'); assert.equal(e.G.state.customArts.length,20); assert.equal(e.G.state.customArts[0].pixels[17],'9');
});
test('低等级/缺画室有下一步，旧画仍能看下载删除而编辑/改名禁用', async () => {
  const e=harness({locked:true,arts:[art()]}); await e.open(); assert.match(e.text(),/Lv.7/); assert.equal(e.button('画一幅').disabled,true); await detail(e); assert.equal(e.button('编辑画作').disabled,true); assert.equal(e.button('改名字').disabled,true); await e.click('下载PNG'); assert.equal(e.downloads.length,1); assert.ok(e.button('删除作品')); e.G.store.update(s=>{s.level=7;}); await e.open(); assert.match(e.text(),/先建一间画室/); await e.click('去建画室'); assert.equal(e.buildCalls[0][0],'build'); assert.equal(e.buildCalls[0][1].roomType,'studio');
});
test('已存ID下载与当前草稿分离，保存后的新作品也可下载', async () => {
  const e=harness(); await editor(e); assert.equal(e.button('下载已存PNG').disabled,true); e.stroke(); await e.click('保存画作'); const saved=e.G.state.customArts[0],count=e.G.state.customArts.length; e.stroke(1,1); assert.match(e.text(),/当前草稿不含在PNG/); const start=e.paints.length; await e.click('下载已存PNG'); const exported=e.paints.slice(start).find(v=>v.pixels===saved.pixels); assert.ok(exported); assert.equal(e.downloads.length,1); assert.equal(e.G.state.customArts.length,count); assert.equal(e.G.state.customArts[0].pixels,saved.pixels);
});
test('下载失败可重试，旧异步在关闭/换档/重开后不污染窗口', async () => {
  const e=harness({arts:[art()]}); await detail(e); e.G.sys.creative.download=()=>Promise.reject(Error('合成失败')); await e.click('下载PNG'); assert.equal(e.button('下载PNG').disabled,false); assert.match(e.toasts.at(-1),/没有下载成功/);
  for(const transition of ['close','replace','reopen']){ await detail(e); const wait=deferred(); e.G.sys.creative.download=()=>wait.promise; e.button('下载PNG').click(); assert.ok(e.button('正在准备PNG…').disabled); if(transition==='replace')e.G.bus.emit('state:replace',{}); else if(transition==='close')e.current().close(); else await e.open(); const current=e.current(),toasts=e.toasts.length; wait.resolve({ok:true,message:'旧成功不应冒出'}); await flush(); assert.equal(e.current(),current); assert.equal(e.toasts.length,toasts); }
});
test('删除必须确认，取消不变，确认清全部引用并保留墙纸底色', async () => {
  const e=harness({arts:[art()]}),room=Object.keys(e.G.state.house.rooms)[0]; assert.ok(e.G.sys.creative.place('one',room).ok); assert.ok(e.G.sys.creative.wallpaper(room,'one').ok); const wallpaper=plain(e.G.state.house.rooms[room].wallpaper),before=JSON.stringify(e.G.state); await detail(e); await e.click('删除作品'); assert.match(e.text(),/挂画|恢复纯色/); assert.match(e.text(),/保留原来的底色/); assert.equal(JSON.stringify(e.G.state),before); await e.click('保留作品'); assert.equal(JSON.stringify(e.G.state),before); await e.click('删除作品'); await e.click('确认删除作品'); assert.equal(e.G.state.customArts.length,0); assert.equal(e.G.sys.creative.placement('one'),null); assert.equal(e.G.state.house.rooms[room].wallpaper.pattern,'solid'); assert.equal(e.G.state.house.rooms[room].wallpaper.color,wallpaper.color); assert.equal(e.G.state.house.rooms[room].wallpaper.color2,wallpaper.color2);
});
test('删除持久拒写停在确认错误态，换档关闭确认且旧按钮失效', async () => {
  const e=harness({arts:[art()]}); await detail(e); await e.click('删除作品'); const before=JSON.stringify(e.G.state); e.context.localStorage.setItem=()=>{throw Error('QuotaExceededError');}; await e.click('确认删除作品'); assert.equal(JSON.stringify(e.G.state),before); assert.match(e.text(),/暂时没能放进存档/); assert.equal(e.sounds.includes('success'),false); const stale=e.button('确认删除作品'); e.G.bus.emit('state:replace',{}); assert.equal(e.current(),undefined); e.context.localStorage.setItem=()=>{}; stale.click(); assert.equal(e.G.state.customArts.length,1);
});
test('挂墙沿既有camera/selection链，已挂作品提供定位且不重复放置', async () => {
  const e=harness({arts:[art()]}),events=[]; e.G.bus.on('item:placed',v=>events.push(v)); await detail(e); await e.click('装框挂墙'); const placed=e.G.sys.creative.placement('one'); assert.equal(e.focusCalls.at(-1),placed.roomId); assert.equal(e.G.runtime.selected.uid,placed.uid); assert.equal(e.G.runtime.mode,'explore'); assert.equal(e.selected.at(-1).uid,placed.uid); assert.equal(events.length,1); await detail(e); assert.equal(e.button('这幅已挂好了').disabled,true); await e.click('看看墙上这幅'); assert.equal(events.length,1); assert.equal(e.focusCalls.at(-1),placed.roomId);
});
test('墙纸同ID幂等，编辑后引用仍指向同一作品', async () => {
  const e=harness({arts:[art()]}); await detail(e); await e.click('铺成墙纸'); const room=e.focusCalls.at(-1),stat=e.G.state.quests.stats.wallpaperChanges; await detail(e); await e.click('铺成墙纸'); assert.equal(e.G.state.quests.stats.wallpaperChanges,stat); await e.open({mode:'editor',id:'one'}); e.stroke(6,6); await e.click('保存修改'); assert.equal(e.G.state.house.rooms[room].wallpaper.artId,'one'); assert.equal(e.G.state.customArts.length,1);
});
test('关闭/换档释放监听、RAF、capture和HUD；其它模块窗口不受旧护栏影响', async () => {
  const e=harness(); await editor(e); const canvas=e.canvas(),input=nameInput(e); e.pointer('pointerdown',1,0,0); input.dispatch('compositionstart'); e.G.bus.emit('state:replace',{}); assert.equal(e.current(),undefined); assert.equal(e.G.runtime.creativeDrafts,undefined); assert.equal(e.document.body.classList.contains('is-creating'),false); assert.equal(canvas.width,1); assert.equal(canvas.capture.size,0); const count=e.paints.length; e.frame(); assert.equal(e.paints.length,count); assert.equal((e.documentEvents.get('keydown')||[]).length,0);
  const other=e.G.ui.modal({title:'其它模块',content:e.document.createElement('p')}); e.G.bus.emit('state:replace',{}); assert.equal(other.element.isConnected,true); e.emit('keydown',{target:input,key:'Escape',isComposing:true}); assert.equal(e.current(),undefined);
});
test('指针整笔与键盘落笔/擦除交接不产生重叠历史', async () => {
  const e=harness(); await editor(e); e.pointer('pointerdown',1,0,0); e.key('ArrowRight'); e.key('Enter'); e.pointer('pointerup',1,0,0); e.frame(); assert.equal(e.pixels(),'99'+blank.slice(2)); await e.click('撤销'); assert.equal(e.pixels(),'9'+blank.slice(1)); await e.click('撤销'); assert.equal(e.pixels(),blank); assert.equal(e.button('撤销').disabled,true);
  e.pointer('pointerdown',1,0,0); e.key('Delete'); e.pointer('pointerup',1,0,0); e.frame(); assert.equal(e.pixels(),blank); await e.click('撤销'); assert.equal(e.pixels(),'9'+blank.slice(1)); await e.click('撤销'); assert.equal(e.pixels(),blank);
});
test('画册与详情取消按需RAF并释放Canvas，不留旧预览绘制', async () => {
  const e=harness({arts:[art()]}); e.G.ui.creative.open(); const old=e.all('canvas'); assert.equal(old.length,1); e.current().close(); const before=e.paints.length; e.frame(); assert.equal(e.paints.length,before); assert.equal(old[0].width,1);
  await detail(e); const canvas=e.query('.creative-detail-art'); e.current().close(); e.frame(); assert.equal(canvas.width,1);
});
test('画布按真实可用宽高等比适配，矮桌面不靠视口减常数且关闭断开observer', async () => {
  const e=harness(); await editor(e); const stage=e.query('.creative-canvas-stage'),surface=e.query('.creative-canvas-surface'),observer=e.observers.at(-1); assert.equal(observer.node,stage);
  for(const [width,height,expected] of [[600,340,320],[280,600,276],[700,900,512]]){stage.clientWidth=width;stage.clientHeight=height;observer.fn();assert.equal(surface.style['--creative-canvas-size'],expected+'px');}
  e.current().close(); assert.equal(observer.disconnected,true); const size=surface.style['--creative-canvas-size']; observer.fn(); assert.equal(surface.style['--creative-canvas-size'],size);
});
test('公开open切画册先收草稿，首屏立即显示继续/已有ID草稿状态', async () => {
  const e=harness({arts:[art()]}); await editor(e); e.stroke(2,2); await e.open(); assert.ok(e.button('继续草稿')); assert.match(e.text(),/有一幅还没收好的草稿/);
  await e.open({mode:'editor',id:'one'}); e.stroke(3,3); await e.open(); assert.match(e.all('.creative-art-card')[0].getAttribute('aria-label'),/有未保存草稿/);
});
(async()=>{for(const [name,fn]of tests){await fn();console.log('✓ '+name);}console.log('\n'+tests.length+' 组创意UI定向检查通过（轻DOM/合成输入，不代表正式整页或触屏验收）。');})().catch(error=>{console.error(error);process.exitCode=1;});
