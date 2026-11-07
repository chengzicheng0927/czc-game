'use strict';
// MC-066：真实gift/store/save + 合成档案/内存DOM/人工时钟；不载scene、不访问私人存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push([name, fn]);
function harness() {
  let clock = new Date(2026, 9, 28, 12).getTime(), denyWrite = false, frameId = 0, timerId = 0, booting = true, modal = null, randomCalls = 0, writes = 0;
  const frames = new Map(), timers = new Map(), storage = new Map(), audio = [], toasts = [], draws = [], errors = [], documentEvents = new Map(), motionEvents = new Set();
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this._hidden = false; this.disabled = false; this.scrollTop = 0; this._text = ''; this.style = { setProperty() {} }; }
    get hidden() { return this._hidden; }
    set hidden(value) { this._hidden = !!value; if (this._hidden && this.contains(document.activeElement)) document.activeElement = document.body; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    append(...nodes) { nodes.forEach(n => { n.remove(); this.children.push(n); n.parentElement = this; }); }
    prepend(...nodes) { nodes.reverse().forEach(n => { n.remove(); this.children.unshift(n); n.parentElement = this; }); }
    remove() { if (this.parentElement) { if (this.contains(document.activeElement)) document.activeElement = document.body; this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; } }
    replaceChildren(...nodes) { this.children.forEach(n => { if (n.contains(document.activeElement)) document.activeElement = document.body; n.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    contains(n) { return n === this || this.children.some(child => child.contains(n)); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(key, fn) { if (!this.listeners.has(key)) this.listeners.set(key, []); this.listeners.get(key).push(fn); }
    dispatch(key) { (this.listeners.get(key) || []).forEach(fn => fn({ target: this })); }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus(options) { if (this.isConnected && !this.disabled && !this.hidden) { document.activeElement = this; this.focusOptions = options; } }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return selector.slice(1).split('.').every(n => this.classList.contains(n));
      const attr = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
      if (attr) return attr[1].startsWith('data-') ? this.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === attr[2] : this.getAttribute(attr[1]) === attr[2];
      return selector === '*' || this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) { return this.children.flatMap(n => [n, ...n.querySelectorAll('*')]).filter(n => n.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => names.forEach(n => { if (!this.classList.contains(n)) this.className += ' ' + n; }), remove: (...names) => { this.className = this.className.split(/\s+/).filter(n => !names.includes(n)).join(' '); } }; }
  }
  const document = { hidden: false, body: null, activeElement: null, createElement: tag => new Node(tag), getElementById: id => document.body.querySelector('#' + id), querySelector: s => document.body.querySelector(s),
    addEventListener(key, fn) { if (!documentEvents.has(key)) documentEvents.set(key, new Set()); documentEvents.get(key).add(fn); }, removeEventListener(key, fn) { documentEvents.get(key)?.delete(fn); } };
  document.body = new Node('body'); document.activeElement = document.body;
  const host = new Node('section'), panelBody = new Node('div'); host.id = 'panel'; host.className = 'hidden'; panelBody.id = 'panel-body'; host.append(panelBody); document.body.append(host);
  const RealDate = Date; class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const math = Object.create(Math); math.random = () => { randomCalls++; return .37; };
  const preference = { matches: false, addEventListener: (_, fn) => motionEvents.add(fn), removeEventListener: (_, fn) => motionEvents.delete(fn) };
  const context = vm.createContext({ console: { log: console.log, error: (...args) => errors.push(args) }, document, Blob, URL, Date: TestDate, Math: math,
    requestAnimationFrame: fn => { const id = ++frameId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms, at: clock + ms }); return id; }, clearTimeout: id => timers.delete(id), setInterval() { if (!booting) throw new Error('UI不得轮询'); return 1; }, clearInterval() {} });
  context.window = context; context.addEventListener = () => {}; context.matchMedia = () => preference;
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (denyWrite) throw new Error('QuotaExceededError'); writes++; storage.set(key, value); } };
  const files = ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/gifts.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js','js/systems/systems.js','js/systems/garden.js','js/systems/avatar.js','js/systems/collection-book.js','js/systems/gifts.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(); G.sys.init(); booting = false; timers.clear(); G.audio = { play: value => audio.push(value) }; G.render = { drawThumbnail: (canvas, id) => draws.push({ canvas, id }) };
  G.ui = { controls: { close() {} }, toast: value => toasts.push(value), panel: { close() { host.className = 'hidden'; G.bus.emit('panel:change', { open: false }); } }, modal(options) {
    modal?.close(); const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), body = new Node('div'); overlay.className = 'modal-backdrop'; element.className = 'modal-card'; body.className = 'modal-body'; body.append(options.content); element.append(body); overlay.append(element); document.body.append(overlay);
    let closed = false; const handle = { element, body, close() { if (closed) return; closed = true; overlay.remove(); if (modal === handle) modal = null; options.onClose?.(); if (previous.isConnected) previous.focus(); G.bus.emit('modal:closed', {}); } }; modal = handle;
    context.requestAnimationFrame(() => body.querySelectorAll('button').find(n => !n.disabled && !n.hidden)?.focus()); return handle;
  } };
  for (const file of ['js/ui/furniture-rarity.js', 'js/ui/gifts.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const render = (kind = 'panel') => { host.className = ''; host.dataset.kind = kind === 'shop' ? 'shop' : 'gifts'; const content = kind === 'shop' ? G.ui.gifts.content() : G.ui.gifts.panel().content; panelBody.replaceChildren(content); G.bus.emit('panel:change', { open: true }); return content; };
  const rootNode = () => modal?.body || panelBody;
  const key = name => rootNode().querySelector('[data-ui-focus="gifts-' + name + '"]');
  const allFrames = () => { let n = 0; while (frames.size) { assert.ok(++n < 10, '不得持续RAF'); const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); } assert.deepEqual(errors, []); };
  const click = name => { const node = key(name); assert.ok(node, name); node.focus(); node.click(); allFrames(); return node; };
  const advance = (ms = 1251) => { clock += ms; };
  const runTimers = ms => { advance(ms); const due = [...timers].filter(([, entry]) => entry.at <= clock); due.forEach(([id, entry]) => { timers.delete(id); entry.fn(); }); };
  const hidden = value => { document.hidden = value; [...(documentEvents.get('visibilitychange') || [])].forEach(fn => fn()); };
  const motion = value => { preference.matches = value; [...motionEvents].forEach(fn => fn()); };
  return { G, document, Node, host, panelBody, rootNode, key, click, render, allFrames, frames, timers, storage, audio, toasts, draws, errors, parse, advance, runTimers, hidden, motion, preference, documentEvents, motionEvents, context,
    at(date) { const p = date.split('-').map(Number); clock = new RealDate(p[0], p[1] - 1, p[2], 12).getTime(); }, writeFails(value) { denyWrite = value; }, writes: () => writes, randomCalls: () => randomCalls, get modal() { return modal; } };
}
const text = e => e.rootNode().textContent, lobby = e => e.panelBody.querySelector('.gift-lobby'), reveal = e => e.rootNode().querySelector('.gift-reveal');
// 大厅最近回执与揭晓结果各有自己的画布；按具体对象计数，不能合并为页面绘图总数。
const canvasDraws = (e, canvas) => e.draws.filter(draw => draw.canvas === canvas);
const animationTimers = e => [...e.timers.values()].filter(t => [650, 1250].includes(t.ms));
const complete = e => e.G.store.update(s => e.G.data.giftPool(s.level).forEach(def => { s.collection[def.id] = true; }));
const spy = (e, method) => { const original = e.G.sys.gifts[method]; let count = 0; e.G.sys.gifts[method] = (...args) => { count++; return original(...args); }; return () => count; };

