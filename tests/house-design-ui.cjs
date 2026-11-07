'use strict';
// 真实个性化UI + 真实风格/布局事务；轻量DOM代替浏览器，不代替视觉验收。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/house-styles.js', 'js/data/layout-templates.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/data/deals.js', 'js/data/login.js', 'js/data/crafting.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/exterior.js', 'js/systems/room-layout.js', 'js/systems/house-styles.js', 'js/systems/layout-templates.js'];
function sandbox() {
  const frames = [], toasts = [], audio = [], navigation = [], styleCalls = [], layoutCalls = [], storage = new Map(); let writes = 0, failWrites = false, fitCount = 0, manualLayoutCount = 0;
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attributes = {}; this.dataset = {}; this.listeners = {}; this.disabled = false; this.className = ''; this._text = ''; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() { if (!this.disabled) this.listeners.click?.({ target: this }); }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  }
  const document = { addEventListener() {}, createElement: tag => new Node(tag), body: null }; document.body = new Node('body');
  const environment = vm.createContext({ console, Blob, URL, document, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: callback => frames.push(callback) }); environment.window = environment; environment.addEventListener = () => {};
  environment.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (failWrites) throw new Error('QuotaExceededError'); writes++; storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file });
  const G = environment.Game; G.store.init();
  const styleApply = G.sys.houseStyles.apply, layoutApply = G.sys.layoutTemplates.apply;
  G.sys.houseStyles.apply = (...args) => { styleCalls.push(args); return styleApply(...args); }; G.sys.layoutTemplates.apply = (...args) => { layoutCalls.push(args); return layoutApply(...args); };
  G.draw = { exterior: { preview(canvas, exterior) { canvas.drawnExterior = plain(exterior); } } }; G.audio = { play: name => audio.push(name) }; G.render = { camera: { fit() { fitCount++; } } };
  let body;
  G.ui = { toast: message => toasts.push(message), roomLayout: { open() { manualLayoutCount++; } }, controls: {
    select(options, value, callback) { const node = new Node('button'); node.value = value; node.options = plain(options); node.choose = next => { node.value = next; callback(next); }; return node; },
    label(control, text) { const node = new Node('div'), label = new Node('span'); label.textContent = text; node.append(label, control); return node; }
  } };
  function render() { const view = G.ui.houseDesign.panel(); body = view.content; document.body.replaceChildren(body); while (frames.length) frames.shift()(); return body; }
  G.ui.open = name => { navigation.push(name); if (name === 'houseDesign') return render(); };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/house-design.js'), 'utf8'), environment, { filename: 'js/ui/house-design.js' });
  const focus = name => body.descendants().find(node => node.dataset.uiFocus === name), button = name => body.descendants().find(node => node.tagName === 'BUTTON' && node.textContent === name);
  return { G, open: tab => G.ui.houseDesign.open(tab), render, body: () => body, focus, button, nodes: () => body.descendants(), styleCalls, layoutCalls, toasts, audio, navigation, writes: () => writes, storage, fail(value) { failWrites = value; }, fitCount: () => fitCount, manualLayoutCount: () => manualLayoutCount };
}
function ready(G) { G.store.update(state => { state.level = 12; state.wallet.coin = 5000; state.wallet.heart = 500; }); }
function rooms(G) { ready(G); assert.ok(G.sys.building.buildRoom(0, 0, 'bedroom').ok); assert.ok(G.sys.building.buildRoom(0, 1, 'kitchen').ok); }
let passed = 0; function test(name, run) { run(); passed++; console.log('✓ ' + name); }

