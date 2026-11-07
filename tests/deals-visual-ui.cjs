'use strict';
// MC-068：合成档案/人工本地日期/内存DOM；不启动服务或浏览器，不载scene和私人存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push([name, fn]);
function harness() {
  let clock = new Date(2026, 9, 30, 12).getTime(), denyWrite = false, nextFrame = 0, booting = true, resetScrollOnRender = false;
  const frames = new Map(), storage = new Map(), audio = [], toasts = [], draws = [], cancelled = [], observers = new Set();
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this._disabled = false; this.scrollTop = 0; this._text = ''; this.style = {}; }
    get disabled() { return this._disabled; }
    set disabled(value) { this._disabled = !!value; if (value && document.activeElement === this) document.activeElement = document.body; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    append(...nodes) { nodes.forEach(node => { node.remove(); this.children.push(node); node.parentElement = this; }); }
    remove() { if (this.parentElement) { if (this.contains(document.activeElement)) document.activeElement = document.body; this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; } }
    replaceChildren(...nodes) { this.children.forEach(node => { if (node.contains(document.activeElement)) document.activeElement = document.body; node.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
    dispatch(name) { (this.listeners.get(name) || []).forEach(fn => fn({ target: this })); }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus(options) { if (this.isConnected && !this.disabled && !this.hidden) { document.activeElement = this; this.focusOptions = options; } }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return selector.slice(1).split('.').every(name => this.classList.contains(name));
      const attr = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
      if (attr) return attr[1].startsWith('data-') ? this.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === attr[2] : this.getAttribute(attr[1]) === attr[2];
      return selector === '*' || this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => names.forEach(name => { if (!this.classList.contains(name)) this.className += ' ' + name; }), remove: (...names) => { this.className = this.className.split(/\s+/).filter(c => !names.includes(c)).join(' '); } }; }
    getContext() { if (!this.ctx) this.ctx = { cleared: 0, clearRect() { this.cleared++; } }; return this.ctx; }
  }
  class Observer { constructor(fn) { this.fn = fn; } observe() { observers.add(this); } disconnect() { observers.delete(this); } }
  const document = { body: null, activeElement: null, createElement: tag => new Node(tag), getElementById: id => document.body.querySelector('#' + id), querySelector: selector => document.body.querySelector(selector), addEventListener() {} };
  document.body = new Node('body'); document.activeElement = document.body;
  const host = new Node('section'), panelBody = new Node('div'); host.id = 'panel'; host.className = 'hidden'; host.dataset.kind = 'shop'; panelBody.id = 'panel-body'; host.append(panelBody); document.body.append(host);
  const RealDate = Date; class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, document, MutationObserver: Observer, Blob, URL, Date: TestDate,
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame: id => { cancelled.push(id); frames.delete(id); },
    setTimeout: () => 1, clearTimeout() {}, setInterval() { if (!booting) throw new Error('不得新增轮询'); return 1; }, clearInterval() {} });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (denyWrite) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  const files = ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/creative.js','js/data/gifts.js','js/data/deals.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js','js/systems/deals.js','js/systems/systems.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(); G.sys.init(); booting = false;
  G.audio = { play: value => audio.push(value) }; G.render = { drawThumbnail: (canvas, id) => draws.push({ canvas, id }) };
  G.ui = { toast: value => toasts.push(value), panel: { close() { host.className = 'hidden'; G.bus.emit('panel:change', { open: false }); } } };
  for (const file of ['js/ui/furniture-rarity.js','js/ui/deals.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const observe = () => [...observers].forEach(observer => observer.fn([]));
  function render() { const focused = document.activeElement, key = focused.dataset.uiFocus, content = G.ui.deals.content(); host.className = ''; host.dataset.kind = 'shop'; panelBody.replaceChildren(content); if (resetScrollOnRender) panelBody.scrollTop = 0; if (key) panelBody.querySelector('[data-ui-focus="' + key + '"]')?.focus({ preventScroll: true }); observe(); return content; }
  const cards = () => panelBody.querySelectorAll('.deal-card'), ids = () => cards().map(card => card.querySelector('canvas').dataset.dealFurniture);
  const button = (id = ids()[0]) => panelBody.querySelector('[data-ui-focus="deals-buy-' + id + '"]');
  const message = () => panelBody.querySelector('.deal-message'), retry = () => panelBody.querySelector('.deal-retry');
  const flush = () => { observe(); const batch = [...frames]; frames.clear(); batch.forEach(([,fn]) => fn()); observe(); };
  const allFrames = () => { let n = 0; while (frames.size) { assert.ok(++n < 10, '不得持续RAF'); flush(); } };
  const click = id => { const node = button(id); node.focus(); node.click(); allFrames(); return node; };
  const at = date => { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], 12).getTime(); };
  const wealthy = () => G.store.update(s => { s.level = 30; s.wallet.coin = 12480; s.tutorial.done = true; });
  function queuedRefresh() { let pending = false; G.bus.on('state:change', () => { if (pending) return; pending = true; context.requestAnimationFrame(() => { pending = false; if (!host.classList.contains('hidden') && host.dataset.kind === 'shop') render(); }); }); }
  return { G, Node, document, context, frames, observers, host, panelBody, storage, audio, toasts, draws, cancelled, render, cards, ids, button, message, retry, flush, allFrames, click, at, wealthy, parse, observe, queuedRefresh, resetScroll() { resetScrollOnRender = true; }, writeFails(value) { denyWrite = value; } };
}
const plain = value => JSON.parse(JSON.stringify(value));
function spy(e) { const original = e.G.sys.economy.buy, calls = []; e.G.sys.economy.buy = (...args) => { calls.push(args); return original(...args); }; return calls; }
function setup() { const e = harness(); e.wealthy(); e.render(); e.allFrames(); return e; }

