'use strict';
// 内存DOM/Canvas只替代浏览器；规则、存档与新朋友来信均加载真实代码。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
function setup(saved) {
  const documentListeners = new Map(), windowListeners = new Map(), surfaces = [], frameCallbacks = [], toasts = [], intervals = [], dialogs = []; let clock = new Date(2026, 9, 28, 12).getTime();
  const on = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this._text = ''; this.style = {}; this.width = 900; this.height = 700; this.dataset = {}; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { node.remove(); this.children.push(node); node.parentElement = this; }); }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; } }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { on(this.listeners, name, fn); }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) (this.listeners.get('click') || []).forEach(fn => fn({ target: this })); }
    matches(selector) { if (selector.startsWith('.')) return this.classList.contains(selector.slice(1)); if (selector.startsWith('#')) return this.id === selector.slice(1); return selector === '*' || this.tagName === selector.toUpperCase(); }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: name => { if (!this.className.split(/\s+/).includes(name)) this.className += ' ' + name; }, remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); } }; }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
    getContext() {
      if (this.context) return this.context;
      let depth = 0; const calls = [], base = { globalAlpha: 1, calls, get depth() { return depth; }, save() { depth++; }, restore() { assert.ok(--depth >= 0); }, measureText(value) { return { width: [...String(value)].length * 10 }; }, createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; } };
      this.context = new Proxy(base, { get(object, property) { if (property in object) return object[property]; return (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), property + '绘图坐标必须有限'); calls.push([property, args]); }; } }); surfaces.push(this); return this.context;
    }
  }
  const document = { hidden: false, activeElement: null, body: null, createElement: tag => new Node(tag), addEventListener: (name, fn) => on(documentListeners, name, fn) };
  document.body = new Node('body'); document.getElementById = id => document.body.querySelector('#' + id); document.querySelector = selector => document.body.querySelector(selector);
  const world = new Node('main'); world.id = 'world'; const panel = new Node('section'); panel.id = 'panel'; panel.className = 'hidden'; document.body.append(world, panel);
  const RealDate = Date; class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, document, Blob, URL, Date: TestDate, performance: { now: () => 1000 }, requestAnimationFrame: fn => { frameCallbacks.push(fn); return frameCallbacks.length; }, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {}, setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {} });
  context.window = context; context.addEventListener = (name, fn) => on(windowListeners, name, fn); context.localStorage = { getItem: () => null, setItem() {} };
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/avatar.js', 'js/systems/garden.js', 'js/systems/time.js', 'js/systems/resident-wishes.js', 'js/systems/resident-life.js'].forEach(load);
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  G.ui = { toast: value => toasts.push(value), controls: { close() {} }, panel: { close() { panel.className = 'hidden'; } }, modal(options) {
    const overlay = new Node('div'); overlay.className = 'modal-backdrop'; const element = new Node('section'); element.append(options.content); overlay.append(element); document.body.append(overlay);
    const handle = { element, close() { if (!overlay.isConnected) return; overlay.remove(); options.onClose?.(); G.bus.emit('modal:closed', {}); } }; dialogs.push(handle); return handle;
  } };
  G.render = { drawCharacter() {} };
  return { G, parse, load, document, world, panel, intervals, documentListeners, surfaces, toasts, dialogs, frames() { frameCallbacks.splice(0).forEach(fn => fn(0)); }, tickVisibility() { (documentListeners.get('visibilitychange') || []).forEach(fn => fn()); }, at(date, hour = 12) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], hour).getTime(); } };
}
function home(G) {
  G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.tutorial.done = true; state.tutorial.step = 10; });
  const bedroom = G.sys.building.buildRoom(0, 0, 'bedroom').roomId, living = G.sys.building.buildRoom(0, 1, 'living').roomId;
  assert.ok(G.sys.decorating.place('bed_basic', bedroom, 15, 80).ok); assert.ok(G.sys.economy.buy('desk_lamp_strawberry').ok); const favorite = G.sys.decorating.place('desk_lamp_strawberry', bedroom, 170, 100); assert.ok(favorite.ok);
  assert.ok(G.sys.residents.invite('lily', bedroom).ok); return { bedroom, living, favorite: favorite.uid };
}
module.exports = { setup, home };