test('三API/弹窗/独立面板/商店content入口保持，查看不写档或开盒', () => {
  const e = harness(), before = JSON.stringify(e.G.state), calls = spy(e, 'open'), writes = e.writes(); assert.deepEqual(Object.keys(e.G.ui.gifts), ['open','panel','content']);
  e.render(); e.render('shop'); e.G.ui.gifts.open(); e.allFrames(); assert.ok(e.modal.element.classList.contains('gift-modal-card')); assert.equal(calls(), 0); assert.equal(e.writes(), writes); assert.equal(JSON.stringify(e.G.state), before);
});
test('大厅呈动态预算/未收总池/免费/累计/最近空态及本地游戏说明', () => {
  const e = harness(); e.render(); const s = e.G.sys.gifts.status(); assert.match(text(e), /免费 · 不扣糖果/); assert.ok(text(e).includes('未收 ' + s.remaining + ' / ' + s.total + ' 件')); assert.match(text(e), /累计已拆 0 盒/); assert.match(text(e), /没有已存回执/); assert.match(text(e), /没有真钱购买/); assert.equal(e.key('replay').hidden, true);
});
test('三个入口均通过真实open提交，再展示已存receipt，不改调用方', () => {
  for (const kind of ['panel','shop','modal']) { const e = harness(); kind === 'modal' ? e.G.ui.gifts.open() : e.render(kind); e.allFrames(); const calls = spy(e, 'open'), coin = e.G.state.wallet.coin; e.click('open'); assert.equal(calls(), 1); assert.equal(e.G.state.wallet.coin, coin); assert.equal(e.G.state.giftBox.opened, 1); assert.ok(reveal(e)); e.click('skip'); assert.match(text(e), /已存回执/); assert.ok(text(e).includes(e.G.sys.gifts.latest().id)); assert.equal(e.audio.filter(n => n === 'success').length, 1); }
});
test('付费200的预算/凭据和背包去向使用真实结果', () => {
  const e = harness(); assert.ok(e.G.sys.gifts.open().ok); e.advance(); const coin = e.G.state.wallet.coin; e.render(); assert.match(text(e), /200 颗游戏糖果/); e.click('open'); e.click('skip'); assert.equal(e.G.state.wallet.coin, coin - 200); assert.match(text(e), /使用 200 颗游戏糖果/); assert.match(text(e), /家具背包/); assert.ok(text(e).includes(e.G.sys.gifts.latest().id));
});
test('余额不足阻止open，读取后恢复资格，焦点与滚动保留', () => {
  const e = harness(); e.G.sys.gifts.open(); e.advance(); e.G.store.update(s => { s.wallet.coin = 199; }); e.render(); const calls = spy(e, 'open'); assert.equal(e.key('open').disabled, true); assert.match(text(e), /再攒 1 颗糖果/); e.key('open').dispatch('click'); assert.equal(calls(), 0); e.panelBody.scrollTop = 127; e.G.store.update(s => { s.wallet.coin = 200; }); assert.equal(e.key('open').disabled, false); e.click('retry'); assert.equal(e.document.activeElement, e.key('status')); assert.equal(e.panelBody.scrollTop, 127);
});
test('点击前重读资格，日期费用变化必须先看新预算，不暗扣200', () => {
  const e = harness(); e.render(); const calls = spy(e, 'open'), before = JSON.stringify(e.G.state); e.at('2026-10-27'); e.click('open'); assert.equal(calls(), 0); assert.equal(JSON.stringify(e.G.state), before); assert.match(text(e), /预算已变化/); assert.match(e.key('open').textContent, /200/); e.click('open'); assert.equal(calls(), 1); assert.equal(e.G.sys.gifts.latest().paid, true);
});
test('当前等级全收免费回300，预算和结果均为净增加300', () => {
  const e = harness(); complete(e); const coin = e.G.state.wallet.coin; e.render(); assert.match(text(e), /净增加 300 颗/); e.click('open'); e.click('skip'); assert.equal(e.G.state.wallet.coin, coin + 300); assert.match(text(e), /本次净增加 300 颗/); assert.equal(e.G.sys.gifts.latest().itemId, null);
});
test('全收付费先需200，钱包和结果仅净增加100', () => {
  const e = harness(); complete(e); e.G.sys.gifts.open(); e.advance(); e.G.store.update(s => { s.wallet.coin = 199; }); e.render(); assert.equal(e.key('open').disabled, true); assert.match(text(e), /须先有 200 颗，本次净增加 100 颗/); e.G.store.update(s => { s.wallet.coin = 200; }); e.click('open'); e.click('skip'); assert.equal(e.G.state.wallet.coin, 300); assert.match(text(e), /本次净增加 100 颗/); assert.doesNotMatch(text(e), /净增加 300/);
});
test('回拨只阻免费，仍可付费；标题、原因和费用明确', () => {
  const e = harness(); e.G.sys.gifts.open(); e.at('2026-10-27'); e.render(); assert.match(text(e), /仍可用糖果拆开/); assert.match(text(e), /仍可用 200 糖果拆盒/); assert.equal(e.key('open').disabled, false); e.click('open'); assert.equal(e.G.sys.gifts.latest().paid, true); assert.equal(e.G.state.giftBox.date, '2026-10-28');
});
test('漏日不补，查询/init/重读不占新日期免费', () => {
  const e = harness(); e.G.sys.gifts.open(); e.at('2026-10-31'); const before = JSON.stringify(e.G.state); e.render(); e.click('retry'); e.G.sys.gifts.init(); assert.equal(JSON.stringify(e.G.state), before); assert.match(e.key('open').textContent, /免费/); e.click('open'); assert.equal(e.G.state.giftBox.opened, 2);
});
test('池总数随等级变化，历史已收摆出送走不再算未收，包含庭院', () => {
  const e = harness(); complete(e); e.render(); assert.match(text(e), /未收 0/); e.G.store.update(s => { s.level = 30; }); const s = e.G.sys.gifts.status(); assert.ok(s.remaining > 0); assert.ok(text(e).includes('未收 ' + s.remaining + ' / ' + s.total)); assert.ok(e.G.data.giftPool(30).some(d => d.place === 'yard')); const id = e.G.data.giftPool(30).find(d => !e.G.state.collection[d.id]).id; e.G.store.update(s => { s.collection[id] = true; delete s.inventory[id]; }); assert.equal(e.G.sys.gifts.status().remaining, s.remaining - 1);
});
test('真实setItem拒写不扣糖/占免费/生成结果，原文保留且可立即重试', () => {
  const e = harness(); e.G.save.flush(); e.render(); const before = JSON.stringify(e.G.state), disk = e.storage.get(e.G.data.balance.saveKey); e.writeFails(true); e.click('open'); assert.equal(e.modal, null); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.storage.get(e.G.data.balance.saveKey), disk); assert.equal(e.audio.length, 0); assert.match(text(e), /免费机会都保持原样/); assert.equal(e.document.activeElement, e.key('status')); e.writeFails(false); e.click('open'); assert.ok(reveal(e)); assert.equal(e.G.state.giftBox.opened, 1);
});
test('钱包10亿/累计10亿边界拒绝，不扣费不占免费', () => {
  for (const kind of ['coin','opened']) { const e = harness(); if (kind === 'coin') complete(e); e.G.store.update(s => { if (kind === 'coin') s.wallet.coin = 999999999; else s.giftBox.opened = 1000000000; }); e.render(); const before = JSON.stringify(e.G.state), calls = spy(e, 'open'); assert.equal(e.key('open').disabled, true); e.key('open').dispatch('click'); assert.equal(calls(), 0); assert.equal(JSON.stringify(e.G.state), before); }
});
test('选中库存9999拒绝，不重抽、不扣费、不占免费或冷却', () => {
  const e = harness(); e.G.data.giftPool(e.G.state.level).filter(d => !e.G.state.collection[d.id]).forEach(d => { e.G.state.inventory[d.id] = 9999; }); e.render(); const before = JSON.stringify(e.G.state), calls = e.randomCalls(); e.click('open'); assert.equal(e.randomCalls(), calls + 1); assert.equal(JSON.stringify(e.G.state), before); assert.match(text(e), /背包格已经装满/); assert.equal(e.modal, null); Object.keys(e.G.state.inventory).forEach(id => { if (!e.G.state.collection[id]) delete e.G.state.inventory[id]; }); e.click('open'); assert.ok(reveal(e));
});
test('保存字节容量拒绝可恢复，失败不播放成功反馈', () => {
  const e = harness(); e.render(); const before = JSON.stringify(e.G.state), max = e.G.data.balance.maxSaveBytes; e.G.data.balance.maxSaveBytes = 1; e.click('open'); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0); assert.equal(e.modal, null); e.G.data.balance.maxSaveBytes = max; e.click('open'); assert.ok(reveal(e));
});
test('open返回ok但无匹配已存凭据时，不展示临时假结果', () => {
  const e = harness(); e.render(); const real = e.G.sys.gifts.open; e.G.sys.gifts.open = () => ({ ok: true, reward: { id: 'fake' } }); e.click('open'); assert.equal(e.modal, null); assert.match(text(e), /已存回执暂未确认/); assert.equal(e.audio.length, 0); e.G.sys.gifts.open = real; e.click('open'); assert.ok(reveal(e));
});
test('成功返回值被改写也不能替代latest的已存结果', () => {
  const e = harness(); e.render(); const real = e.G.sys.gifts.open; e.G.sys.gifts.open = () => { const r = real(); r.reward.itemId = 'fake_item'; return r; }; e.click('open'); assert.equal(e.G.state.giftBox.opened, 1); assert.equal(e.modal, null); assert.equal(e.audio.length, 0); assert.match(text(e), /已存回执暂未确认/); e.click('replay'); assert.ok(text(e).includes(e.G.sys.gifts.latest().id)); assert.doesNotMatch(text(e), /fake_item/);
});
test('提交后同步异常只提示重读；可查看实际receipt且不重复扣发', () => {
  const e = harness(); e.render(); const real = e.G.sys.gifts.open; e.G.sys.gifts.open = () => { real(); throw new Error('sync feedback failed'); }; e.click('open'); assert.equal(e.G.state.giftBox.opened, 1); assert.equal(e.modal, null); assert.equal(e.audio.length, 0); assert.match(text(e), /结果暂未确认/); const before = JSON.stringify(e.G.state); e.click('retry'); e.click('replay'); assert.equal(JSON.stringify(e.G.state), before); assert.match(text(e), /重看不会扣糖果/);
});
test('状态/latest读取异常提供恢复按钮，无假成功与盲开', () => {
  for (const method of ['status','latest']) { const e = harness(), real = e.G.sys.gifts[method]; e.G.sys.gifts[method] = () => { throw new Error('unreadable'); }; e.render(); assert.equal(lobby(e).dataset.state, 'unreadable'); assert.equal(e.key('open').disabled, true); e.G.sys.gifts[method] = real; e.click('retry'); assert.equal(e.key('open').disabled, false); assert.equal(e.audio.length, 0); }
});
test('读取latest在成功后异常：拒绝动画并重读恢复真实回执', () => {
  const e = harness(); e.render(); const realOpen = e.G.sys.gifts.open, realLatest = e.G.sys.gifts.latest; e.G.sys.gifts.open = () => { const r = realOpen(); e.G.sys.gifts.latest = () => { throw new Error('late read'); }; return r; }; e.click('open'); assert.equal(e.G.state.giftBox.opened, 1); assert.equal(e.modal, null); assert.equal(e.audio.length, 0); e.G.sys.gifts.latest = realLatest; e.click('retry'); e.click('replay'); assert.match(text(e), /已存回执/);
});
test('同步state/gift事件重入仅调用一次open，保留1250ms系统冷却', () => {
  const e = harness(); e.render(); const old = e.key('open'), calls = spy(e, 'open'); e.G.bus.on('state:change', () => old.dispatch('click')); e.G.bus.on('gift:opened', () => old.dispatch('click')); e.click('open'); old.dispatch('click'); assert.equal(calls(), 1); e.click('skip'); e.click('keep'); e.click('open'); assert.equal(e.G.state.giftBox.opened, 1); assert.match(text(e), /上一份礼物刚刚收好/); e.advance(1250); e.click('open'); assert.equal(e.G.state.giftBox.opened, 2);
});
test('650抬盖/1250揭晓与16彩带，只消费一次已存receipt', () => {
  const e = harness(); e.render(); const calls = spy(e, 'open'); e.click('open');
  const rewardCanvas = reveal(e).querySelector('.gift-reward-art'), latestCanvas = lobby(e).querySelector('.gift-last-art'), callbacks = animationTimers(e).map(timer => timer.fn);
  assert.ok(rewardCanvas); assert.ok(latestCanvas); assert.notEqual(rewardCanvas, latestCanvas);
  assert.equal(canvasDraws(e, rewardCanvas).length, 0, '揭晓前不能先画结果家具');
  assert.equal(canvasDraws(e, latestCanvas).length, 1, '大厅回执预览单独按需绘制');
  assert.equal(reveal(e).querySelector('.gift-confetti').children.length, 16); assert.equal(animationTimers(e).length, 2); assert.equal(reveal(e).querySelector('.gift-reward').hidden, true);
  e.runTimers(650); assert.ok(reveal(e).classList.contains('is-lifting')); assert.equal(reveal(e).querySelector('.gift-reward').hidden, true);
  e.runTimers(600); e.allFrames(); assert.equal(reveal(e).querySelector('.gift-reward').hidden, false); assert.ok(reveal(e).classList.contains('is-celebrating')); assert.equal(calls(), 1);
  assert.equal(canvasDraws(e, rewardCanvas).length, 1, '一次揭晓只绘制一次已存结果'); assert.equal(canvasDraws(e, rewardCanvas)[0].id, e.G.sys.gifts.latest().itemId);
  callbacks.forEach(fn => fn()); e.allFrames(); assert.equal(canvasDraws(e, rewardCanvas).length, 1, '迟到动画回调不得重复绘制结果'); assert.equal(calls(), 1);
});
test('hidden setter模拟隐藏持焦节点或其祖先时退回body', () => {
  const e = harness(), wrapper = new e.Node('div'), control = new e.Node('button'); wrapper.append(control); e.document.body.append(wrapper); control.focus(); control.hidden = true; assert.equal(e.document.activeElement, e.document.body); control.hidden = false; control.focus(); wrapper.hidden = true; assert.equal(e.document.activeElement, e.document.body);
});
test('默认skip焦点在1250自动揭晓后交给收好，其他焦点不被夺走', () => {
  for (const focusKey of ['skip', 'close']) { const e = harness(); e.render(); const calls = spy(e, 'open'); e.click('open'); assert.equal(e.document.activeElement, e.key('skip')); if (focusKey === 'close') e.key('close').focus(); e.modal.body.scrollTop = 96; const before = JSON.stringify(e.G.state); e.runTimers(1250); e.allFrames(); assert.equal(e.document.activeElement, e.key(focusKey === 'skip' ? 'keep' : 'close')); if (focusKey === 'skip') assert.equal(e.document.activeElement.focusOptions.preventScroll, true); assert.equal(e.modal.body.scrollTop, 96); assert.equal(e.key('skip').hidden, true); assert.equal(e.key('keep').hidden, false); assert.equal(calls(), 1); assert.equal(JSON.stringify(e.G.state), before); }
});
test('跳过立即读已存结果，取消定时器，焦点到收好且滚动不跳', () => {
  const e = harness(); e.render(); const calls = spy(e, 'open'); e.click('open'); e.modal.body.scrollTop = 84; e.click('skip'); assert.equal(animationTimers(e).length, 0); assert.equal(e.document.activeElement, e.key('keep')); assert.equal(e.document.activeElement.focusOptions.preventScroll, true); assert.equal(e.modal.body.scrollTop, 84); assert.equal(calls(), 1); assert.ok(!reveal(e).classList.contains('is-celebrating'));
});
test('提前关闭清timers/listeners，迟到回调不能发奖/声音/结果', () => {
  const e = harness(); e.render(); e.click('open'); const callbacks = animationTimers(e).map(t => t.fn), before = JSON.stringify(e.G.state), sounds = e.audio.length, drawsBeforeClose = e.draws.length;
  e.click('close'); assert.equal(animationTimers(e).length, 0); assert.equal(e.motionEvents.size, 0); assert.equal(e.documentEvents.get('visibilitychange').size, 0); callbacks.forEach(fn => fn()); e.allFrames(); assert.equal(e.modal, null); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, sounds); assert.equal(e.draws.length, drawsBeforeClose, '关闭后迟到动画不得新增任何绘图');
});
test('揭晓后关窗释放Canvas并取消待绘RAF，迟到帧不画旧家具', () => {
  const e = harness(); e.render(); e.click('open'); e.runTimers(1250);
  const canvas = reveal(e).querySelector('.gift-reward-art'), callbacks = [...e.frames.values()], drawsBeforeClose = e.draws.length;
  assert.ok(canvas); assert.equal(canvas.width, 260); assert.equal(canvasDraws(e, canvas).length, 0, '结果帧仍在等待执行');
  e.modal.close(); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); assert.equal(e.frames.size, 0);
  callbacks.forEach(fn => fn()); e.allFrames(); assert.equal(e.draws.length, drawsBeforeClose, '关闭后不能新增绘图，包含所有旧画布'); assert.equal(canvasDraws(e, canvas).length, 0, '被取消的结果画布不得迟到绘制'); assert.equal(e.motionEvents.size, 0);
});
test('后台/减少动态从开始即时结果，无动画定时器或彩带', () => {
  for (const mode of ['hidden','motion']) { const e = harness(); e[mode](true); e.render(); e.click('open'); assert.equal(animationTimers(e).length, 0); assert.equal(reveal(e).querySelector('.gift-reward').hidden, false); assert.ok(!reveal(e).classList.contains('is-celebrating')); assert.equal(e.audio.length, mode === 'hidden' ? 0 : 1); }
});
test('动画途中切后台或减少动态立即揭晓并停止彩带', () => {
  for (const mode of ['hidden','motion']) { const e = harness(); e.render(); e.click('open'); const sounds = e.audio.length; e[mode](true); e.allFrames(); assert.equal(animationTimers(e).length, 0); assert.equal(reveal(e).querySelector('.gift-reward').hidden, false); assert.ok(!reveal(e).classList.contains('is-celebrating')); assert.equal(e.audio.length, sounds); e.modal.close(); assert.equal(e.motionEvents.size, 0); }
});
test('回看/重新读取/刷新恢复最近receipt均不再发奖扣款或播放成功', () => {
  const e = harness(); e.G.sys.gifts.open(); const saved = e.parse(e.G.state); e.G.store.replace(saved); e.render(); const before = JSON.stringify(e.G.state), calls = spy(e, 'open'); e.click('retry'); e.click('replay'); assert.equal(animationTimers(e).length, 0); assert.ok(!reveal(e).classList.contains('is-celebrating')); assert.equal(e.audio.length, 0); e.click('keep'); e.render('shop'); e.click('replay'); assert.equal(calls(), 0); assert.equal(JSON.stringify(e.G.state), before);
});
test('换档清旧结果/Canvas/监听，旧按钮及迟到回调全部失效', () => {
  const e = harness(); e.render(); const old = e.key('open'), calls = spy(e, 'open'); e.click('open'); const callbacks = animationTimers(e).map(t => t.fn); e.runTimers(1250); const canvas = reveal(e).querySelector('canvas'), frames = [...e.frames.values()], keep = e.key('keep'); e.G.store.replace(e.G.store.defaultState()); const before = JSON.stringify(e.G.state); old.dispatch('click'); keep.dispatch('click'); callbacks.forEach(fn => fn()); frames.forEach(fn => fn()); e.allFrames(); assert.equal(e.modal, null); assert.equal(canvas.width, 0); assert.equal(calls(), 1); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.motionEvents.size, 0); assert.equal(animationTimers(e).length, 0);
});
test('同步state或gift事件换档后不出现旧成功弹层/反馈', () => {
  for (const event of ['state:change','gift:opened']) { const e = harness(); e.render(); let once = true; e.G.bus.on(event, () => { if (once) { once = false; e.G.store.replace(e.G.store.defaultState()); } }); e.click('open'); assert.equal(e.modal, null); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); assert.equal(e.G.state.giftBox.opened, 0); assert.equal(e.key('open').disabled, true); }
});
test('隐藏但仍连接的panel和移除的旧content按钮不能开盒', () => {
  const e = harness(); e.render(); const old = e.key('open'), calls = spy(e, 'open'); e.host.className = 'hidden'; old.dispatch('click'); assert.equal(calls(), 0); e.host.className = ''; e.render('shop'); old.dispatch('click'); assert.equal(calls(), 0); e.click('open'); assert.equal(calls(), 1);
});
test('结果或外部弹层挡住底层旧按钮，不允许程序化重入', () => {
  const e = harness(); e.render(); const old = e.key('open'), calls = spy(e, 'open'); e.click('open'); e.advance(2000); old.dispatch('click'); assert.equal(calls(), 1); e.click('close'); e.G.ui.modal({ content: new e.Node('div') }); old.dispatch('click'); assert.equal(calls(), 1);
});
test('公共panel刷新替换content后仍能继续，旧按钮无效并恢复当前焦点', () => {
  const e = harness(); e.render('shop'); const old = e.key('open'); let pending = false; e.G.bus.on('state:change', () => { if (!pending) { pending = true; e.context.requestAnimationFrame(() => { pending = false; e.render('shop'); }); } }); e.click('open'); e.click('skip'); e.click('keep'); assert.equal(e.document.activeElement, e.key('open')); old.dispatch('click'); assert.equal(e.G.state.giftBox.opened, 1); e.advance(); e.click('open'); assert.equal(e.G.state.giftBox.opened, 2);
});
test('真实稀有度装饰/原drawThumbnail按需一次，画图异常保留文字与关闭', () => {
  const e = harness(); e.render(); e.G.render.drawThumbnail = () => { throw new Error('canvas failed'); }; e.click('open'); e.click('skip'); assert.match(text(e), /插图暂不可用/); assert.match(text(e), /已存回执/); assert.ok(reveal(e).querySelector('.furniture-rarity-badge')); assert.equal(reveal(e).querySelector('canvas').width, 0); e.click('keep'); assert.equal(e.modal, null);
});
test('长名全文、状态语义和实际控件可达，重看不改变回执', () => {
  const e = harness(); e.G.sys.gifts.open(); e.advance(); const receipt = e.G.sys.gifts.latest(), id = receipt.itemId, name = '很长的软纸家具名字'.repeat(12); e.G.data.furnitureById[id].name = name; e.render(); e.allFrames();
  assert.ok(text(e).includes(name)); const status = e.key('status'); assert.equal(status.getAttribute('role'), 'status'); assert.equal(status.getAttribute('aria-live'), 'polite'); assert.equal(status.getAttribute('aria-atomic'), 'true'); assert.equal(e.key('open').getAttribute('aria-describedby'), status.id);
  for (const key of ['open', 'retry', 'replay']) { const control = e.key(key); assert.ok(control?.isConnected, key + '应可达'); assert.equal(control.type, 'button'); assert.equal(control.hidden, false); assert.equal(control.disabled, false); }
  e.click('retry'); assert.equal(e.document.activeElement, e.key('status')); const before = JSON.stringify(e.G.state), calls = spy(e, 'open');
  e.click('replay'); assert.ok(text(e).includes(name)); assert.ok(text(e).includes(receipt.id)); const canvas = reveal(e).querySelector('.gift-reward-art'); assert.equal(canvas.getAttribute('aria-label'), name); assert.equal(canvasDraws(e, canvas).length, 1);
  for (const key of ['keep', 'close']) { assert.equal(e.key(key).type, 'button'); assert.equal(e.key(key).hidden, false); assert.equal(e.key(key).disabled, false); }
  e.click('keep'); assert.equal(e.modal, null);
  // 共享modal最后恢复仍连接的调用控件；从“查看上次礼物”进入时应回到具名回看入口。
  const focused = e.document.activeElement, currentLobby = lobby(e);
  assert.ok(focused?.isConnected); assert.ok(currentLobby.contains(focused), '焦点应留在本次礼盒大厅'); assert.equal(focused.tagName, 'BUTTON'); assert.equal(focused.type, 'button'); assert.equal(focused.disabled, false); assert.equal(focused.dataset.uiFocus, 'gifts-replay'); assert.match(focused.textContent, /查看上次礼物/);
  for (let ancestor = focused; ancestor; ancestor = ancestor.parentElement) { assert.equal(ancestor.hidden, false, '焦点及其祖先不能隐藏'); assert.equal(ancestor.classList.contains('hidden'), false, '焦点不能落入收起的面板'); }
  const receiptRegion = currentLobby.querySelector('.gift-last'); assert.ok(receiptRegion?.contains(focused), '回看焦点必须属于本次最近回执区域'); assert.ok(receiptRegion.textContent.includes(name)); assert.match(receiptRegion.textContent, receipt.paid ? /使用 200 颗游戏糖果/ : /每日免费 · 未扣糖果/); assert.deepEqual(e.G.sys.gifts.latest(), receipt); assert.equal(calls(), 0); assert.equal(JSON.stringify(e.G.state), before);
});
test('大厅回执插图失败不阻断全文、重读、回看或关闭', () => {
  const e = harness(); e.G.sys.gifts.open(); e.advance(); const receipt = e.G.sys.gifts.latest(), before = JSON.stringify(e.G.state), attempts = [], draw = e.G.render.drawThumbnail;
  e.G.render.drawThumbnail = (canvas, id) => { attempts.push({ canvas, id }); if (canvas.classList.contains('gift-last-art')) throw new Error('receipt preview failed'); draw(canvas, id); };
  e.render(); e.allFrames(); const lastArt = lobby(e).querySelector('.gift-last-art'); assert.equal(lastArt.hidden, true); assert.ok(attempts.some(attempt => attempt.canvas === lastArt && attempt.id === receipt.itemId)); assert.ok(text(e).includes(e.G.data.furnitureById[receipt.itemId].name));
  assert.equal(e.key('open').disabled, false); assert.equal(e.key('retry').disabled, false); assert.equal(e.key('replay').hidden, false); assert.equal(e.key('replay').disabled, false);
  e.click('retry'); assert.equal(e.document.activeElement, e.key('status')); e.click('replay'); const resultCanvas = reveal(e).querySelector('.gift-reward-art'); assert.equal(canvasDraws(e, resultCanvas).length, 1); assert.ok(text(e).includes(receipt.id)); e.click('keep'); assert.equal(e.modal, null); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0);
});
(async () => { for (const [name, fn] of tests) { await fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组礼盒UI隔离检查通过（人工DOM/时钟，不等于正式页面/动画/读屏验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