test('唯一content接口；真实10-30六件/价格/主题/库存/Canvas/稀有度，查询不写档', () => {
  const e = harness(); e.wealthy(); const before = JSON.stringify(e.G.state); e.render(); e.allFrames(); assert.deepEqual(Object.keys(e.G.ui.deals), ['content']);
  const state = e.G.sys.deals.status(); assert.equal(state.date, '2026-10-30'); assert.equal(e.cards().length, 6); assert.deepEqual(e.ids(), plain(state.items.map(item => item.id))); assert.equal(JSON.stringify(e.G.state), before);
  state.items.forEach((entry,i) => { const card = e.cards()[i]; assert.ok(card.textContent.includes(entry.definition.name)); assert.ok(card.textContent.includes(e.G.data.themes[entry.definition.theme].name)); assert.ok(card.textContent.includes('原价 ' + entry.originalPrice)); assert.ok(card.textContent.includes(entry.price + ' 糖')); assert.match(card.textContent, /背包 0 件/); assert.equal(card.querySelector('canvas').dataset.furniture, undefined); assert.ok(card.querySelector('.furniture-rarity-badge')); assert.equal(e.draws[i].id, entry.id); });
  assert.equal(e.frames.size, 0); assert.match(e.panelBody.textContent, /本地日期 2026-10-30/);
});
test('连续买同件持久提交；目录/原DOM/焦点与滚动保留，无每日限购', () => {
  const e = setup(), calls = spy(e), id = e.ids()[0], ids = e.ids(), node = e.button(id), coin = e.G.state.wallet.coin, price = e.G.sys.deals.priceFor(id); e.panelBody.scrollTop = 137;
  e.click(id); e.click(id); assert.equal(e.button(id), node); assert.equal(calls.length, 2); assert.deepEqual(calls[0], [id,price]); assert.deepEqual(e.ids(), ids); assert.equal(e.G.state.wallet.coin, coin - price * 2); assert.equal(e.G.state.inventory[id], 2); assert.equal(e.G.state.collection[id], true); assert.equal(e.G.state.quests.stats.bought, 2); assert.ok(e.G.state.exp > 0); assert.equal(e.G.state.memories.length > 0, true);
  const disk = JSON.parse(e.storage.get(e.G.data.balance.saveKey)); assert.equal(disk.inventory[id], 2); assert.equal(disk.wallet.coin, coin - price * 2); assert.equal(disk.collection[id], true); assert.equal(disk.quests.stats.bought, 2); assert.equal(e.audio.length, 2); assert.equal(e.toasts.length, 2); assert.equal(e.document.activeElement, node); assert.equal(node.focusOptions.preventScroll, true); assert.equal(e.panelBody.scrollTop, 137); assert.equal(e.draws.length, 6);
});
test('Lv6锁定、低预算与9999全文可读并禁用，升级不换目录', () => {
  const e = setup(), ids = e.ids(), id = ids[0]; e.G.store.update(s => { s.level = 6; s.garden.plots = Array(6).fill(null); s.wallet.coin = 0; s.inventory[id] = 9999; }); e.render(); e.allFrames(); assert.deepEqual(e.ids(), ids);
  const locked = e.G.sys.deals.list().find(item => item.locked); assert.ok(locked); assert.equal(e.button(locked.id).disabled, true); assert.ok(e.panelBody.textContent.includes(locked.reason));
  e.wealthy(); e.render(); e.allFrames(); assert.match(e.cards()[0].textContent, /9,999|9999/); assert.match(e.cards()[0].textContent, /已经装满/); assert.equal(e.button(id).disabled, true);
  e.G.store.update(s => { s.inventory[id] = 0; s.wallet.coin = 40; }); e.render(); e.allFrames(); const item = e.G.sys.deals.list()[0]; assert.ok(e.cards()[0].textContent.includes(item.reason)); assert.equal(e.button(id).disabled, true);
});
test('渲染后资格变化点击重读，不委托过期的预算/锁定/满格购买', () => {
  for (const mode of ['budget','level','full']) { const e = setup(), id = e.ids()[0], calls = spy(e); e.G.store.update(s => { if (mode === 'budget') s.wallet.coin = 0; if (mode === 'level') { s.level = 1; s.garden.plots = Array(6).fill(null); } if (mode === 'full') s.inventory[id] = 9999; }); e.click(id); assert.equal(calls.length, 0); assert.equal(e.button(id).disabled, true); assert.equal(e.document.activeElement, e.message()); assert.equal(e.audio.length, 0); }
});
test('折后余额刚好买完，焦点转可读反馈；整理后重新读取可继续买', () => {
  const e = setup(), id = e.ids()[0], price = e.G.sys.deals.priceFor(id); e.G.store.update(s => { s.wallet.coin = price; }); e.click(id); assert.equal(e.G.state.wallet.coin, 0); assert.equal(e.button(id).disabled, true); assert.equal(e.document.activeElement, e.message()); assert.equal(e.message().getAttribute('role'), 'status');
  e.G.store.update(s => { s.wallet.coin = 500; }); e.retry().focus(); e.retry().click(); e.allFrames(); assert.equal(e.button(id).disabled, false); assert.equal(e.document.activeElement, e.retry()); e.click(id); assert.equal(e.G.state.inventory[id], 2);
});
test('9998连续买到9999焦点落反馈，重复/旧按钮不再扣款', () => {
  const e = setup(), id = e.ids()[0]; e.G.store.update(s => { s.inventory[id] = 9998; }); e.render(); e.allFrames(); const node = e.button(id), calls = spy(e); e.click(id); const coin = e.G.state.wallet.coin; assert.equal(e.G.state.inventory[id], 9999); assert.equal(e.document.activeElement, e.message()); assert.equal(node.disabled, true); node.dispatch('click'); assert.equal(calls.length, 1); assert.equal(e.G.state.wallet.coin, coin);
});
test('真实setItem拒写，内存与磁盘完整保持；失败无音效且可原位重试', () => {
  const e = setup(), id = e.ids()[0]; assert.ok(e.G.save.flush()); const before = JSON.stringify(e.G.state), disk = e.storage.get(e.G.data.balance.saveKey); e.panelBody.scrollTop = 141; e.writeFails(true); e.click(id);
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.storage.get(e.G.data.balance.saveKey), disk); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); assert.equal(e.button(id).disabled, false); assert.equal(e.document.activeElement, e.button(id)); assert.equal(e.message().getAttribute('role'), 'alert'); assert.equal(e.panelBody.scrollTop, 141);
  e.render(); e.allFrames(); assert.equal(e.document.activeElement, e.button(id)); assert.equal(e.message().getAttribute('role'), 'alert'); e.writeFails(false); e.click(id); assert.equal(e.G.state.inventory[id], 1); assert.equal(e.audio.length, 1);
});
test('实际存档容量拒绝也无成功，恢复后继续买', () => {
  const e = setup(), before = JSON.stringify(e.G.state), limit = e.G.data.balance.maxSaveBytes; e.G.data.balance.maxSaveBytes = 1; e.click(); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0); assert.equal(e.button().disabled, false); e.G.data.balance.maxSaveBytes = limit; e.click(); assert.equal(e.audio.length, 1);
});
test('10-30午夜旧卡先刷10-31六件，本次不调用buy且不扣款', () => {
  const e = setup(), old = e.button(), calls = spy(e), before = JSON.stringify(e.G.state), ids = e.ids(); e.at('2026-10-31'); old.focus(); old.click(); e.allFrames(); assert.equal(calls.length, 0); assert.equal(JSON.stringify(e.G.state), before); assert.notDeepEqual(e.ids(), ids); assert.deepEqual(e.ids(), plain(e.G.sys.deals.list().map(item => item.id))); assert.match(e.message().textContent, /这次没有购买/); assert.equal(e.document.activeElement, e.message()); assert.equal(old.disabled, true); old.dispatch('click'); assert.equal(calls.length, 0); assert.equal(e.audio.length, 0);
});
test('同日实际priceFor变化也先刷新报价，不静默购买；下次才用新价', () => {
  const e = setup(), id = e.ids()[0], original = e.G.data.furnitureById[id].price, calls = spy(e), before = JSON.stringify(e.G.state); e.G.data.furnitureById[id].price = original + 11; e.click(id); assert.equal(calls.length, 0); assert.equal(JSON.stringify(e.G.state), before); assert.ok(e.cards()[0].textContent.includes(e.G.sys.deals.priceFor(id) + ' 糖')); e.click(id); assert.equal(calls.length, 1); assert.equal(calls[0][1], e.G.sys.deals.priceFor(id));
});
test('回看10-29/10-30日期可复现，无回拨限购或存档写入', () => {
  const e = setup(), ids = e.ids(), before = JSON.stringify(e.G.state); e.at('2026-10-29'); e.retry().click(); e.allFrames(); assert.notDeepEqual(e.ids(), ids); assert.deepEqual(e.ids(), plain(e.G.sys.deals.list('2026-10-29').map(item => item.id))); e.at('2026-10-30'); e.retry().click(); e.allFrames(); assert.deepEqual(e.ids(), ids); assert.equal(JSON.stringify(e.G.state), before);
});
test('庭院日期读真实主题/前院与家具缩略图，完整池不复制原型', () => {
  const e = setup(); let found; for (let day = 1; day <= 31; day++) { const date = '2026-10-' + String(day).padStart(2,'0'); if (e.G.sys.deals.list(date).some(item => item.definition.place === 'yard')) { found = date; break; } } assert.ok(found); e.at(found); e.retry().click(); e.allFrames(); const entry = e.G.sys.deals.list().find(item => item.definition.place === 'yard'); assert.ok(e.cards().find(card => card.querySelector('canvas').dataset.dealFurniture === entry.id).textContent.includes('前院')); assert.equal(e.draws.at(-6 + e.ids().indexOf(entry.id)).id, entry.id);
});
test('宿主state:change排RAF重建：一次购买/回执/焦点/滚动跨content保持', () => {
  const e = setup(), id = e.ids()[0], calls = spy(e), old = e.button(id); e.queuedRefresh(); e.resetScroll(); e.panelBody.scrollTop = 163; e.click(id); assert.equal(calls.length, 1); assert.notEqual(e.button(id), old); assert.equal(e.document.activeElement, e.button(id)); assert.equal(e.panelBody.scrollTop, 163); assert.match(e.message().textContent, /已收进/); assert.equal(e.audio.length, 1); assert.equal(old.disabled, true);
});
test('宿主重建后预算耗尽/9999的禁用按钮焦点均落到反馈', () => {
  for (const mode of ['budget','full']) { const e = setup(), id = e.ids()[0]; e.G.store.update(s => { if (mode === 'budget') s.wallet.coin = e.G.sys.deals.priceFor(id); else s.inventory[id] = 9998; }); e.render(); e.allFrames(); e.queuedRefresh(); e.click(id); assert.equal(e.button(id).disabled, true); assert.equal(e.document.activeElement, e.message()); assert.equal(e.message().focusOptions.preventScroll, true); }
});
test('同步state刷新继承购买位置：同款按钮或禁用反馈与真实滚动均保持', () => {
  for (const mode of ['ready','budget','full']) { const e = setup(), id = e.ids()[0], calls = spy(e); e.G.store.update(s => { if (mode === 'budget') s.wallet.coin = e.G.sys.deals.priceFor(id); if (mode === 'full') s.inventory[id] = 9998; }); e.render(); e.allFrames(); e.resetScroll(); e.panelBody.scrollTop = 149; e.G.bus.on('state:change', () => e.render()); e.click(id); assert.equal(calls.length, 1); assert.equal(e.document.activeElement, mode === 'ready' ? e.button(id) : e.message()); assert.equal(e.panelBody.scrollTop, 149); assert.equal(e.button(id).disabled, mode !== 'ready'); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); }
});
test('同步state/item事件重入旧按钮或新content，系统最多委托一次', () => {
  const e = setup(), id = e.ids()[0], old = e.button(id), calls = spy(e); e.G.bus.on('state:change', () => old.dispatch('click')); e.G.bus.on('item:bought', () => { old.dispatch('click'); }); e.click(id); assert.equal(calls.length, 1);
  const f = setup(), nextCalls = spy(f); f.G.bus.on('item:bought', () => { f.render(); f.button().dispatch('click'); }); f.click(); assert.equal(nextCalls.length, 1); assert.equal(f.audio.length, 0); assert.equal(f.button().disabled, false);
});
test('购买同步事件关闭/重建/换档，迟到成功不播音或串到新档', () => {
  for (const mode of ['close','rebuild','replace']) { const e = setup(), fresh = e.parse(e.G.state), old = e.button(), calls = spy(e); e.G.bus.on('item:bought', () => { if (mode === 'close') e.G.ui.panel.close(); else if (mode === 'rebuild') e.render(); else e.G.store.replace(fresh); }); e.click(); old.dispatch('click'); assert.equal(calls.length, 1); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); if (mode === 'replace') assert.equal(e.G.state.quests.stats.bought, 0); }
});
test('换档使旧节点/RAF失效且清回执；新档余额不同仍同六件', () => {
  const e = setup(), ids = e.ids(); e.click(); const old = e.button(), canvas = e.cards()[0].querySelector('canvas'), fresh = e.parse(e.G.state); fresh.wallet.coin = 0; e.G.store.replace(fresh); old.dispatch('click'); assert.equal(canvas.width, 0); assert.equal(e.frames.size, 0); e.render(); e.allFrames(); assert.deepEqual(e.ids(), ids); assert.doesNotMatch(e.message().textContent, /已收进/); assert.equal(e.button().disabled, true);
});
test('content重建/抽屉关闭仍连接的旧按钮都失效并释放六Canvas', () => {
  const e = setup(), old = e.button(), canvas = e.cards().map(card => card.querySelector('canvas')), calls = spy(e); e.render(); e.allFrames(); old.dispatch('click'); assert.equal(calls.length, 0); canvas.forEach(node => { assert.equal(node.width, 0); assert.equal(node.height, 0); }); const body = e.panelBody.children[0], closed = e.button(); e.G.ui.panel.close(); assert.equal(body.isConnected, true); closed.dispatch('click'); assert.equal(calls.length, 0); assert.equal(e.frames.size, 0); assert.equal(e.observers.size, 0);
});
test('移除/隐藏任意祖先、切别面板：观察清理，不依靠持续轮询', () => {
  for (const mode of ['remove','hidden','style','kind']) { const e = setup(), button = e.button(), canvas = e.cards()[0].querySelector('canvas'), calls = spy(e); if (mode === 'remove') e.panelBody.replaceChildren(); if (mode === 'hidden') e.panelBody.hidden = true; if (mode === 'style') e.panelBody.style.display = 'none'; if (mode === 'kind') { e.host.dataset.kind = 'settings'; e.G.bus.emit('panel:change', {}); } e.observe(); button.dispatch('click'); assert.equal(calls.length, 0); assert.equal(canvas.width, 0); assert.equal(e.frames.size, 0); assert.equal(e.observers.size, 0); }
});
test('取消/迟到RAF不绘旧Canvas、不夺焦点；单批六张按需绘制', () => {
  const e = harness(); e.wealthy(); e.render(); const old = e.cards()[0].querySelector('canvas'), stale = [...e.frames.values()]; e.render(); stale.forEach(fn => fn()); e.allFrames(); assert.equal(old.width, 0); assert.equal(e.draws.length, 6); assert.ok(e.cancelled.length); assert.equal(e.frames.size, 0); e.retry().click(); e.allFrames(); assert.equal(e.draws.length, 6);
});
test('用户在购买后RAF前主动换焦点/滚动，不抢回购买按钮', () => {
  for (const mode of ['inside','outside','rebuild']) { const e = setup(), target = mode === 'inside' ? e.retry() : new e.Node('button'); if (mode !== 'inside') e.document.body.append(target); const node = e.button(); node.focus(); node.click(); target.focus(); e.panelBody.scrollTop = 217; if (mode === 'rebuild') e.render(); e.allFrames(); assert.equal(e.document.activeElement, target); assert.equal(e.panelBody.scrollTop, 217); }
});
test('同步购买事件主动聚焦页外控件，单次恢复不夺焦点', () => {
  const e = setup(), outside = new e.Node('button'); e.document.body.append(outside); e.G.bus.on('item:bought', () => outside.focus()); e.click(); assert.equal(e.document.activeElement, outside); assert.equal(e.G.state.quests.stats.bought, 1);
});
test('系统throw/未知返回/priceFor异常无成功，重新读取后允许重试', () => {
  for (const mode of ['throw','unknown','quote']) { const e = setup(), original = e.G.sys.economy.buy, quote = e.G.sys.deals.priceFor; if (mode === 'quote') e.G.sys.deals.priceFor = () => { throw new Error('quote'); }; else e.G.sys.economy.buy = () => { if (mode === 'throw') throw new Error('test'); }; const before = JSON.stringify(e.G.state); e.click(); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0); assert.equal(e.button().disabled, false); assert.match(e.message().textContent, /暂未确认/); e.G.sys.economy.buy = original; e.G.sys.deals.priceFor = quote; e.retry().click(); e.allFrames(); e.click(); assert.equal(e.audio.length, 1); }
});
test('status读取异常移除旧报价，重读恢复六件并可购买', () => {
  const e = setup(), original = e.G.sys.deals.status; e.G.sys.deals.status = () => { throw new Error('read'); }; e.click(); assert.equal(e.cards().length, 0); assert.equal(e.panelBody.children[0].dataset.state, 'unreadable'); assert.equal(e.document.activeElement, e.message()); assert.equal(e.retry().disabled, false); assert.equal(e.audio.length, 0); e.G.sys.deals.status = original; e.retry().click(); e.allFrames(); assert.equal(e.cards().length, 6); e.click(); assert.equal(e.audio.length, 1);
});
test('真实缩略图委托失败只降级插图，商品全文/稀有度与购买可用', () => {
  const e = harness(); e.wealthy(); e.G.render.drawThumbnail = () => { throw new Error('draw'); }; e.render(); e.allFrames(); assert.equal(e.panelBody.querySelectorAll('.deal-art-unavailable').length, 6); assert.equal(e.panelBody.querySelectorAll('.furniture-rarity-badge').length, 6); e.click(); assert.equal(e.audio.length, 1);
});
test('长名称、大数与禁买原因全文可读；具名购买控件关联原因与反馈', () => {
  const e = setup(), id = e.ids()[0], name = '很长的家具名字'.repeat(15); e.G.data.furnitureById[id].name = name; e.G.data.furnitureById[id].price = 99999999;
  e.G.store.update(s => { s.wallet.coin = 0; }); e.render(); e.allFrames();
  const product = e.cards().find(card => card.querySelector('canvas').dataset.dealFurniture === id), button = e.button(id), entry = e.G.sys.deals.status().items.find(item => item.id === id);
  assert.ok(product.textContent.includes(name)); assert.ok(product.textContent.includes(e.G.sys.deals.priceFor(id).toLocaleString('zh-CN'))); assert.ok(product.textContent.includes(entry.reason));
  assert.ok(e.panelBody.querySelector('#' + product.getAttribute('aria-labelledby')).textContent.includes(name)); assert.ok(button.getAttribute('aria-label').includes(name));
  assert.equal(button.type, 'button'); const descriptions = button.getAttribute('aria-describedby').split(/\s+/).map(value => e.panelBody.querySelector('#' + value));
  assert.ok(descriptions.every(node => node && node.textContent.trim())); assert.ok(descriptions.includes(e.message())); assert.ok(descriptions.some(node => node.textContent.includes(entry.reason)));
  assert.equal(e.message().tabIndex, -1); assert.equal(e.message().getAttribute('aria-live'), 'polite'); assert.equal(e.message().getAttribute('aria-atomic'), 'true');
  const before = JSON.stringify(e.G.state), calls = spy(e); assert.equal(button.disabled, true); button.dispatch('click'); assert.equal(calls.length, 0); assert.equal(JSON.stringify(e.G.state), before);
  const source = fs.readFileSync(path.join(root, 'js/ui/deals.js'), 'utf8'); assert.doesNotMatch(source, /setInterval|setTimeout|Math\.random|localStorage|store\.update|cottage-deals-v1|362|ui\.refresh/);
});
test('静态目录不依赖动画完成：重读恢复资格，购买立即提交且焦点落在结果', () => {
  const e = setup(), id = e.ids()[0], price = e.G.sys.deals.priceFor(id), ids = e.ids();
  e.G.store.update(s => { s.wallet.coin = 0; }); e.render(); e.allFrames(); assert.equal(e.button(id).disabled, true);
  e.G.store.update(s => { s.wallet.coin = price; }); e.retry().focus(); e.retry().click(); e.allFrames();
  assert.equal(e.document.activeElement, e.retry()); assert.equal(e.button(id).disabled, false); assert.deepEqual(e.ids(), ids); assert.equal(e.frames.size, 0);
  const stock = e.G.state.inventory[id] || 0, calls = spy(e), button = e.button(id); button.focus(); button.click();
  // 事务和回执必须在任何绘图/焦点RAF运行之前完成，减少动态不能成为购买门槛。
  assert.equal(calls.length, 1); assert.equal(e.G.state.inventory[id], stock + 1); assert.equal(e.G.state.wallet.coin, 0); assert.match(e.message().textContent, /已收进/);
  assert.equal(JSON.parse(e.storage.get(e.G.data.balance.saveKey)).inventory[id], stock + 1);
  e.allFrames(); assert.equal(e.button(id).disabled, true); assert.equal(e.document.activeElement, e.message()); assert.equal(e.message().focusOptions.preventScroll, true); assert.equal(e.frames.size, 0);
});

module.exports = { harness };
if (require.main === module) (async () => { for (const [name, fn] of tests) { await fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组今日特惠UI隔离检查通过（内存DOM/人工时钟/真实规则与拒写；不代表正式浏览器、Canvas像素或读屏设备验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
