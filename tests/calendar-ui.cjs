'use strict';
// 使用真实节日数据/领奖规则，加轻量DOM与绘图记录器检查日历交互契约。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function drawingContext() {
  const calls = []; let depth = 0;
  const context = { calls, get depth() { return depth; } };
  for (const method of ['beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke', 'ellipse', 'bezierCurveTo', 'translate', 'rotate', 'scale', 'fillText']) context[method] = (...args) => {
    args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), method + '必须使用有限坐标'); });
    if (method === 'ellipse') { assert.ok(args[2] >= 0); assert.ok(args[3] >= 0); }
    calls.push([method, ...args]);
  };
  context.save = () => { depth++; calls.push(['save']); };
  context.restore = () => { depth--; assert.ok(depth >= 0); calls.push(['restore']); };
  return context;
}
function sandbox() {
  const all = [], speech = [], toasts = [], panels = [], thumbnails = [], sounds = [], modals = [];
  let activeModal = null, running = false;
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.className = ''; this.listeners = {}; this.disabled = false; this._text = ''; all.push(this); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { assert.ok(node && typeof node === 'object'); this.children.push(node); node.parentElement = this; }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    click() { if (!this.disabled) (this.listeners.click || []).forEach(fn => fn({ target: this })); }
    get classList() {
      const apply = (name, enabled) => { const values = new Set(this.className.split(/\s+/).filter(Boolean)); if (enabled) values.add(name); else values.delete(name); this.className = [...values].join(' '); return enabled; };
      return { add: name => apply(name, true), toggle: (name, enabled) => apply(name, enabled === undefined ? !this.className.split(/\s+/).includes(name) : enabled), contains: name => this.className.split(/\s+/).includes(name) };
    }
    getContext() { return drawingContext(); }
  }
  const fixed = new Date(2026, 9, 27, 12).getTime();
  const environment = vm.createContext({
    console, Set, Float32Array,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } },
    document: { hidden: false, createElement: tag => new Node(tag), querySelector: () => activeModal && !activeModal.closed ? activeModal.element : null },
    requestAnimationFrame: fn => { fn(); return 1; }, setInterval: () => 1
  });
  environment.window = environment;
  for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/calendar.js', 'js/core/bus.js', 'js/systems/time.js', 'js/render/festival.js', 'js/ui/calendar.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file });
  const G = environment.Game;
  G.state = { settings: { dayMode: 'real' }, tutorial: { done: true }, calendar: { claimed: {} }, profile: { birthday: '' }, residents: {}, inventory: {}, collection: {}, memories: [] };
  G.store = { update(fn) { fn(G.state); G.bus.emit('state:change', G.state); } };
  G.audio = { play: kind => sounds.push(kind), stopSpeech() {} };
  G.render = { drawThumbnail: (node, id) => thumbnails.push(id) };
  G.ui.toast = text => toasts.push(text); G.ui.refresh = () => {};
  G.ui.speak = (text, source) => speech.push({ text, source }); G.ui.open = name => panels.push(name);
  G.ui.minigames = { isRunning: () => running }; G.ui.bakery = { isRunning: () => false };
  G.ui.modal = options => {
    const modal = { options, element: new Node('section'), closed: false, close() { this.closed = true; if (activeModal === this) activeModal = null; } };
    modal.element.append(options.content); activeModal = modal; modals.push(modal); return modal;
  };
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  return { G, environment, all, speech, toasts, panels, thumbnails, sounds, modals, descendants, setRunning: value => { running = value; } };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('18件家具motif全部有独立绘制，归一化尺寸/偏移与Canvas状态正确', () => {
  const { G } = sandbox();
  assert.equal(G.data.festivalFurniture.length, 18);
  assert.deepEqual(Array.from(G.draw.festival.motifs).sort(), Array.from(G.data.festivalFurniture, def => def.motif).sort());
  G.data.festivalFurniture.forEach(def => {
    const c = drawingContext(); assert.equal(G.draw.festival.draw(c, def, 12, 27), true); assert.equal(c.depth, 0);
    assert.deepEqual(c.calls[1], ['translate', 12, 27]); assert.deepEqual(c.calls[2], ['scale', def.w / 100, def.h / 100]);
    assert.ok(c.calls.some(call => call[0] === 'fill'), def.motif + '应有实体填色'); assert.ok(c.calls.some(call => call[0] === 'stroke'), def.motif + '应有手绘描边');
  });
  const missing = drawingContext(); assert.equal(G.draw.festival.draw(missing, { motif: 'unknown' }), false); assert.equal(missing.calls.length, 0);
});
test('活动通知打开指定节日信，正文与程序绘制礼物一致，无自动朗读', () => {
  const { G, speech, thumbnails, descendants, modals } = sandbox();
  const notice = G.ui.calendar.notices(); assert.ok(notice); assert.match(notice.textContent, /万圣节/);
  descendants(notice).find(node => node.tagName === 'BUTTON').click();
  assert.equal(modals.length, 1); const modal = modals[0]; assert.match(modal.options.title, /万圣节/); assert.match(modal.element.textContent, /团圆|南瓜/);
  assert.deepEqual(thumbnails, ['festival_pumpkin_lantern']); assert.equal(speech.length, 0);
  const hear = descendants(modal.element).find(node => node.dataset.speechKey); hear.click();
  assert.equal(speech.length, 1); assert.equal(speech[0].text, G.sys.time.current().events[0].greeting);
  assert.equal(hear.dataset.speechKey, 'calendar-2026:halloween'); assert.equal(hear.dataset.listenLabel, '🔊 听祝福');
});
test('礼物按钮只领一次，重开显示已领取并更新通知；无效旧日期入口不领礼', () => {
  const { G, descendants, sounds, toasts } = sandbox(); const modal = G.ui.calendar.open('halloween');
  const claim = descendants(modal.element).find(node => node.textContent === '收下小礼物'); claim.click(); claim.click();
  assert.equal(G.state.inventory.festival_pumpkin_lantern, 1); assert.equal(claim.disabled, true); assert.equal(claim.textContent, '礼物收好啦'); assert.deepEqual(sounds, ['success']);
  modal.close(); const reopened = G.ui.calendar.open('halloween');
  assert.equal(descendants(reopened.element).find(node => node.textContent === '礼物收好啦').disabled, true);
  assert.match(G.ui.calendar.notices().textContent, /礼物已收好/); assert.equal(G.ui.calendar.open('christmas'), null); assert.match(toasts.at(-1), /今天先收起来/);
});
test('首次会话祝福避开引导、已有弹窗、小游戏与后台，且不重复打断', () => {
  const { G, environment, setRunning, modals } = sandbox(); G.state.tutorial.done = false; assert.equal(G.ui.calendar.maybeGreet(), false);
  G.state.tutorial.done = true; setRunning(true); assert.equal(G.ui.calendar.maybeGreet(), false); setRunning(false);
  environment.document.hidden = true; assert.equal(G.ui.calendar.maybeGreet(), false); environment.document.hidden = false;
  const other = G.ui.modal({ content: environment.document.createElement('div') }); assert.equal(G.ui.calendar.maybeGreet(), false); other.close();
  assert.equal(G.ui.calendar.maybeGreet(), true); assert.equal(modals.length, 2); assert.equal(G.ui.calendar.maybeGreet(), false); modals.at(-1).close(); assert.equal(G.ui.calendar.maybeGreet(), false);
  G.sys.time.setDebug({ date: '2026-12-25' }); assert.equal(G.ui.calendar.maybeGreet(), true); assert.match(modals.at(-1).options.title, /圣诞/);
});
test('无节日不显示通知，手动打开可前往生日设置', () => {
  const { G, descendants, panels } = sandbox(); G.sys.time.setDebug({ date: '2026-11-15' });
  assert.equal(G.ui.calendar.notices(), null); assert.equal(G.ui.calendar.maybeGreet(), false);
  const modal = G.ui.calendar.open(); assert.match(modal.element.textContent, /生日到来时/);
  descendants(modal.element).find(node => node.tagName === 'BUTTON').click(); assert.equal(modal.closed, true); assert.deepEqual(panels, ['settings']);
});
test('玩家与居民生日都有明确祝福及一次礼物，听祝福不包含操作文字', () => {
  const { G, descendants, speech } = sandbox();
  G.state.profile.birthday = '11-15'; G.state.residents.lily = { movedIn: true, happiness: 60 };
  G.sys.time.setDebug({ date: '2026-11-15', festival: 'resident_birthday' });
  const modal = G.ui.calendar.open(); const buttons = descendants(modal.element).filter(node => node.dataset.speechKey); assert.equal(buttons.length, 2);
  buttons.forEach(node => node.click()); assert.ok(speech.every(item => !/收下小礼物|听祝福/.test(item.text)));
  descendants(modal.element).filter(node => node.textContent === '收下小礼物').forEach(node => node.click());
  assert.equal(G.state.inventory.festival_birthday_cake, 1); assert.equal(G.state.inventory.festival_birthday_hat, 1);
  assert.equal(G.state.calendar.claimed['2026:player_birthday'], true); assert.equal(G.state.calendar.claimed['2026:resident_birthday:lily'], true);
});
console.log('\n' + passed + ' 组节日日历界面与绘图验证通过。');
