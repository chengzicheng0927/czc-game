'use strict';
// MC-064：合成档案、内存DOM与真实login/store/save；不载scene、账号或私人存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push([name, fn]);
function harness() {
  let clock = new Date(2026, 9, 28, 12).getTime(), denyWrite = false, nextFrame = 0, nextTimer = 0, booting = true, modal = null;
  const frames = new Map(), timers = new Map(), storage = new Map(), audio = [], toasts = [], draws = [], cancelled = [], errors = [];
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this.disabled = false; this.scrollTop = 0; this._text = ''; }
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
    // 补足原生summary的默认展开行为；这里只模拟DOM平台，不模拟产品动作。
    click() {
      if (this.disabled) return;
      this.dispatch('click');
      if (this.tagName === 'SUMMARY' && this.parentElement?.tagName === 'DETAILS') this.parentElement.open = !this.parentElement.open;
    }
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
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; }, remove: name => { this.className = this.className.split(/\s+/).filter(c => c !== name).join(' '); } }; }
    getContext() { if (!this.ctx) this.ctx = { cleared: 0, clearRect() { this.cleared++; } }; return this.ctx; }
  }
  const document = { hidden: false, body: null, activeElement: null, createElement: tag => new Node(tag), getElementById: id => document.body.querySelector('#' + id), querySelector: selector => document.body.querySelector(selector), addEventListener() {} };
  document.body = new Node('body'); document.activeElement = document.body;
  const host = new Node('section'), panelTitle = new Node('h2'), panelBody = new Node('div'); host.id = 'panel'; host.className = 'hidden'; panelTitle.id = 'panel-title'; panelBody.id = 'panel-body'; host.append(panelTitle, panelBody); document.body.append(host);
  const RealDate = Date; class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console: { log: console.log, error: (...args) => errors.push(args) }, document, Blob, URL, Date: TestDate,
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame: id => { cancelled.push(id); frames.delete(id); },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id), setInterval() { if (!booting) throw new Error('UI不得新增轮询'); return 1; }, clearInterval() {} });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (denyWrite) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  const files = ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/login.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js','js/systems/systems.js','js/systems/login.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(); G.sys.init(); booting = false; timers.clear(); G.audio = { play: value => audio.push(value) }; G.render = { drawThumbnail: (canvas, id) => draws.push({ canvas, id }) };
  G.ui = { controls: { close() {} }, toast: value => toasts.push(value), panel: { close() { if (host.classList.contains('hidden')) return; host.className = 'hidden'; G.bus.emit('panel:change', { open: false }); } }, modal(options) {
    modal?.close(); const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), body = new Node('div'); overlay.className = 'modal-backdrop'; element.className = 'modal-card'; body.className = 'modal-body'; body.append(options.content); element.append(body); overlay.append(element); document.body.append(overlay);
    let closed = false; const handle = { element, body, close() { if (closed) return; closed = true; overlay.remove(); if (modal === handle) modal = null; options.onClose?.(); if (previous.isConnected) previous.focus(); G.bus.emit('modal:closed', {}); } }; modal = handle;
    context.requestAnimationFrame(() => body.querySelectorAll('button').find(node => !node.disabled)?.focus()); return handle;
  } };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/login.js'), 'utf8'), context, { filename: 'js/ui/login.js' });
  function render() { const descriptor = G.ui.login.panel(); host.className = ''; host.dataset.kind = 'login'; panelTitle.textContent = descriptor.title; panelBody.replaceChildren(descriptor.content); return descriptor; }
  const rootNode = () => modal?.body || panelBody;
  const key = name => rootNode().querySelector('[data-ui-focus="login-' + name + '"]');
  const flush = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); };
  const allFrames = () => { let n = 0; while (frames.size) { assert.ok(++n < 12, '不得持续RAF'); flush(); } assert.deepEqual(errors, []); };
  const click = name => { const node = key(name); assert.ok(node, name); node.focus(); node.click(); allFrames(); return node; };
  const at = date => { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], 12).getTime(); };
  const advance = () => { clock += 86400000; };
  const through = count => { for (let i = 0; i < count; i++) { if (i) advance(); assert.ok(G.sys.login.claim().ok); } };
  const ready = () => G.store.update(state => { state.tutorial.done = true; });
  function queuedRefresh() { let pending = false; G.bus.on('state:change', () => { if (pending) return; pending = true; context.requestAnimationFrame(() => { pending = false; if (!host.classList.contains('hidden') && host.dataset.kind === 'login') render(); }); }); }
  const promptTimers = () => [...timers.values()].filter(entry => entry.ms === 700);
  const runPromptTimer = () => { const entries = [...timers]; for (const [id, entry] of entries) if (entry.ms === 700) { timers.delete(id); entry.fn(); } };
  return { G, Node, document, host, panelTitle, panelBody, context, frames, timers, storage, audio, toasts, draws, cancelled, render, key, click, allFrames, flush, at, advance, through, ready, parse, queuedRefresh, rootNode, promptTimers, runPromptTimer, writeFails(value) { denyWrite = value; }, get modal() { return modal; } };
}
const state = e => e.rootNode().querySelector('.login-book').dataset.state;
const text = e => e.rootNode().textContent;
function spy(e, name) { const original = e.G.sys.login[name]; let count = 0; e.G.sys.login[name] = (...args) => { count++; return original(...args); }; return () => count; }
function card(e) { return e.rootNode().querySelector('.login-present'); }
function assertClaimReason(e, expected) {
  const status = e.key('status'), action = e.key('claim'), reason = e.G.sys.login.status().reason;
  assert.ok(reason, '受阻状态必须有明确原因'); assert.match(reason, expected);
  assert.equal(status.textContent, reason, '完整展示当前系统原因');
  assert.equal(status.isConnected, true); assert.equal(status.hidden, false);
  assert.equal(status.getAttribute('role'), 'status'); assert.equal(status.getAttribute('aria-live'), 'polite');
  const descriptions = (action.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  assert.ok(descriptions.includes(status.id), '领取动作通过aria关联当前原因');
  assert.equal(e.rootNode().querySelector('#' + status.id), status);
}

test('API/抽屉/独立content保持；查询与七格预览不写入', () => {
  const e = harness(), before = JSON.stringify(e.G.state); assert.deepEqual(Object.keys(e.G.ui.login), ['content','panel','open','maybePrompt']); e.render(); e.allFrames();
  assert.equal(state(e), 'ready'); assert.equal(e.panelBody.querySelectorAll('.login-day').length, 7); assert.equal(JSON.stringify(e.G.state), before); assert.match(text(e), /第1轮 · 0\/7份/); assert.match(text(e), /累计已收 0份/);
  const detached = e.G.ui.login.content(); e.panelBody.replaceChildren(detached); e.allFrames(); assert.equal(e.key('claim').disabled, false); assert.equal(JSON.stringify(e.G.state), before);
});
test('七份固定内容与每轮总量完整；未来家具只呈类别', () => {
  const e = harness(); e.render(); e.allFrames(); const days = e.panelBody.querySelectorAll('.login-day');
  assert.deepEqual(days.map(node => node.querySelector('.login-day-name').textContent), ['50颗糖果','100颗糖果','花果种子包','150颗糖果','精致家具','200颗糖果','稀有家具']);
  assert.match(text(e), /每轮 500颗糖果 · 7粒种子 · 2件家具/); assert.match(text(e), /漏登不清零、不跳份，也不补领/); assert.equal(days[0].getAttribute('aria-current'), 'step'); assert.equal(e.draws.length, 0);
});
test('保存成功才勾选/音效/回执；焦点移至反馈，按钮不重领', () => {
  const e = harness(); e.render(); e.allFrames(); const calls = spy(e, 'claim'), coin = e.G.state.wallet.coin; e.click('claim');
  assert.equal(calls(), 1); assert.equal(e.G.state.wallet.coin, coin + 50); assert.equal(state(e), 'claimed'); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 1);
  assert.match(card(e).textContent, /已收好 · 第1份：50颗糖果/); assert.equal(e.key('claim').disabled, true); assert.equal(e.document.activeElement, e.key('feedback')); assert.equal(e.key('feedback').getAttribute('role'), 'status'); assert.equal(e.key('feedback').focusOptions.preventScroll, true); assert.deepEqual(e.audio, ['success']); assert.equal(e.toasts.length, 1);
  e.key('claim').dispatch('click'); assert.equal(calls(), 1); assert.equal(JSON.parse(e.storage.get(e.G.data.balance.saveKey)).loginRewards.claimed, 1);
});
test('真实setItem拒写保持进度/存档/资格；失败焦点与重建回执保持，重试成功', () => {
  const e = harness(); assert.ok(e.G.save.flush()); const before = JSON.stringify(e.G.state), disk = e.storage.get(e.G.data.balance.saveKey); e.render(); e.allFrames(); e.panelBody.scrollTop = 137; e.writeFails(true); e.click('claim');
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.storage.get(e.G.data.balance.saveKey), disk); assert.equal(e.key('claim').disabled, false); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 0); assert.equal(e.key('feedback').getAttribute('role'), 'alert'); assert.match(e.key('feedback').textContent, /进度和奖励保持原样/); assert.equal(e.document.activeElement, e.key('claim')); assert.equal(e.panelBody.scrollTop, 137); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0);
  e.render(); e.allFrames(); assert.equal(e.document.activeElement, e.key('claim')); assert.equal(e.panelBody.scrollTop, 137); assert.match(e.key('feedback').textContent, /还没有领走/); e.writeFails(false); e.click('claim'); assert.equal(e.G.state.loginRewards.claimed, 1);
});
test('真实存档容量失败无假成功，恢复限制后可再领', () => {
  const e = harness(), before = JSON.stringify(e.G.state), limit = e.G.data.balance.maxSaveBytes; e.render(); e.allFrames(); e.G.data.balance.maxSaveBytes = 1; e.click('claim');
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0); assert.equal(state(e), 'ready'); e.G.data.balance.maxSaveBytes = limit; e.click('claim'); assert.equal(state(e), 'claimed');
});
test('弹窗领取失败/成功均保留宿主滚动；焦点分别留领取按钮/回执', () => {
  const e = harness(); e.G.ui.login.open(); e.allFrames(); const modal = e.modal; modal.body.scrollTop = 93; e.writeFails(true); e.click('claim'); assert.equal(e.modal, modal); assert.equal(modal.body.scrollTop, 93); assert.equal(e.document.activeElement, e.key('claim')); assert.equal(e.key('claim').focusOptions.preventScroll, true); e.writeFails(false); e.click('claim'); assert.equal(modal.body.scrollTop, 93); assert.equal(e.document.activeElement, e.key('feedback')); assert.equal(e.key('feedback').focusOptions.preventScroll, true); assert.equal(e.audio.length, 1);
});
test('点击前重读资格：渲染后钱包变满，不调用claim或乐观打勾', () => {
  const e = harness(); e.render(); e.allFrames(); const calls = spy(e, 'claim'); e.G.store.update(s => { s.wallet.coin = 1000000000; }); e.click('claim'); assert.equal(calls(), 0); assert.equal(e.G.state.loginRewards.claimed, 0); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 0); assert.equal(state(e), 'blocked'); assert.match(e.key('feedback').textContent, /糖果罐快装满/); assert.equal(e.document.activeElement, e.key('feedback')); assert.equal(e.audio.length, 0);
});
test('今天已领显示真实lastReward，不将下一份糖果冒充历史', () => {
  const e = harness(); e.through(2); e.render(); e.allFrames(); assert.equal(e.G.sys.login.status().reward.kind, 'seeds'); assert.match(card(e).textContent, /已收好 · 第2份：100颗糖果/); assert.doesNotMatch(card(e).textContent, /第3份|花果种子包/); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 2);
});
test('旧档lastReward为null，只保留领取事实，不编造具体礼物', () => {
  const e = harness(), legacy = e.parse(e.G.state); delete legacy.loginRewards; legacy.daily.giftClaimed = true; e.G.store.replace(legacy); e.render(); e.allFrames();
  assert.equal(e.G.sys.login.latest(), null); assert.equal(state(e), 'claimed'); assert.match(card(e).textContent, /礼物详情未保留/); assert.doesNotMatch(card(e).textContent, /50颗糖果|100颗糖果|第2份/); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 1); assert.equal(e.key('claim').disabled, true);
});
test('回拨独立说明与真实最近礼物；恢复原日不能再领，更晚日期才继续', () => {
  const e = harness(); e.through(2); e.at('2026-10-27'); e.render(); e.allFrames(); assert.equal(state(e), 'clock'); assert.match(card(e).textContent, /最近收好 · 第2份：100颗糖果/); assert.match(text(e), /当前本地日期2026-10-27早于领取记录2026-10-29/); assert.match(text(e), /严格晚于记录/); assert.doesNotMatch(card(e).textContent, /今天.*已经收好/); assert.equal(e.key('claim').disabled, true);
  e.at('2026-10-29'); e.click('retry'); assert.equal(state(e), 'claimed'); e.at('2026-10-30'); e.click('retry'); assert.equal(state(e), 'ready'); assert.match(card(e).textContent, /第3份：花果种子包/);
});
test('漏登一个月继续下一份，种子数量与去向完整', () => {
  const e = harness(); e.through(2); e.at('2026-11-29'); e.render(); e.allFrames(); assert.match(card(e).textContent, /第3份：花果种子包/); assert.match(card(e).textContent, /小雏菊×3、郁金香×2、草莓×2/); e.click('claim'); assert.equal(e.G.state.loginRewards.claimed, 3); assert.equal(e.G.state.garden.seeds.tulip, 2); assert.equal(e.G.state.garden.seeds.strawberry, 2);
});
test('第七份当天与回拨保持第一轮7/7；下个可领日才第二轮0/7', () => {
  const e = harness(); e.through(7); const id = e.G.sys.login.latest().itemId; e.render(); e.allFrames(); assert.match(text(e), /第1轮 · 7\/7份/); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 7); assert.match(card(e).textContent, /已收好 · 第7份/); assert.equal(e.draws.at(-1).id, id);
  e.at('2026-11-02'); e.click('retry'); assert.equal(state(e), 'clock'); assert.match(text(e), /第1轮 · 7\/7份/); e.at('2026-11-04'); e.click('retry'); assert.match(text(e), /第2轮 · 0\/7份/); assert.match(card(e).textContent, /本次礼物 · 第1份：50颗糖果/); assert.equal(e.panelBody.querySelectorAll('.is-collected').length, 0);
});
test('第五/七份真实动态家具名称、主题与原缩略图itemId一致，不固定样本', () => {
  const e = harness(); e.through(4); e.advance(); const ids = new Set();
  for (const date of ['2026-11-01','2026-11-05','2026-12-12']) { e.at(date); const reward = e.G.sys.login.status().reward, def = e.G.data.furnitureById[reward.itemId]; ids.add(def.id); e.render(); e.allFrames(); assert.ok(card(e).textContent.includes(def.name)); assert.ok(card(e).textContent.includes(e.G.data.themes[def.theme].name)); assert.equal(e.draws.at(-1).id, def.id); assert.equal(e.G.state.loginRewards.claimed, 4); }
  assert.ok(ids.size > 1); e.click('claim'); const received = e.G.sys.login.latest(); assert.equal(e.draws.at(-1).id, received.itemId); e.advance(); assert.ok(e.G.sys.login.claim().ok); e.advance(); e.render(); e.allFrames(); assert.match(card(e).textContent, /稀有家具/); assert.equal(e.G.data.furnitureById[e.draws.at(-1).id].rarity, 'rare');
});
test('同款家具库存+1点亮collection，不刷购买/摆放；满9999不换奖', () => {
  const e = harness(); e.through(4); e.advance(); const id = e.G.sys.login.status().reward.itemId; e.G.store.update(s => { s.inventory[id] = 9999; }); const before = JSON.stringify(e.G.state), calls = spy(e, 'claim'); e.render(); e.allFrames();
  assert.equal(state(e), 'blocked'); assertClaimReason(e, /背包格已经装满/); assert.match(card(e).textContent, /不更换这份礼物/); assert.equal(e.G.sys.login.status().reward.itemId, id); assert.equal(e.key('claim').disabled, true); e.key('claim').dispatch('click'); assert.equal(calls(), 0); e.click('retry'); assert.equal(e.G.sys.login.status().reward.itemId, id, '重读不更换满库存礼物'); assertClaimReason(e, /背包格已经装满/); assert.equal(e.draws.at(-1).id, id); assert.equal(JSON.stringify(e.G.state), before);
  e.G.store.update(s => { s.inventory[id] = 9998; }); e.click('retry'); e.click('claim'); assert.equal(e.G.sys.login.latest().itemId, id); assert.equal(e.G.state.inventory[id], 9999); assert.equal(e.G.state.collection[id], true); assert.equal(e.G.state.quests.stats.bought, 0); assert.equal(e.G.state.quests.stats.itemsPlaced, 0);
});
test('钱包与种子上限原因全显；整理后重读同份继续领取', () => {
  const e = harness(); e.G.store.update(s => { s.wallet.coin = 999999951; }); e.render(); e.allFrames(); assert.equal(state(e), 'blocked'); assertClaimReason(e, /糖果罐快装满/); e.G.store.update(s => { s.wallet.coin = 0; }); e.click('retry'); e.click('claim'); e.advance(); assert.ok(e.G.sys.login.claim().ok); e.advance(); e.G.store.update(s => { s.garden.seeds.tulip = 9998; }); e.render(); e.allFrames(); assertClaimReason(e, /种子袋快装满/); assert.equal(e.key('claim').disabled, true); e.G.store.update(s => { s.garden.seeds.tulip = 9997; }); e.click('retry'); e.click('claim'); assert.equal(e.G.state.garden.seeds.tulip, 9999);
});
test('累计十亿上限不截断轮次/次数，拒领保留原记录', () => {
  const e = harness(); e.G.store.update(s => { s.loginRewards = { claimed: 1000000000, lastClaimDate: '2026-10-27', lastReward: Object.assign(e.G.data.loginReward(6, '2026-10-27', 999999999), { at: Date.now() }) }; }); e.render(); e.allFrames(); const before = JSON.stringify(e.G.state), calls = spy(e, 'claim'); assert.match(text(e), /1,000,000,000份/); assert.match(text(e), /第142,857,143轮/); assertClaimReason(e, /心意记录已经装满/); e.key('claim').dispatch('click'); assert.equal(calls(), 0); assert.equal(JSON.stringify(e.G.state), before);
});
test('系统同步重入与旧按钮点击最多调用一次claim', () => {
  const e = harness(); e.render(); e.allFrames(); const old = e.key('claim'), calls = spy(e, 'claim'); e.G.bus.on('state:change', () => old.dispatch('click')); e.G.bus.on('login:claimed', () => old.dispatch('click')); e.click('claim'); old.dispatch('click'); assert.equal(calls(), 1); assert.equal(e.G.state.loginRewards.claimed, 1); assert.equal(e.audio.length, 1);
});
test('共享state刷新重建后的成功焦点/反馈/滚动保持', () => {
  const e = harness(); e.render(); e.allFrames(); e.queuedRefresh(); e.panelBody.scrollTop = 111; e.click('claim'); assert.equal(e.document.activeElement, e.key('feedback')); assert.equal(e.panelBody.scrollTop, 111); assert.equal(e.key('feedback').getAttribute('role'), 'status'); assert.equal(e.G.state.loginRewards.claimed, 1); assert.equal(e.audio.length, 1);
});
test('抽屉重建、关闭仍连接DOM、切别的面板后旧按钮全部失效', () => {
  const e = harness(); e.render(); e.allFrames(); const old = e.key('claim'), calls = spy(e, 'claim'); e.render(); e.allFrames(); old.dispatch('click'); assert.equal(calls(), 0); const closed = e.key('claim'); e.G.ui.panel.close(); assert.equal(closed.isConnected, true); closed.dispatch('click'); assert.equal(calls(), 0); e.render(); e.allFrames(); const other = e.key('claim'); e.host.dataset.kind = 'settings'; e.G.bus.emit('panel:change', { open: true }); other.dispatch('click'); assert.equal(calls(), 0);
});
test('弹窗入口沿用宿主，关闭/重开后旧按钮与绘图失效', () => {
  const e = harness(); e.through(4); e.advance(); const first = e.G.ui.login.open(); assert.ok(first.element.classList.contains('login-modal-card')); const button = e.key('claim'), canvas = card(e).querySelector('canvas'), pending = [...e.frames.values()], calls = spy(e, 'claim'); first.close(); pending.forEach(fn => fn()); button.dispatch('click'); assert.equal(calls(), 0); assert.equal(e.draws.length, 0); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); e.G.ui.login.open(); e.allFrames(); e.click('claim'); assert.equal(e.G.state.loginRewards.claimed, 5);
});
test('换档关闭旧弹窗、清提示日期/700ms timer，旧按钮和迟到反馈不进入新档', () => {
  const e = harness(); e.ready(); const fresh = e.parse(e.G.state); assert.equal(e.G.ui.login.maybePrompt(), true); e.allFrames(); const old = e.key('claim'), calls = spy(e, 'claim'); e.G.store.replace(fresh); assert.equal(e.modal, null); assert.equal(e.promptTimers().length, 0); old.dispatch('click'); assert.equal(calls(), 0); assert.equal(e.G.ui.login.maybePrompt(), true); e.allFrames();
  const off = e.G.bus.on('login:claimed', () => e.G.store.replace(fresh)); e.click('claim'); off(); assert.equal(e.G.state.loginRewards.claimed, 0); assert.equal(e.modal, null); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); assert.equal(e.promptTimers().length, 0);
});
test('公开content被通用弹窗承载，关闭也取消RAF并清理Canvas', () => {
  const e = harness(); e.through(4); e.advance(); const content = e.G.ui.login.content(), handle = e.G.ui.modal({ content }); e.allFrames(); const canvas = content.querySelector('canvas'), old = content.querySelector('[data-ui-focus="login-claim"]'), calls = spy(e, 'claim'); assert.equal(canvas.width, 260); handle.close(); old.dispatch('click'); assert.equal(calls(), 0); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); assert.equal(e.frames.size, 0);
});
test('抽屉换档后旧内容不能领取，重建才读取新档', () => {
  const e = harness(); e.render(); e.allFrames(); const old = e.key('claim'), fresh = e.parse(e.G.state), calls = spy(e, 'claim'); e.G.store.replace(fresh); old.dispatch('click'); assert.equal(calls(), 0); e.render(); e.allFrames(); e.click('claim'); assert.equal(calls(), 1);
});
test('领取期间关闭或重建，不播迟到成功反馈', () => {
  for (const mode of ['close','rebuild']) { const e = harness(); e.render(); e.allFrames(); e.G.bus.on('login:claimed', () => { if (mode === 'close') e.G.ui.panel.close(); else e.render(); }); e.click('claim'); assert.equal(e.G.state.loginRewards.claimed, 1); assert.equal(e.audio.length, 0); assert.equal(e.toasts.length, 0); }
});
test('status/latest/description读取异常可重读恢复，不留下可领奖假态', () => {
  for (const api of ['status','latest','description']) { const e = harness(), original = e.G.sys.login[api]; e.G.sys.login[api] = () => { throw new Error('test'); }; e.render(); e.allFrames(); assert.equal(state(e), 'unreadable'); assert.equal(e.key('claim').disabled, true); assert.equal(e.key('retry').disabled, false); e.G.sys.login[api] = original; e.click('retry'); assert.equal(state(e), 'ready'); assert.equal(e.document.activeElement, e.key('retry')); }
});
test('claim异常及返回不明都不给成功反馈，可以重读后重试', () => {
  const e = harness(); e.render(); e.allFrames(); const original = e.G.sys.login.claim; e.G.sys.login.claim = () => { throw new Error('test'); }; e.click('claim'); assert.match(e.key('feedback').textContent, /结果暂未确认/); assert.equal(e.audio.length, 0); assert.equal(e.key('claim').disabled, false); e.G.sys.login.claim = () => undefined; e.click('claim'); assert.equal(e.key('feedback').getAttribute('role'), 'alert'); e.G.sys.login.claim = original; e.click('retry'); e.click('claim'); assert.equal(e.G.state.loginRewards.claimed, 1);
});
test('原缩略图失败只影响插图，文字/领取与重读仍可用', () => {
  const e = harness(); e.through(4); e.advance(); const id = e.G.sys.login.status().reward.itemId; e.G.render.drawThumbnail = () => { throw new Error('drawing'); }; e.render(); e.allFrames(); assert.match(card(e).textContent, /插图暂不可用/); assert.ok(card(e).textContent.includes(e.G.data.furnitureById[id].name)); assert.equal(e.key('claim').disabled, false); e.click('claim'); assert.equal(e.G.sys.login.latest().itemId, id); assert.equal(e.audio.length, 1);
});
test('按需RAF取消与迟到帧不绘旧家具；无持续动画或轮询', () => {
  const e = harness(); e.through(4); e.advance(); e.render(); const canvas = card(e).querySelector('canvas'), stolen = [...e.frames.values()]; e.render(); stolen.forEach(fn => fn()); e.allFrames(); assert.equal(canvas.width, 0); assert.equal(e.draws.length, 1); assert.ok(e.cancelled.length); assert.equal(e.frames.size, 0); e.G.ui.panel.close(); assert.equal(e.draws[0].canvas.width, 0);
});
test('自动提示原门禁：引导/可见/抽屉/弹层/可领同时满足才打开', () => {
  const e = harness(), api = e.G.ui.login; assert.equal(api.maybePrompt(), false); e.ready(); e.document.hidden = true; assert.equal(api.maybePrompt(), false); e.document.hidden = false; e.host.className = ''; e.host.dataset.kind = 'settings'; assert.equal(api.maybePrompt(), false); e.host.className = 'hidden'; const overlay = new e.Node('div'); overlay.className = 'modal-backdrop'; e.document.body.append(overlay); assert.equal(api.maybePrompt(), false); overlay.remove(); e.G.store.update(s => { s.wallet.coin = 1000000000; }); assert.equal(api.maybePrompt(), false); e.G.store.update(s => { s.wallet.coin = 0; }); assert.equal(api.maybePrompt(), true); e.allFrames(); assert.equal(e.G.state.loginRewards.claimed, 0);
});
test('同日只提示一次，手动抽屉也记已提示；下个本地日期可再提示', () => {
  const e = harness(); e.ready(); e.render(); e.allFrames(); assert.equal(e.G.ui.login.maybePrompt(), false); e.G.ui.panel.close(); assert.equal(e.G.ui.login.maybePrompt(), false); e.advance(); assert.equal(e.G.ui.login.maybePrompt(), true); e.allFrames(); e.modal.close(); e.runPromptTimer(); assert.equal(e.modal, null); assert.equal(e.promptTimers().length, 0); assert.equal(e.G.ui.login.maybePrompt(), false);
});
test('modal:closed仅一个700ms检查，不抢新弹层，不循环重试', () => {
  const e = harness(); e.ready(); e.G.bus.emit('modal:closed', {}); e.G.bus.emit('modal:closed', {}); assert.equal(e.promptTimers().length, 1); const overlay = new e.Node('div'); overlay.className = 'modal-backdrop'; e.document.body.append(overlay); e.runPromptTimer(); assert.equal(e.modal, null); assert.equal(e.promptTimers().length, 0); overlay.remove(); e.G.bus.emit('modal:closed', {}); e.runPromptTimer(); assert.ok(e.modal); e.allFrames(); assert.equal(e.promptTimers().length, 0);
});
test('长名称、七份进度与领取状态具名可读；展开规则可查看总量和真实累计', () => {
  const e = harness(); e.through(4); e.advance(); const id = e.G.sys.login.status().reward.itemId;
  e.G.data.furnitureById[id].name = '很长的家具名字'.repeat(12); e.render(); e.allFrames();
  const present = card(e), title = e.panelBody.querySelector('#' + present.getAttribute('aria-labelledby')), days = e.panelBody.querySelector('.login-days');
  assert.ok(present.textContent.includes(e.G.data.furnitureById[id].name)); assert.ok(title.textContent.includes(e.G.data.furnitureById[id].name));
  assert.equal(days.tagName, 'OL'); assert.equal(days.getAttribute('aria-label'), '七份心意进度'); assert.equal(days.querySelectorAll('li').length, e.G.data.loginDays.length);
  assert.equal(e.key('claim').getAttribute('aria-describedby'), e.key('status').id); assert.equal(e.key('claim').type, 'button');
  assert.equal(e.key('status').getAttribute('role'), 'status'); assert.equal(e.key('status').getAttribute('aria-live'), 'polite'); assert.equal(e.key('status').getAttribute('aria-atomic'), 'true');
  const rules = e.panelBody.querySelector('.login-footnote'), summary = rules.querySelector('summary'), before = JSON.stringify(e.G.state);
  assert.equal(rules.tagName, 'DETAILS'); assert.ok(summary.textContent.trim()); assert.equal(!!rules.open, false);
  summary.focus(); assert.equal(e.document.activeElement, summary); summary.click(); assert.equal(rules.open, true);
  assert.match(rules.textContent, /每轮 500颗糖果 · 7粒种子 · 2件家具/); assert.match(rules.textContent, /收齐第七份当天仍是本轮7\/7/);
  assert.match(rules.textContent, /下个可领取的本地日期/); assert.ok(rules.textContent.includes('累计已收 ' + e.G.sys.login.status().claimed + '份'));
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.audio.length, 0);
  assert.equal(e.key('claim').disabled, false); e.click('retry'); assert.equal(e.document.activeElement, e.key('retry')); assert.equal(rules.open, true);
  assert.ok(title.textContent.includes(e.G.data.furnitureById[id].name)); assert.equal(JSON.stringify(e.G.state), before);
  e.click('claim'); assert.equal(e.G.sys.login.latest().itemId, id); assert.equal(e.key('claim').disabled, true); assert.equal(e.document.activeElement, e.key('feedback'));
  assert.ok(rules.textContent.includes('累计已收 ' + e.G.sys.login.status().claimed + '份'));
  summary.click(); assert.equal(rules.open, false); assert.equal(e.frames.size, 0);
});

module.exports = { harness };
if (require.main === module) (async () => { for (const [name, fn] of tests) { await fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组七份心意UI隔离检查通过（不代表正式浏览器/读屏/设备验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
