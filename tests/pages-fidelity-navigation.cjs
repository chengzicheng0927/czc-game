'use strict';
// MC-078：真实garden/crafting两模块的导航意图；合成DOM/档案，不启动服务或浏览器。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/resident-life.cjs');
const tests = [], test = (name, run) => tests.push([name, run]);
function harness() {
  const env = setup(), { G, document, panel } = env, proto = Object.getPrototypeOf(panel);
  const classList = Object.getOwnPropertyDescriptor(proto, 'classList').get;
  Object.defineProperty(proto, 'classList', { configurable: true, get() {
    const list = classList.call(this);
    list.toggle = (name, force) => { const selected = force === undefined ? !list.contains(name) : !!force; if (selected) list.add(name); else list.remove(name); return selected; };
    return list;
  } });
  proto.matches = function (selector) {
    const attributes = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)], simple = selector.replace(/\[[^\]]+\]/g, '');
    const tag = simple.match(/^[a-z]+/i), id = simple.match(/#([\w-]+)/), classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    if (tag && this.tagName !== tag[0].toUpperCase() || id && this.id !== id[1] || classes.some(name => !this.classList.contains(name))) return false;
    return attributes.every(([, name, expected]) => {
      const data = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()) : null, value = data ? this.dataset[data] : this.attributes[name];
      return value !== undefined && (expected === undefined || String(value) === expected);
    });
  };
  proto.getAttribute = function (name) { return this.attributes[name] ?? null; };
  G.ui.controls.select = (items, value, onChange) => {
    const node = document.createElement('button'); node.type = 'button'; node.items = items; node.value = value; node.setAttribute('role', 'combobox');
    node.choose = next => { node.value = next; onChange?.(next); }; return node;
  };
  G.ui.controls.label = (control, text) => { const node = document.createElement('label'), copy = document.createElement('span'); node.className = 'ui-field'; copy.textContent = text; node.append(copy, control); return node; };
  G.render.drawThumbnail = () => {}; G.audio = G.ui.audio = { play() {} };
  env.load('js/data/crafting.js'); env.load('js/systems/crafting.js');
  G.store.update(state => { state.level = 21; state.wallet.coin = 5000; });
  let currentKind = null, currentOptions = null, descriptor = null;
  G.ui.open = (kind, options) => {
    assert.ok(['garden', 'crafting'].includes(kind), '检查只打开真实花园或加工页');
    currentKind = kind; currentOptions = options; G.runtime.mode = kind;
    descriptor = kind === 'garden' ? G.ui.garden.panel() : G.ui.crafting.panel(options || {});
    panel.dataset.kind = kind; panel.className = ''; panel.replaceChildren(descriptor.content);
    G.bus.emit('panel:change', { open: true, kind }); return descriptor;
  };
  G.ui.refresh = () => G.ui.open(currentKind, currentOptions);
  env.load('js/ui/garden.js'); env.load('js/ui/crafting.js');
  function clickTab(rootClass, name) {
    const tabs = panel.querySelector(rootClass); assert.ok(tabs, rootClass);
    const control = tabs.querySelectorAll('button').find(node => node.textContent === name); assert.ok(control, name); assert.ok(!control.disabled, name + '入口可操作');
    control.click(); env.frames();
  }
  return { ...env, open: kind => G.ui.open(kind), kind: () => currentKind, gardenTab: name => clickTab('.garden-tabs', name), craftingTab: name => clickTab('.crafting-v2-tabs', name), tab: () => panel.querySelector('.garden-panel')?.dataset.tab };
}
for (const [tab, name] of [['seeds', '种子铺'], ['harvest', '收获篮']]) {
  test(name + '→花果加工→我的花圃明确回到plots，档案不变', () => {
    const e = harness(); e.open('garden'); e.gardenTab(name); assert.equal(e.tab(), tab);
    const before = JSON.stringify(e.G.state); e.gardenTab('花果加工'); assert.equal(e.kind(), 'crafting');
    e.craftingTab('我的花圃'); assert.equal(e.kind(), 'garden'); assert.equal(e.tab(), 'plots');
    assert.ok(e.panel.querySelector('.garden-plots')); assert.ok(e.panel.querySelector('.garden-v2-detail')); assert.equal(JSON.stringify(e.G.state), before);
  });
  test('普通garden入口从加工返回仍保留' + name + '，不全局重置页签', () => {
    const e = harness(); e.open('garden'); e.gardenTab(name); const before = JSON.stringify(e.G.state);
    e.gardenTab('花果加工'); assert.equal(e.kind(), 'crafting'); e.open('garden');
    assert.equal(e.tab(), tab); assert.equal(e.panel.querySelector('.garden-plots'), null); assert.equal(JSON.stringify(e.G.state), before);
    e.G.ui.garden.openPlots(); assert.equal(e.tab(), 'plots'); e.open('garden'); assert.equal(e.tab(), 'plots'); assert.equal(JSON.stringify(e.G.state), before);
  });
}
if (require.main === module) {
  for (const [name, run] of tests) { run(); console.log('✓ ' + name); }
  console.log('\n' + tests.length + ' 组花园/加工导航合约检查通过（合成DOM，不代表实际浏览器布局验收）。');
}
