'use strict';
// MC-062：内存DOM、合成存档、真实观星规则与setItem拒写；无scene/账号/浏览器/服务。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push([name, fn]);
function harness() {
  let clock = new Date(2026, 9, 28, 21).getTime(), denyWrite = false, nextFrame = 0, booting = true;
  const frames = new Map(), storage = new Map(), toasts = [], audio = [], navigation = [], draws = [], cancelled = [], documentEvents = new Map();
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this.disabled = false; this.scrollTop = 0; this._text = ''; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    append(...nodes) { nodes.forEach(node => { node.remove(); this.children.push(node); node.parentElement = this; }); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; } }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
    dispatch(name) { (this.listeners.get(name) || []).forEach(fn => fn({ target: this })); }
    // 补足原生summary的默认展开行为；这里只模拟DOM平台，不模拟产品动作。
    click() {
      if (this.disabled) return;
      this.dispatch('click');
      if (this.tagName === 'SUMMARY' && this.parentElement?.tagName === 'DETAILS') this.parentElement.open = !this.parentElement.open;
    }
    focus(options) { if (!this.disabled && !this.hidden) { document.activeElement = this; this.focusOptions = options; } }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return selector.slice(1).split('.').every(name => this.classList.contains(name));
      const attr = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
      if (attr) return attr[1].startsWith('data-') ? this.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === attr[2] : this.getAttribute(attr[1]) === attr[2];
      return selector === '*' || this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; }, remove: name => { this.className = this.className.split(/\s+/).filter(c => c !== name).join(' '); } }; }
    getContext() { if (!this.ctx) this.ctx = new Proxy({ calls: [] }, { get(object, name) { if (name in object) return object[name]; return (...args) => { args.forEach(arg => { if (typeof arg === 'number') assert.ok(Number.isFinite(arg)); }); object.calls.push([name, args]); }; }, set(object, name, value) { object[name] = value; return true; } }); return this.ctx; }
  }
  const document = { hidden: false, body: null, activeElement: null, createElement: tag => new Node(tag), getElementById: id => document.body.querySelector('#' + id), addEventListener(name, fn) { if (!documentEvents.has(name)) documentEvents.set(name, []); documentEvents.get(name).push(fn); } };
  document.body = new Node('body'); document.activeElement = document.body;
  const host = new Node('section'), panelBody = new Node('div'); host.id = 'panel'; host.className = 'hidden'; panelBody.id = 'panel-body'; host.append(panelBody); document.body.append(host);
  const RealDate = Date; class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, document, Blob, URL, Date: TestDate, requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame: id => { cancelled.push(id); frames.delete(id); }, setTimeout: () => 1, clearTimeout() {}, setInterval() { if (!booting) throw new Error('UI不允许新计时器'); return 1; }, clearInterval() {} });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (denyWrite) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  const files = ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/creative.js','js/data/gifts.js','js/data/observatory.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js','js/systems/systems.js','js/systems/garden.js','js/systems/avatar.js','js/systems/time.js','js/systems/observatory.js','js/render/observatory.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(); G.sys.init(); booting = false; G.audio = { play: value => audio.push(value) };
  G.ui = { toast: value => toasts.push(value), open(kind) { navigation.push(kind); if (kind === 'observatory') render(); else { G.runtime.mode = 'explore'; host.dataset.kind = kind; panelBody.replaceChildren(new Node('div')); } } };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/observatory.js'), 'utf8'), context, { filename: 'js/ui/observatory.js' });
  for (const key of ['draw', 'drawConstellation']) { const original = G.draw.observatory[key]; G.draw.observatory[key] = (...args) => { draws.push({ key, args }); return original(...args); }; }
  function render() { G.runtime.mode = 'observatory'; const focused = document.activeElement, focusKey = focused?.dataset.uiFocus, descriptor = G.ui.observatory.panel(); host.className = ''; host.dataset.kind = 'observatory'; panelBody.replaceChildren(descriptor.content); if (!focused.isConnected) document.body.focus(); const replacement = focusKey && panelBody.querySelector('[data-ui-focus="' + focusKey + '"]'); replacement?.focus({ preventScroll: true }); return descriptor; }
  const flush = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); };
  function allFrames() { let n = 0; while (frames.size) { assert.ok(++n < 8, '不得持续RAF'); flush(); } }
  const key = value => panelBody.querySelector('[data-ui-focus="observatory-' + value + '"]');
  const ready = () => G.store.update(state => { state.level = 17; state.wallet.coin = 5000; state.settings.dayMode = 'night'; });
  const built = () => { ready(); assert.ok(G.sys.observatory.build().ok); };
  const click = value => { const node = key(value); assert.ok(node, value); node.focus(); node.click(); allFrames(); return node; };
  function queuedRefresh() { let pending = false; G.bus.on('state:change', () => { if (pending) return; pending = true; context.requestAnimationFrame(() => { pending = false; if (!host.classList.contains('hidden') && host.dataset.kind === 'observatory') render(); }); }); }
  return { G, document, host, panelBody, storage, toasts, audio, navigation, draws, cancelled, frames, render, flush, allFrames, key, ready, built, click, queuedRefresh, parse,
    writeFails(value) { denyWrite = value; }, at(date, hour = 21) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], hour).getTime(); },
    close() { host.className = 'hidden'; G.bus.emit('panel:change', { open: false }); }, visibility(hidden) { document.hidden = hidden; (documentEvents.get('visibilitychange') || []).forEach(fn => fn()); }
  };
}
function state(e) { return e.panelBody.children[0].dataset.state; }
function countCalls(e, name) { const original = e.G.sys.observatory[name]; let count = 0; e.G.sys.observatory[name] = (...args) => { count++; return original(...args); }; return () => count; }

