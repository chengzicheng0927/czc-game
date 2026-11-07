'use strict';
// 运行真实设置/重新开始UI，使用可推进时钟检查拒写恢复路径；不启动浏览器或服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox() {
  let now = 100, serial = 0, panel = null, resetResult = { ok: false, message: '本机暂时无法保存，请先下载JSON存档。' }, importResult = { ok: false, message: '这次无法保存导入的小屋，原进度保持原样。' }, resetCalls = 0, exports = 0, panelCloses = 0, panelOpens = 0, confirmations = true;
  const timers = new Map(), ids = new Map(), modals = [], toasts = [], events = {};
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.className = ''; this._text = ''; this.style = {}; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentElement = this; }); }
    replaceChildren(...nodes) { const inside = (node, target) => node === target || node.children.some(child => inside(child, target)); if (document.activeElement && inside(this, document.activeElement)) document.activeElement = null; this.children.forEach(node => { node.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, fn) { (this.listeners[key] ||= []).push(fn); }
    fire(key, extra = {}) { return Promise.all((this.listeners[key] || []).map(fn => fn({ button: 0, pointerId: 1, preventDefault() {}, ...extra }))); }
    click() { return this.fire('click'); }
    focus() { document.activeElement = this; }
    setPointerCapture() {}
    querySelector() { return null; }
    get classList() {
      const change = (name, add) => { const all = new Set(this.className.split(/\s+/).filter(Boolean)); if (add) all.add(name); else all.delete(name); this.className = [...all].join(' '); };
      return { add: name => change(name, true), remove: name => change(name, false), contains: name => this.className.split(/\s+/).includes(name) };
    }
  }
  const document = {
    hidden: false, activeElement: null, body: new Node('body'), createElement: tag => new Node(tag),
    getElementById(id) { if (!ids.has(id)) ids.set(id, new Node('div')); return ids.get(id); },
    querySelectorAll: () => [],
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    removeEventListener(name, fn) { events[name] = (events[name] || []).filter(value => value !== fn); }
  };
  const G = {
    state: { profile: { name: '小设计师', birthday: '' }, house: { rooms: {}, floors: [] }, settings: { music: .2, sfx: .4, ttsVoice: '', dayMode: 'real', restReminder: true }, tutorial: { done: true, step: 8 } },
    runtime: { mode: 'explore', selected: null, placing: null, activeRoomId: null }, data: {}, sys: {}, render: { camera: { fit() {} } }, bus: { emit() {} },
    audio: { getVoices: () => [], stopSpeech() {} },
    ui: { controls: { label(control, text) { const label = new Node('label'); label.textContent = text; label.append(control); return label; }, enhanceRange() {}, select() { return new Node('button'); }, isOpen: () => false } },
    save: { status: '已保存', exportJson() { exports++; }, exportMemory() {}, reset() { resetCalls++; if (resetResult instanceof Error) throw resetResult; return resetResult; }, async importFile() { if (importResult instanceof Error) throw importResult; return importResult; } }
  };
  const environment = vm.createContext({ console, window: { Game: G }, document, location: { search: '' }, URLSearchParams, performance: { now: () => now },
    requestAnimationFrame: fn => { fn(); return 1; },
    setInterval(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay, delay }); return id; }, clearInterval: id => timers.delete(id), setTimeout() {}, clearTimeout() {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/ui.js'), 'utf8'), environment, { filename: 'js/ui/ui.js' });
  G.ui.selection = () => {}; G.ui.refresh = () => {}; G.ui.toast = text => toasts.push(text);
  G.ui.panel = { open(options) { panelOpens++; panel = options; document.getElementById('panel-body').replaceChildren(options.content); const surface = document.getElementById('panel'); surface.dataset.kind = options.title === '账号与云存档' ? 'cloudAccount' : 'settings'; surface.classList.remove('hidden'); }, close() { panelCloses++; } };
  G.ui.confirm = async () => confirmations;
  G.ui.modal = options => { const modal = { options, closed: false, close() { if (this.closed) return; this.closed = true; if (options.onClose) options.onClose(); } }; modals.push(modal); return modal; };
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  function control(node, label) { const value = descendants(node).find(item => item.tagName === 'BUTTON' && item.textContent === label); assert.ok(value, label); return value; }
  function advance(ms) { while (ms > 0) { now += Math.min(ms, 40); ms -= Math.min(ms, 40); for (const [id, task] of [...timers]) { if (timers.has(id) && task.at <= now) { task.at = now + task.delay; task.fn(); } } } }
  G.ui.open('settings');
  return { G, modals, toasts, timers, advance, control, descendants, panel: () => panel, node: tag => new Node(tag), focused: () => document.activeElement, panelOpens: () => panelOpens,
    result(value) { resetResult = value; }, confirm(value) { confirmations = value; }, resetCalls: () => resetCalls, exports: () => exports, panelCloses: () => panelCloses,
    importResult(value) { importResult = value; },
    async import() { await control(panel.content, '⬆ 导入JSON存档').click(); const picker = document.body.children.find(node => node.type === 'file'); assert.ok(picker); picker.files = [{ name: '我的小屋.json' }]; await picker.fire('change'); },
    async start() { await control(panel.content, '重新开始').click(); return modals.at(-1); } };
}
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
test('设置清楚区分本机保存、跨设备JSON迁移与只读回忆录', () => {
  const s = sandbox(), text = s.panel().content.textContent;
  assert.match(text, /进度自动保存在这个浏览器里/); assert.match(text, /不会自动同步到别的设备/); assert.match(text, /清除浏览器数据前/); assert.match(text, /MD回忆录只用来阅读/);
});
test('取消第一轮确认不会重置；不足三秒的长按可取消', async () => {
  const s = sandbox(); s.confirm(false); await s.start(); assert.equal(s.modals.length, 0); assert.equal(s.resetCalls(), 0);
  s.confirm(true); const modal = await s.start(), hold = s.control(modal.options.content, '按住3秒，重新开始');
  await hold.fire('pointerdown'); s.advance(2960); await hold.fire('pointerup'); s.advance(200);
  assert.equal(s.resetCalls(), 0); assert.equal(hold.textContent, '按住3秒，重新开始'); assert.equal(s.timers.size, 0);
});
test('拒写保留确认窗口、当前选择和下载路径，不显示成功；修复后可重新长按', async () => {
  const s = sandbox(), modal = await s.start(), body = modal.options.content, hold = s.control(body, '按住3秒，重新开始');
  const selected = { roomId: 'old_room', uid: 'old_item' }; s.G.runtime.selected = selected;
  await hold.fire('pointerdown'); s.advance(3000);
  assert.equal(s.resetCalls(), 1); assert.equal(modal.closed, false); assert.equal(s.G.runtime.selected, selected); assert.equal(s.panelCloses(), 0); assert.equal(s.toasts.length, 0); assert.equal(s.timers.size, 0);
  const alert = s.descendants(body).find(node => node.attributes.role === 'alert'); assert.match(alert.textContent, /暂时无法保存/); assert.ok(!alert.parentElement.classList.contains('hidden'));
  await s.control(body, '先下载当前JSON存档').click(); assert.equal(s.exports(), 1);
  s.result({ ok: true, message: '新小屋已经保存。' }); await hold.fire('keydown', { key: 'Enter', repeat: false }); s.advance(3000);
  assert.equal(s.resetCalls(), 2); assert.equal(modal.closed, true); assert.equal(s.panelCloses(), 1); assert.equal(s.toasts.at(-1), '新小屋已经保存。');
});
test('异常也保留原屋和可重试界面，保存后的初始化提醒留在设置中', async () => {
  const s = sandbox(), modal = await s.start(), body = modal.options.content, hold = s.control(body, '按住3秒，重新开始');
  s.result(new Error('浏览器拒绝保存。')); await hold.fire('pointerdown'); s.advance(3000); assert.equal(modal.closed, false); assert.match(body.textContent, /浏览器拒绝保存/); assert.equal(s.panelCloses(), 0);
  s.result({ ok: true, message: '新小屋已经保存。', warning: '新小屋已经保存，但部分活动尚未准备好。请先下载JSON存档，再重新打开游戏。' });
  await hold.fire('pointerdown'); s.advance(3000); assert.equal(modal.closed, true); assert.match(s.panel().content.textContent, /部分活动尚未准备好/);
  const alert = s.descendants(s.panel().content).find(node => node.attributes.role === 'alert'); assert.ok(alert); assert.match(alert.textContent, /已经保存/);
});
test('导入拒写与异常的原因留在设置，保留选择/下载路径，重试成功清除旧提醒', async () => {
  const s = sandbox(), selected = { roomId: 'old_room', uid: 'old_item' }; s.G.runtime.selected = selected;
  await s.import(); assert.equal(s.G.runtime.selected, selected); assert.match(s.panel().content.textContent, /无法保存导入的小屋/); assert.ok(s.control(s.panel().content, '⬇ 下载JSON存档'));
  s.importResult(new Error('暂时读不到这个文件，请再选择一次。')); await s.import(); assert.equal(s.G.runtime.selected, selected); assert.match(s.panel().content.textContent, /暂时读不到这个文件/);
  s.importResult({ ok: true, message: '小屋已经恢复。', warning: '小屋已经保存，但活动尚未准备好。' }); await s.import(); assert.match(s.panel().content.textContent, /活动尚未准备好/);
  s.importResult({ ok: true, message: '小屋已经恢复。' }); await s.import(); assert.doesNotMatch(s.panel().content.textContent, /活动尚未准备好|暂时读不到这个文件|无法保存导入的小屋/); assert.equal(s.toasts.at(-1), '小屋已经恢复。');
});
test('账号面板重复刷新不重挂表单，密码值和焦点均保留', () => {
  const s = sandbox(), content = s.node('div'), password = s.node('input'); password.type = 'password'; password.dataset.uiFocus = 'cloud-password'; password.value = 'only-in-memory'; content.append(password);
  s.G.ui.cloudAccount = { panel: () => ({ title: '账号与云存档', content }), close() {} };
  s.G.ui.open('cloudAccount'); password.focus(); const opens = s.panelOpens(); s.G.ui.open('cloudAccount'); s.G.ui.open('cloudAccount');
  assert.equal(s.panelOpens(), opens); assert.equal(s.focused(), password); assert.equal(password.value, 'only-in-memory'); assert.equal(s.panel().content, content);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组设置与存档恢复反馈检查通过（未执行浏览器界面验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
