'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox(saved = []) {
  const storage = new Map(saved), downloads = []; let denied = false, writes = 0;
  const environment = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {}, addEventListener() {}, document: { addEventListener() {} } });
  environment.window = environment;
  environment.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (denied) throw new Error('QuotaExceededError'); writes++; storage.set(key, value); } };
  for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/minigames.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/exterior.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/exterior.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file });
  const G = environment.Game; G.utils.download = (name, value) => downloads.push({ name, value });
  // 使用真实store，默认/旧档迁移由入口模块负责，不能在测试里绕过校验补字段。
  G.store.init(G.save.load());
  return { G, environment, storage, downloads, writeFails: value => { denied = value; }, writes: () => writes, parse: text => vm.runInContext('JSON.parse(' + JSON.stringify(text) + ')', environment) };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('31款外观数量、货币/等级配置与默认免费拥有权一致', () => {
  const { G } = sandbox(), catalog = G.data.exteriorCatalog;
  assert.deepEqual(Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, values.length])), { roof: 8, wall: 8, window: 6, door: 6, chimney: 3 });
  const defs = Object.values(catalog).flat(); assert.equal(new Set(defs.map(def => def.id)).size, 31); assert.ok(defs.some(def => def.currency === 'heart')); assert.ok(defs.some(def => def.unlockLv > 1));
  assert.equal(G.data.validateExterior(G.state.house.exterior), true); ['roof_triangle', 'wall_wood', 'win_square', 'door_wood', 'normal', 'none'].forEach(id => assert.equal(G.sys.exterior.owned(id), true));
});
test('糖果购买仅扣一次，购买与换上分开；错误类目或未拥有不能装备', () => {
  const { G } = sandbox(), sys = G.sys.exterior, before = G.state.wallet.coin;
  assert.equal(sys.equip('roof', 'roof_round').ok, false); assert.equal(sys.buy('roof_round').ok, true); assert.equal(G.state.wallet.coin, before - 60); assert.equal(G.state.house.exterior.roof, 'roof_triangle');
  assert.equal(sys.buy('roof_round').ok, false); assert.equal(G.state.wallet.coin, before - 60); assert.equal(sys.equip('window', 'roof_round').ok, false);
  assert.equal(sys.equip('roof', 'roof_round').ok, true); assert.equal(G.state.house.exterior.roof, 'roof_round'); assert.equal(sys.equip('chimney', 'none').ok, true);
});
test('等级和爱心购买门槛生效，余额不足/未知id/原型字段均不修改状态', () => {
  const { G } = sandbox(), sys = G.sys.exterior;
  let before = JSON.stringify(G.state); assert.equal(sys.buy('roof_castle').ok, false); assert.equal(JSON.stringify(G.state), before);
  G.store.update(state => { state.level = 8; state.wallet.heart = 24; state.wallet.coin = 0; }); before = JSON.stringify(G.state);
  for (const id of ['roof_castle', 'roof_round', 'missing', '__proto__', 'constructor']) { assert.equal(sys.buy(id).ok, false); assert.equal(JSON.stringify(G.state), before); }
  assert.equal(sys.owned('__proto__'), false); assert.equal(sys.list('__proto__').length, 0);
  G.store.update(state => { state.wallet.heart = 25; }); assert.equal(sys.buy('roof_castle').ok, true); assert.equal(G.state.wallet.heart, 0); assert.equal(sys.equip('roof', 'roof_castle').ok, true);
});
test('屋顶/外墙HEX换色与八字招牌保存，非法颜色或名字不修改进度', () => {
  const { G } = sandbox(), sys = G.sys.exterior;
  assert.equal(sys.color('roof', '#bface0').ok, true); assert.equal(sys.color('wallColor', '#C1DAC0').ok, true); assert.equal(G.state.house.exterior.roofColor, '#BFACE0');
  assert.equal(sys.rename('云朵和小兔的家').ok, true); assert.equal(G.state.house.name, '云朵和小兔的家');
  const before = JSON.stringify(G.state); for (const args of [['door', '#FFFFFF'], ['roof', 'red'], ['wall', '#12'], ['wall', ['#FFFFFF']]]) { assert.equal(sys.color(...args).ok, false); assert.equal(JSON.stringify(G.state), before); }
  for (const value of ['', '         ', '一二三四五六七八九']) { assert.equal(sys.rename(value).ok, false); assert.equal(JSON.stringify(G.state), before); }
});
test('JSON导出/存储刷新恢复装备、颜色和拥有权，旧外观安全补免费款', () => {
  const { G, parse, storage } = sandbox(); G.sys.exterior.buy('roof_round'); G.sys.exterior.equip('roof', 'roof_round'); G.sys.exterior.color('roof', '#A7C4D3');
  const json = G.save.exportJson(); G.store.replace(G.store.defaultState()); const restored = G.store.validate(parse(json)); G.store.replace(restored);
  assert.equal(G.state.house.exterior.roof, 'roof_round'); assert.equal(G.state.house.exterior.roofColor, '#A7C4D3'); assert.equal(G.state.house.exterior.owned.roof_round, true);
  assert.equal(G.save.flush(), true); const reopened = sandbox([...storage]); assert.equal(reopened.G.state.house.exterior.roof, 'roof_round'); assert.equal(reopened.G.state.house.exterior.owned.roof_round, true);
  const raw = G.store.defaultState(); delete raw.house.exterior.owned;
  const normalized = G.data.normalizeExterior(raw.house.exterior); assert.equal(G.data.validateExterior(normalized), true); assert.equal(Object.prototype.hasOwnProperty.call(raw.house.exterior, 'owned'), false);
  G.store.replace(raw); assert.equal(G.sys.exterior.owned('none'), true); assert.equal(G.state.house.exterior.roof, 'roof_triangle');
});
test('外观导入拒绝错误类型、未知款、未拥有装备和非法拥有权，不破坏当前状态', () => {
  const { G } = sandbox(), valid = G.data.defaultExterior();
  for (const mutate of [value => { value.roof = ['roof_triangle']; }, value => { value.roofColor = ['#FFFFFF']; }, value => { value.owned.roof_triangle = false; }, value => { value.roof = 'roof_round'; }, value => { value.window = 'unknown'; }, value => { value.owned.unknown = true; }, value => { value.owned = []; }]) {
    const raw = G.utils.clone(G.state); raw.house.exterior = G.utils.clone(valid); mutate(raw.house.exterior); assert.equal(G.data.validateExterior(raw.house.exterior), false);
    const before = JSON.stringify(G.state); assert.throws(() => G.store.replace(raw)); assert.equal(JSON.stringify(G.state), before);
  }
});
test('购买并换上只写一次，拒写不扣币/不解锁/不发完成事件', () => {
  const e = sandbox(), { G } = e, before = JSON.stringify(G.state), disk = e.storage.get(G.data.balance.saveKey); let events = 0;
  G.bus.on('exterior:bought', () => events++); G.bus.on('exterior:changed', () => events++);
  e.writeFails(true); assert.equal(G.sys.exterior.buyAndEquip('roof_round').ok, false);
  assert.equal(JSON.stringify(G.state), before); assert.equal(e.storage.get(G.data.balance.saveKey), disk); assert.equal(events, 0);
  e.writeFails(false); const writes = e.writes(); assert.ok(G.sys.exterior.buyAndEquip('roof_round').ok);
  assert.equal(e.writes(), writes + 1); assert.equal(G.state.wallet.coin, 240); assert.equal(G.state.house.exterior.owned.roof_round, true); assert.equal(G.state.house.exterior.roof, 'roof_round'); assert.equal(events, 2);
  const saved = JSON.parse(e.storage.get(G.data.balance.saveKey)); assert.equal(saved.house.exterior.roof, 'roof_round'); assert.equal(saved.wallet.coin, 240);
});
test('单件购买/装备/换色/招牌拒写全部保留状态与原文，恢复后可重试', () => {
  const e = sandbox(), { G } = e; assert.ok(G.sys.exterior.buy('roof_round').ok); assert.ok(G.save.flush());
  const before = JSON.stringify(G.state), disk = e.storage.get(G.data.balance.saveKey); let events = 0;
  G.bus.on('exterior:bought', () => events++); G.bus.on('exterior:changed', () => events++); e.writeFails(true);
  for (const operation of [() => G.sys.exterior.buy('wall_brick'), () => G.sys.exterior.equip('roof', 'roof_round'), () => G.sys.exterior.color('roof', '#ABCDEF'), () => G.sys.exterior.rename('新的招牌')]) {
    assert.equal(operation().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(e.storage.get(G.data.balance.saveKey), disk); assert.equal(events, 0);
  }
  e.writeFails(false); assert.ok(G.sys.exterior.equip('roof', 'roof_round').ok); assert.equal(G.state.house.exterior.roof, 'roof_round');
});
test('未拥有款只在预览试穿，购买后装备；所有选择与换色沿用自定义控件', () => {
  const { G, environment } = sandbox(); const controls = [], toasts = [], previews = [];
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.className = ''; this.textContent = ''; this.style = {}; }
    get isConnected() { return this === documentBody || !!this.parentElement?.isConnected; }
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name) }; }
    append(...nodes) { nodes.forEach(node => { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node); node.parentElement = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    click() { if (!this.disabled && this.listeners.click) this.listeners.click(); }
  }
  const documentBody = new Node('body'), host = new Node('section'), frames = new Map(); let frameId = 0;
  host.id = 'panel'; host.dataset.kind = 'exterior'; documentBody.append(host);
  environment.document.body = documentBody; environment.document.hidden = false;
  environment.document.createElement = tag => new Node(tag); environment.document.getElementById = id => id === 'panel' ? host : null;
  environment.requestAnimationFrame = fn => { const id = ++frameId; frames.set(id, fn); return id; };
  environment.cancelAnimationFrame = id => frames.delete(id);
  const advanceFrame = () => { for (const [id, fn] of [...frames]) { if (!frames.has(id)) continue; frames.delete(id); fn(0); } };
  G.ui = G.ui || {}; G.ui.controls = {
    select(options, value, callback) { const node = new Node('button'); node.value = value; node.choose = id => { node.value = id; callback(id); }; controls.push({ type: 'select', options, node }); return node; },
    color(value) { const node = new Node('button'); node.value = value; controls.push({ type: 'color', node }); return node; },
    label(control, text) { const node = new Node('div'); node.append(control); return node; }
  };
  G.render = { previewExterior: async (canvas, exterior) => { assert.equal(canvas.isConnected, true); previews.push({ ...exterior }); return { ok: true }; } }; G.ui.toast = text => toasts.push(text); G.audio = { play() {} };
  G.ui.open = kind => { assert.equal(kind, 'exterior'); const view = G.ui.exterior.panel(); host.dataset.kind = kind; host.className = ''; host.replaceChildren(view.content); G.bus.emit('panel:change', { open: true, kind }); return view; };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/exterior.js'), 'utf8'), environment, { filename: 'js/ui/exterior.js' });
  G.ui.open('exterior'); assert.equal(controls.filter(control => control.type === 'color').length, 2); assert.equal(controls.filter(control => control.type === 'select').length, 2);
  assert.equal(previews.length, 0, '先挂载再推进预览帧'); advanceFrame(); assert.equal(previews.length, 1);
  const before = JSON.stringify(G.state), initialBody = host.children[0]; controls[1].node.choose('roof_round'); assert.equal(JSON.stringify(G.state), before);
  assert.equal(initialBody.isConnected, false); assert.equal(host.children[0].isConnected, true); advanceFrame();
  const descendants = node => [node, ...node.children.flatMap(descendants)]; assert.equal(previews.at(-1).roof, 'roof_round');
  descendants(host.children[0]).find(node => node.textContent === '购买并换上 · 60 糖果').click(); assert.equal(G.state.house.exterior.roof, 'roof_round'); assert.equal(G.state.wallet.coin, 240);
  G.ui.open('exterior'); advanceFrame(); const latestStyle = controls.filter(control => control.type === 'select').at(-1); latestStyle.node.choose('roof_triangle'); assert.equal(G.state.house.exterior.roof, 'roof_triangle'); assert.equal(G.state.wallet.coin, 240); advanceFrame();
});
console.log('\n' + passed + ' 组小屋外观规则与Promise预览接线检查通过；真实31款造型由浏览器核对。');