test('选择器和六张灵感缩略图只试穿，状态与磁盘保持原样', () => {
  const env = sandbox(); ready(env.G); const before = JSON.stringify(env.G.state), writes = env.writes(); env.open();
  env.focus('house-style-picker').choose('mint_cloud'); assert.equal(env.focus('house-style-picker').value, 'mint_cloud'); assert.equal(env.styleCalls.length, 0); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
  const stage = env.nodes().find(node => node.tagName === 'CANVAS'); assert.equal(stage.drawnExterior.roof, 'roof_cloud');
  const choices = env.nodes().filter(node => node.className.includes('house-style-choice')); assert.equal(choices.length, 6); choices.find(node => node.attributes['aria-label'].includes('海盐蓝')).click();
  assert.equal(env.focus('house-style-picker').value, 'sea_salt'); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.styleCalls.length, 0);
});
test('主动确认把当前报价交给规则且旧按钮连点只调用一次，成功状态可重看', () => {
  const env = sandbox(); ready(env.G); env.open(); env.focus('house-style-picker').choose('mint_cloud'); const quote = env.G.sys.houseStyles.preview('mint_cloud').quote, accept = env.focus('house-style-apply'), writes = env.writes();
  accept.click(); accept.click(); assert.deepEqual(env.styleCalls, [['mint_cloud', quote]]); assert.equal(env.writes(), writes + 1); assert.equal(env.G.sys.houseStyles.current(), 'mint_cloud'); assert.equal(env.focus('house-style-apply').disabled, true); assert.equal(env.focus('house-style-apply').textContent, '已经换上啦'); assert.deepEqual(env.audio, ['success']); assert.match(env.body().textContent, /小屋换上薄荷云朵/);
});
test('等级锁定、余额不足和已穿风格分别禁用确认，仍可预览其模样和原因', () => {
  const env = sandbox(); env.open(); env.focus('house-style-picker').choose('blueberry_night'); assert.equal(env.focus('house-style-apply').disabled, true); assert.match(env.body().textContent, /Lv\.12/); env.focus('house-style-apply').click(); assert.equal(env.styleCalls.length, 0);
  ready(env.G); env.G.store.update(state => { state.wallet.coin = 0; }); env.render(); env.focus('house-style-picker').choose('mint_cloud'); assert.equal(env.focus('house-style-apply').disabled, true); assert.match(env.body().textContent, /还差 415 颗糖果/);
  env.focus('house-style-picker').choose('sea_salt'); env.focus('house-style-apply').click(); assert.equal(env.focus('house-style-apply').disabled, true); assert.match(env.body().textContent, /当前模样/); assert.equal(env.styleCalls.length, 1);
});
test('失败的外观持久事务保留预览和重试按钮，不播放成功声音', () => {
  const env = sandbox(); ready(env.G); env.open(); env.focus('house-style-picker').choose('mint_cloud'); const before = JSON.stringify(env.G.state); env.fail(true); env.focus('house-style-apply').click();
  assert.equal(env.styleCalls.length, 1); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.audio.length, 0); assert.equal(env.focus('house-style-picker').value, 'mint_cloud'); assert.equal(env.focus('house-style-apply').disabled, false); assert.match(env.body().textContent, /还没有保存/); assert.match(env.toasts.at(-1), /保持原样/);
});
test('布局选择只画前后位置图，确认才传模板和快照，成功仅定位镜头一次', () => {
  const env = sandbox(); rooms(env.G); const before = JSON.stringify(env.G.state), writes = env.writes(); env.open('layouts'); env.focus('house-layout-picker').choose('mirror_rows'); const plan = env.G.sys.layoutTemplates.preview('mirror_rows');
  assert.ok(plan.moves.length > 0); assert.equal(env.layoutCalls.length, 0); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.match(env.body().textContent, /现在的小屋.*试看的布局/); assert.match(env.body().textContent, /家具、装修和朋友一起保留/);
  const accept = env.focus('house-layout-apply'); accept.click(); accept.click(); assert.deepEqual(env.layoutCalls, [['mirror_rows', plan.signature]]); assert.equal(env.writes(), writes + 1); assert.equal(env.fitCount(), 1); assert.deepEqual(env.audio, ['success']); assert.equal(env.focus('house-layout-apply').disabled, true); assert.match(env.body().textContent, /镜像横排搬好/);
});
test('布局拒写不改房间、不定位镜头且不播放成功音，可重新确认', () => {
  const env = sandbox(); rooms(env.G); env.open('layouts'); env.focus('house-layout-picker').choose('mirror_rows'); const before = JSON.stringify(env.G.state); env.fail(true); env.focus('house-layout-apply').click();
  assert.equal(env.layoutCalls.length, 1); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.fitCount(), 0); assert.equal(env.audio.length, 0); assert.equal(env.focus('house-layout-apply').disabled, false); assert.match(env.body().textContent, /布局还没有保存/);
});
test('没有房间显示建造恢复入口，已经相同的布局则显示不可重复确认状态', () => {
  const env = sandbox(); env.open('layouts'); assert.equal(env.focus('house-layout-apply'), undefined); assert.match(env.body().textContent, /先建一间房/); env.button('去建一间房').click(); assert.equal(env.navigation.at(-1), 'build'); assert.equal(env.layoutCalls.length, 0);
  assert.ok(env.G.sys.building.buildRoom(0, 0, 'bedroom').ok); env.open('layouts'); assert.equal(env.focus('house-layout-apply').disabled, true); assert.equal(env.focus('house-layout-apply').textContent, '已经是这个排列'); env.focus('house-layout-apply').click(); assert.equal(env.layoutCalls.length, 0);
});
test('自由搭配与自己换位置使用既有入口，无额外存档动作', () => {
  const env = sandbox(); rooms(env.G); const before = JSON.stringify(env.G.state), writes = env.writes(); env.open(); env.button('自由搭配').click(); assert.equal(env.navigation.at(-1), 'exterior'); env.open('layouts'); env.button('自己换位置').click(); assert.equal(env.manualLayoutCount(), 1); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
});
test('换档清理布局页签、风格/模板临时选择和失败消息', () => {
  const env = sandbox(); rooms(env.G); env.open(); env.focus('house-style-picker').choose('mint_cloud'); env.fail(true); env.focus('house-style-apply').click(); env.fail(false); env.open('layouts'); env.focus('house-layout-picker').choose('mirror_rows');
  env.G.store.replace(env.G.store.defaultState()); env.render(); assert.equal(env.focus('house-style-picker').value, 'strawberry_cream'); assert.equal(env.focus('house-layout-picker'), undefined); assert.doesNotMatch(env.body().textContent, /还没有保存/);
  env.open('layouts'); assert.equal(env.focus('house-layout-picker').value, 'together_rows'); assert.match(env.body().textContent, /先建一间房/);
});
test('试穿图/详情标出真实部件和两种颜色，可读语义与单独搭配入口不写盘', () => {
  const env = sandbox(); ready(env.G); env.open(); env.focus('house-style-picker').choose('mint_cloud'); const before = JSON.stringify(env.G.state), writes = env.writes();
  const stage = env.nodes().find(node => node.tagName === 'CANVAS'); assert.equal(stage.drawnExterior.roof, 'roof_cloud'); assert.equal(stage.attributes.role, 'img'); assert.equal(stage.attributes['aria-label'], '薄荷云朵外观预览');
  assert.match(env.body().textContent, /屋顶 #B3D8C5 · 外墙 #E4EFCC/); assert.ok(env.nodes().some(node => node.attributes.role === 'status' && node.attributes['aria-live'] === 'polite')); assert.ok(env.nodes().some(node => node.attributes['aria-label'] === '六套小屋灵感预览'));
  env.button('单独搭配屋顶和颜色').click(); assert.equal(env.navigation.at(-1), 'exterior'); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.styleCalls.length, 0);
});
console.log('\n' + passed + ' 组小屋个性化UI检查通过（轻量DOM，不替代真实手机/桌面验收）。');