test('保留open/panel/entry API；entry仍委托原导航且查询不写进度', () => {
  const e = harness(), before = JSON.stringify(e.G.state), api = e.G.ui.observatory;
  assert.equal(typeof api.open, 'function'); assert.equal(typeof api.panel, 'function'); const entry = api.entry(); assert.match(entry.textContent, /Lv17开放/); assert.equal(JSON.stringify(e.G.state), before); entry.click(); e.allFrames(); assert.deepEqual(e.navigation, ['observatory']);
});
test('Lv不足与缺糖各有状态；关闭的主按钮不能越权调用系统', () => {
  const e = harness(); e.render(); assert.equal(state(e), 'locked'); assert.equal(e.key('action').disabled, true); const calls = countCalls(e, 'build'); e.key('action').dispatch('click'); assert.equal(calls(), 0);
  e.ready(); e.G.store.update(s => s.wallet.coin = 999); e.render(); assert.equal(state(e), 'poor'); assert.match(e.panelBody.textContent, /还差 1 颗糖果/); assert.match(e.key('action').textContent, /1,000/); assert.equal(e.key('action').disabled, true);
});
test('可建委托原build一次；1000糖果原子保存，普通格与建房数保持', () => {
  const e = harness(); e.ready(); e.G.store.update(s => s.wallet.coin = 1000); const rooms = JSON.stringify(e.G.state.house.rooms), count = e.G.state.quests.stats.roomsBuilt, calls = countCalls(e, 'build'); e.render(); assert.equal(state(e), 'build'); e.click('action');
  assert.equal(calls(), 1); assert.equal(e.G.state.wallet.coin, 0); assert.equal(e.G.state.house.attic.type, 'observatory'); assert.equal(JSON.stringify(e.G.state.house.rooms), rooms); assert.equal(e.G.state.quests.stats.roomsBuilt, count); assert.equal(JSON.parse(e.storage.get(e.G.data.balance.saveKey)).house.attic.type, 'observatory'); assert.equal(state(e), 'ready'); assert.deepEqual(e.audio, ['success']); assert.equal(e.navigation.length, 0);
});
test('build真实setItem拒写后糖果/机会/事件不变；错误跨刷新保留并可重试', () => {
  const e = harness(); e.ready(); assert.ok(e.G.save.flush()); let events = 0; e.G.bus.on('observatory:built', () => events++); const before = JSON.stringify(e.G.state), disk = e.storage.get(e.G.data.balance.saveKey); e.render(); e.writeFails(true); e.click('action');
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.storage.get(e.G.data.balance.saveKey), disk); assert.equal(events, 0); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); assert.match(e.key('feedback').textContent, /糖果保持原样/); assert.equal(e.key('feedback').getAttribute('role'), 'alert'); assert.equal(e.key('action').disabled, false);
  e.render(); e.allFrames(); assert.match(e.key('feedback').textContent, /糖果保持原样/); e.writeFails(false); e.click('action'); assert.equal(events, 1); assert.equal(e.G.state.wallet.coin, 4000); assert.equal(e.key('feedback').getAttribute('role'), 'status');
});
test('真实白天/黄昏/06:00拒绝；20:00/05:00与永远夜晚可观测', () => {
  const e = harness(); e.built(); e.G.store.update(s => s.settings.dayMode = 'real'); const calls = countCalls(e, 'observe');
  for (const hour of [6, 12, 19]) { e.at('2026-10-28', hour); e.render(); assert.equal(state(e), 'day'); e.key('action').dispatch('click'); assert.equal(calls(), 0); assert.equal(e.key('settings').hidden, false); }
  for (const hour of [20, 5]) { e.at('2026-10-28', hour); e.render(); assert.equal(state(e), 'ready'); assert.equal(e.key('action').disabled, false); }
  e.G.store.update(s => s.settings.dayMode = 'night'); e.at('2026-10-28', 12); e.render(); assert.equal(state(e), 'ready');
});
test('去设置只走原导航，不自动改变dayMode；旧设置按钮不再有效', () => {
  const e = harness(); e.built(); e.G.store.update(s => s.settings.dayMode = 'real'); e.at('2026-10-28', 12); e.render(); const before = JSON.stringify(e.G.state), old = e.click('settings'); assert.deepEqual(e.navigation, ['settings']); assert.equal(JSON.stringify(e.G.state), before); old.dispatch('click'); assert.equal(e.navigation.length, 1);
});
test('观测单次+3碎片/+1次数且无币经验；同步重入和重复点击不重领', () => {
  const e = harness(); e.built(); e.render(); const calls = countCalls(e, 'observe'), coin = e.G.state.wallet.coin, exp = e.G.state.exp, action = e.key('action'); e.G.bus.on('state:change', () => action.dispatch('click')); e.click('action'); action.dispatch('click');
  assert.equal(calls(), 1); assert.equal(e.G.state.observatory.fragments, 3); assert.equal(e.G.state.observatory.observations, 1); assert.equal(e.G.state.wallet.coin, coin); assert.equal(e.G.state.exp, exp); assert.equal(state(e), 'claimed'); assert.equal(e.key('action').disabled, true); assert.deepEqual(e.audio, ['success']); assert.equal(e.document.activeElement, e.key('feedback'));
});
test('同日与日期回拨独立文案；须严格更晚日期，不按24小时或6点重置', () => {
  const e = harness(); e.built(); assert.ok(e.G.sys.observatory.observe().ok); e.render(); assert.equal(state(e), 'claimed'); assert.match(e.panelBody.textContent, /须到更晚的本地日期/); e.at('2026-10-27'); e.render(); assert.equal(state(e), 'clock'); assert.match(e.panelBody.textContent, /早于已保存的2026-10-28/);
  e.at('2026-10-29', 5); e.render(); assert.equal(state(e), 'ready'); e.click('action'); assert.equal(e.G.state.observatory.fragments, 6); e.at('2026-10-29', 6); e.render(); assert.equal(state(e), 'claimed');
});
test('漏日不补发；连续可观日期仍满足fragments=observations×3', () => {
  const e = harness(); e.built(); e.render(); e.click('action'); e.at('2026-11-02'); e.render(); e.click('action'); assert.equal(e.G.state.observatory.observations, 2); assert.equal(e.G.state.observatory.fragments, e.G.state.observatory.observations * 3); assert.equal(e.G.state.observatory.lastDate, '2026-11-02');
});
test('仅最近记录：六真实ID/name/story/points准确委托，回看不领奖', () => {
  const e = harness(); e.built(); const calls = countCalls(e, 'observe');
  for (const def of e.G.data.constellations) {
    e.G.store.update(s => { s.observatory = { observations: 1, fragments: 3, lastDate: '2026-10-27', lastDiscovery: { id: def.id, date: '2026-10-27', at: Date.now(), fragments: 3 } }; }); const before = JSON.stringify(e.G.state); e.render(); e.allFrames();
    assert.equal(e.panelBody.querySelectorAll('.observatory-discovery').length, 1); assert.match(e.panelBody.querySelector('.observatory-star-copy').textContent, /2026-10-27 · 收下3枚碎片/); assert.ok(e.panelBody.textContent.includes(def.name)); assert.ok(e.panelBody.textContent.includes(def.story)); assert.equal(e.draws.at(-1).args[1], def); assert.equal(JSON.stringify(e.G.state), before); assert.equal(calls(), 0);
  }
  assert.equal(e.panelBody.querySelectorAll('.observatory-star-map').length, 1); assert.doesNotMatch(e.panelBody.textContent, /已解锁|集齐|兑换|经验奖励|金币奖励|连线游戏/);
});
test('空记录不编造星群发现；今夜constellation不会伪装已发现', () => {
  const e = harness(); e.built(); e.render(); e.allFrames(); assert.equal(e.panelBody.querySelectorAll('.observatory-star-map').length, 0); assert.match(e.panelBody.textContent, /还没有观星记录/); e.G.data.constellations.forEach(def => assert.equal(e.panelBody.textContent.includes(def.name), false));
});
test('最大999999999碎片/333333333次完整可读，上限拒绝观测', () => {
  const e = harness(); e.built(); e.G.store.update(s => { s.observatory = { fragments: 999999999, observations: 333333333, lastDate: '2026-10-27', lastDiscovery: { id: 'sleeping_cat', date: '2026-10-27', at: Date.now(), fragments: 3 } }; }); e.render(); const before = JSON.stringify(e.G.state), calls = countCalls(e, 'observe'); assert.equal(state(e), 'full'); assert.match(e.panelBody.textContent, /999,999,999/); assert.match(e.panelBody.textContent, /333,333,333/); e.key('action').dispatch('click'); assert.equal(calls(), 0); assert.equal(JSON.stringify(e.G.state), before);
});
test('observe真实拒写后记录/机会/碎片/事件保持，恢复仍可当天成功', () => {
  const e = harness(); e.built(); let events = 0; e.G.bus.on('observatory:observed', () => events++); e.render(); const before = JSON.stringify(e.G.state), disk = e.storage.get(e.G.data.balance.saveKey); e.writeFails(true); e.click('action');
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.storage.get(e.G.data.balance.saveKey), disk); assert.equal(events, 0); assert.match(e.key('feedback').textContent, /观星机会和碎片保持原样/); assert.equal(e.key('action').disabled, false); assert.equal(e.audio.length, 0); e.writeFails(false); e.click('action'); assert.equal(events, 1); assert.equal(e.G.state.observatory.fragments, 3);
});
test('失败后重新status恢复行动，旧built/night闭包不决定下次行为', () => {
  const e = harness(); e.built(); e.render(); const original = e.G.sys.observatory.observe; e.G.sys.observatory.observe = () => { e.G.store.update(s => s.settings.dayMode = 'day'); return { ok: false, message: '合成同步失败说明' }; }; e.click('action'); assert.equal(state(e), 'day'); assert.equal(e.key('action').disabled, true); assert.equal(e.key('settings').hidden, false); assert.match(e.key('feedback').textContent, /合成同步失败说明/); e.G.sys.observatory.observe = original;
  // 打开时是未建；点击前真实状态已经建好，必须重读再调用正确API。
  const f = harness(); f.ready(); f.render(); assert.ok(f.G.sys.observatory.build().ok); const builds = countCalls(f, 'build'), observes = countCalls(f, 'observe'); f.click('action'); assert.equal(builds(), 0); assert.equal(observes(), 1); assert.equal(f.G.state.observatory.fragments, 3);
});
test('status/latest读取异常各可重读，绝不以未知状态执行写入', () => {
  for (const method of ['status', 'latest']) { const e = harness(); e.built(); const original = e.G.sys.observatory[method]; e.G.sys.observatory[method] = () => { throw new Error('合成读取异常'); }; e.render(); e.allFrames(); assert.equal(state(e), 'unreadable'); assert.equal(e.key('action').disabled, true); assert.match(e.panelBody.textContent, /最近记录暂不可读/); e.G.sys.observatory[method] = original; e.click('retry'); assert.equal(state(e), 'ready'); assert.equal(e.document.activeElement, e.key('retry')); }
});
test('API抛出同步异常可恢复；失败说明在后续重新读取后仍保留', () => {
  const e = harness(); e.built(); e.render(); const original = e.G.sys.observatory.observe; e.G.sys.observatory.observe = () => { throw new Error('同步异常'); }; e.click('action'); assert.match(e.key('feedback').textContent, /行动未能确认/); assert.equal(e.key('action').disabled, false); assert.equal(e.audio.length, 0); e.G.sys.observatory.observe = original; e.click('retry'); assert.match(e.key('feedback').textContent, /行动未能确认/); e.click('action'); assert.equal(e.G.state.observatory.fragments, 3);
});
test('失败后的status再次异常，错误与暂停状态并存，重读恢复', () => {
  const e = harness(); e.built(); e.render(); const original = e.G.sys.observatory.status; e.G.sys.observatory.observe = () => { e.G.sys.observatory.status = () => { throw new Error('读取失败'); }; return { ok: false, message: '保存失败保留说明' }; }; e.click('action'); assert.equal(state(e), 'unreadable'); assert.match(e.key('feedback').textContent, /保存失败保留说明/); assert.equal(e.key('action').disabled, true); e.G.sys.observatory.status = original; e.click('retry'); assert.equal(state(e), 'ready'); assert.match(e.key('feedback').textContent, /保存失败保留说明/);
});
test('state刷新后旧按钮失效，保留行动焦点和滚动；仅单次RAF静态绘图', () => {
  const e = harness(); e.built(); e.render(); e.allFrames(); e.panelBody.scrollTop = 183; const old = e.key('action'); old.focus(); e.render(); e.panelBody.scrollTop = 0; e.allFrames(); assert.equal(e.panelBody.scrollTop, 183); assert.equal(e.document.activeElement, e.key('action')); assert.equal(e.document.activeElement.focusOptions.preventScroll, true); const before = JSON.stringify(e.G.state); old.dispatch('click'); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.frames.size, 0);
});
test('提交触发宿主排队刷新：成功仍落反馈，失败仍落可重试按钮', () => {
  const e = harness(); e.built(); e.render(); e.allFrames(); e.queuedRefresh(); e.click('action'); assert.equal(e.document.activeElement, e.key('feedback')); assert.equal(state(e), 'claimed'); assert.equal(e.frames.size, 0);
  const f = harness(); f.ready(); f.render(); f.allFrames(); f.queuedRefresh(); f.writeFails(true); f.click('action'); f.render(); f.allFrames(); assert.equal(f.document.activeElement, f.key('action')); assert.match(f.key('feedback').textContent, /糖果保持原样/);
});
test('状态改变使原按钮不可用时回退到状态说明，连续重建仍保持焦点', () => {
  const e = harness(); e.built(); e.render(); e.allFrames(); e.key('action').focus(); e.G.store.update(s => s.settings.dayMode = 'day'); e.render(); e.allFrames(); assert.equal(e.document.activeElement, e.key('status')); e.render(); e.allFrames(); assert.equal(e.document.activeElement, e.key('status')); assert.equal(e.key('status').tabIndex, -1);
});
test('关闭抽屉保留DOM也使旧按钮失效，并取消RAF/清零Canvas', () => {
  const e = harness(); e.built(); e.render(); const old = e.key('action'), canvases = e.panelBody.querySelectorAll('canvas'), before = JSON.stringify(e.G.state); assert.equal(e.frames.size, 1); e.close(); assert.equal(old.isConnected, true); assert.equal(e.frames.size, 0); canvases.forEach(canvas => { assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); }); old.dispatch('click'); assert.equal(JSON.stringify(e.G.state), before); e.allFrames(); assert.equal(e.draws.length, 0);
});
test('换档即刻拒绝旧按钮和迟到结果，清绘图，不把成功反馈带入新档', () => {
  const e = harness(); e.ready(); const saved = e.parse(e.G.state); e.built(); e.render(); const old = e.key('action'), beforeCanvas = e.panelBody.querySelector('canvas'); e.G.store.replace(saved); const after = JSON.stringify(e.G.state); old.dispatch('click'); e.allFrames(); assert.equal(JSON.stringify(e.G.state), after); assert.equal(beforeCanvas.width, 0);
  e.render(); assert.equal(e.key('feedback').hidden, true); const original = e.G.sys.observatory.build; e.G.sys.observatory.build = () => { const result = original(); e.G.store.replace(saved); return result; }; e.click('action'); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); assert.equal(e.G.state.house.attic, null);
});
test('宿主先换面板但open事件尚未到达，旧的连接DOM也不可行动', () => {
  const e = harness(); e.built(); e.render(); const old = e.key('action'), before = JSON.stringify(e.G.state); e.host.dataset.kind = 'settings'; e.G.runtime.mode = 'explore'; old.dispatch('click'); assert.equal(JSON.stringify(e.G.state), before); e.allFrames(); assert.equal(e.panelBody.querySelector('canvas').width, 0); assert.equal(e.audio.length, 0);
});
test('绘图异常显示文字和重读路径；恢复后原draw/drawConstellation可重绘', () => {
  const e = harness(); e.built(); assert.ok(e.G.sys.observatory.observe().ok); const original = e.G.draw.observatory.drawConstellation; e.G.draw.observatory.drawConstellation = () => { throw new Error('合成Canvas异常'); }; e.render(); e.allFrames(); assert.match(e.panelBody.textContent, /星空插图暂不可用/); assert.match(e.panelBody.textContent, /这里只保留最近一条记录/); e.G.draw.observatory.drawConstellation = original; e.click('retry'); assert.doesNotMatch(e.panelBody.textContent, /星空插图暂不可用/); assert.equal(e.frames.size, 0);
});
test('返回前台按真实日期重读，无计时器/持续RAF或额外领奖', () => {
  const e = harness(); e.built(); assert.ok(e.G.sys.observatory.observe().ok); e.render(); e.allFrames(); e.visibility(true); e.at('2026-10-29'); e.visibility(false); e.allFrames(); assert.equal(state(e), 'ready'); assert.equal(e.G.state.observatory.fragments, 3); assert.equal(e.frames.size, 0);
});
test('状态、行动与具名插图可达；望远镜和规则可主动展开且回看不写档', () => {
  const e = harness(); e.built(); e.render(); e.allFrames();
  const intro = e.panelBody.querySelector('.observatory-intro'), copy = e.panelBody.querySelector('.observatory-copy'), picture = e.panelBody.querySelector('.observatory-picture');
  assert.ok(intro.contains(copy)); assert.ok(copy.contains(e.key('action'))); assert.ok(copy.querySelector('h3').textContent);
  assert.equal(e.key('action').type, 'button'); assert.equal(e.key('action').getAttribute('aria-describedby'), 'observatory-current-status');
  assert.equal(e.key('status').getAttribute('role'), 'status'); assert.equal(e.key('status').getAttribute('aria-live'), 'polite');
  assert.equal(picture.getAttribute('role'), 'img'); assert.match(picture.getAttribute('aria-label'), /阁楼|望远镜/);
  const before = JSON.stringify(e.G.state), preview = e.panelBody.querySelector('.observatory-attic-preview'), rules = e.panelBody.querySelector('.observatory-rules');
  assert.equal(preview.tagName, 'DETAILS'); assert.equal(rules.tagName, 'DETAILS');
  for (const details of [preview, rules]) {
    const summary = details.querySelector('summary'); assert.ok(summary.textContent.trim()); assert.equal(!!details.open, false);
    summary.focus(); assert.equal(e.document.activeElement, summary); summary.click(); assert.equal(details.open, true);
  }
  assert.ok(preview.contains(picture)); assert.match(preview.textContent, /穹顶|星空/);
  assert.match(rules.textContent, /20:00至次日06:00/); assert.match(rules.textContent, /本地日历日期一次/); assert.match(rules.textContent, /漏日不补领/);
  assert.ok(rules.textContent.includes('每次观星收下' + e.G.data.observatoryConfig.dailyFragments + '枚星星碎片'));
  preview.querySelector('summary').click(); assert.equal(preview.open, false);
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0); assert.equal(e.frames.size, 0);
  assert.equal(e.key('action').disabled, false); assert.equal(e.key('retry').disabled, false);
  e.click('action'); assert.equal(state(e), 'claimed'); assert.equal(e.G.state.observatory.fragments, e.G.data.observatoryConfig.dailyFragments);
});
test('折叠望远镜插图异常不阻断规则阅读或真实观测，重读可恢复插图', () => {
  const e = harness(); e.built(); const original = e.G.draw.observatory.draw;
  e.G.draw.observatory.draw = () => { throw new Error('合成望远镜插图异常'); }; const before = JSON.stringify(e.G.state);
  e.render(); e.allFrames(); assert.match(e.key('status').textContent, /星空插图暂不可用/);
  assert.equal(state(e), 'ready'); assert.equal(e.key('action').disabled, false); assert.equal(e.key('retry').disabled, false);
  const rules = e.panelBody.querySelector('.observatory-rules'); rules.querySelector('summary').click(); assert.equal(rules.open, true); assert.match(rules.textContent, /漏日不补领/);
  assert.equal(JSON.stringify(e.G.state), before); e.click('action'); assert.equal(e.G.state.observatory.observations, 1); assert.equal(state(e), 'claimed');
  e.G.draw.observatory.draw = original; e.click('retry'); assert.doesNotMatch(e.key('status').textContent, /星空插图暂不可用/); assert.equal(e.frames.size, 0);
});
test('夜蓝/暖纸正文、反馈和按钮文字色对比度至少4.5:1', () => {
  const lum = hex => { const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
  for (const [ink, paper] of [['fff5df','26334f'],['e1dfed','26334f'],['c7d0e5','26334f'],['fff0c8','26334f'],['fff5df','35435f'],['26334f','f5deb0'],['bfc8db','303d57'],['41445c','fff9ed'],['665b70','fff9ed'],['eff7e7','394e43'],['ffe9dc','674847']]) { const a = lum(ink), b = lum(paper); assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5, ink + '/' + paper); }
});
(async () => { for (const [name, fn] of tests) { await fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组观星面板隔离检查通过（内存DOM/模拟Canvas，不替代正式桌面/390px/焦点与设备验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
