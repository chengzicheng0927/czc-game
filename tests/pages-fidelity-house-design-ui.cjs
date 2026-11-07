'use strict';
// 真实风格系统与个性化UI，合成档案/DOM。只验证意图、只读预览与资源生命周期，几何由浏览器核对。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/resident-life.cjs');
const tests = [], test = (name, run) => tests.push([name, run]);
function harness(options = {}) {
  const env = setup(), { G, document, panel } = env, calls = [], navigation = [], releases = [];
  const proto = Object.getPrototypeOf(panel); proto.getAttribute = function (name) { return this.attributes[name] ?? null; };
  proto.dispatch = function (name, values) { const event = Object.assign({ target: this, preventDefault() {} }, values); (this.listeners.get(name) || []).forEach(fn => fn(event)); };
  ['js/data/house-styles.js', 'js/data/layout-templates.js', 'js/systems/exterior.js', 'js/systems/room-layout.js', 'js/systems/house-styles.js', 'js/systems/layout-templates.js'].forEach(env.load);
  G.store.update(state => { state.level = 21; state.wallet.coin = 5000; state.wallet.heart = 500; });
  G.ui.controls.select = (items, value, onChange) => {
    const control = document.createElement('button'); control.type = 'button'; control.items = items; control.value = value;
    control.choose = id => { control.value = id; onChange(id); }; return control;
  };
  G.ui.controls.color = (value, id) => { const input = document.createElement('input'); input.value = value; input.id = id; return input; };
  G.ui.controls.label = (control, name) => { const label = document.createElement('label'), copy = document.createElement('span'); copy.textContent = name; label.append(copy, control); return label; };
  G.audio = { play() {} }; G.draw = { exterior: {
    preview(canvas, exterior, name, options) { calls.push({ canvas, exterior, name, options }); return { mode: 'webgl', status: 'ready' }; },
    disposePreview() { releases.push(true); }
  } };
  G.ui.open = kind => {
    navigation.push(kind); if (kind !== 'houseDesign' && !(options.exterior && kind === 'exterior')) return;
    const descriptor = kind === 'exterior' ? G.ui.exterior.panel() : G.ui.houseDesign.panel(); panel.dataset.kind = kind; panel.className = ''; panel.replaceChildren(descriptor.content);
    G.bus.emit('panel:change', { open: true, kind }); return descriptor;
  };
  env.load('js/ui/house-design.js'); if (options.exterior) env.load('js/ui/exterior.js');
  const key = value => panel.querySelectorAll('*').find(node => node.dataset.uiFocus === value);
  return { ...env, calls, releases, navigation, key, open: () => G.ui.houseDesign.open(), drain() { for (let i = 0; i < 10; i++) env.frames(); } };
}
test('六套真实风格只读预览每帧至多一张，有限完成且动作与状态可达', () => {
  const e = harness(), before = JSON.stringify(e.G.state); e.open(); assert.equal(e.calls.length, 0);
  const canvases = e.panel.querySelectorAll('canvas'); assert.equal(canvases.length, e.G.sys.houseStyles.list().length + 1);
  for (let i = 1; i <= canvases.length; i++) { e.frames(); assert.equal(e.calls.length, i, '逐帧分摊有限预览工作'); }
  e.drain(); assert.equal(e.calls.length, canvases.length, '静止页面没有持续绘图');
  assert.deepEqual(e.calls[0].exterior, e.G.sys.houseStyles.preview(e.key('house-style-picker').value).exterior);
  assert.ok(e.calls.every(call => call.canvas.isConnected && call.name === e.G.state.house.name));
  assert.ok(e.key('house-style-picker').isConnected); assert.ok(e.key('house-style-apply').isConnected);
  assert.ok(e.panel.querySelectorAll('p').some(node => node.getAttribute('role') === 'status' && node.textContent));
  assert.equal(JSON.stringify(e.G.state), before);
});
test('切换灵感使旧预览队列失效，当前大图使用新风格且不提前保存', () => {
  const e = harness(); e.open(); const previous = e.panel.querySelectorAll('canvas'), before = JSON.stringify(e.G.state);
  e.key('house-style-picker').choose('mint_cloud'); e.drain();
  assert.equal(e.calls.length, e.G.sys.houseStyles.list().length + 1); assert.ok(e.calls.every(call => !previous.includes(call.canvas)));
  assert.deepEqual(e.calls[0].exterior, e.G.sys.houseStyles.preview('mint_cloud').exterior);
  previous.forEach(canvas => { assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); });
  assert.equal(JSON.stringify(e.G.state), before);
});
test('抽屉关闭和换档取消剩余预览、释放资源，迟到帧不得绘制旧小屋', () => {
  for (const mode of ['close', 'replace']) {
    const e = harness(); e.open(); e.frames(); assert.equal(e.calls.length, 1); const canvases = e.panel.querySelectorAll('canvas');
    if (mode === 'close') { e.panel.className = 'hidden'; e.G.bus.emit('panel:change', { open: false }); }
    else e.G.store.replace(e.parse(e.G.state));
    const before = JSON.stringify(e.G.state); e.drain(); assert.equal(e.calls.length, 1); assert.equal(e.releases.length, 1);
    canvases.forEach(canvas => { assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); }); assert.equal(JSON.stringify(e.G.state), before);
  }
});
test('单张预览异常保留恢复文字、其他风格和真实选择控件', () => {
  const e = harness(), draw = e.G.draw.exterior.preview; let first = true;
  e.G.draw.exterior.preview = (...args) => { if (first) { first = false; throw new Error('主预览异常'); } return draw(...args); };
  const before = JSON.stringify(e.G.state); e.open(); assert.doesNotThrow(() => e.drain());
  assert.match(e.panel.textContent, /预览暂不可用，仍可查看部件与费用/); assert.equal(e.calls.length, e.G.sys.houseStyles.list().length);
  const previousCalls = e.calls.length; e.key('house-style-picker').choose('sea_salt'); e.drain(); assert.equal(e.key('house-style-picker').value, 'sea_salt');
  assert.deepEqual(e.calls[previousCalls].exterior, e.G.sys.houseStyles.preview('sea_salt').exterior); assert.equal(JSON.stringify(e.G.state), before);
});
test('换档后同报价旧确认、旧风格选择与导航不能写入或打开新档', () => {
  const e = harness(); e.open(); e.key('house-style-picker').choose('mint_cloud');
  const apply = e.key('house-style-apply'), picker = e.key('house-style-picker'), tabs = e.panel.querySelector('.house-design-tabs').querySelectorAll('button');
  assert.equal(apply.disabled, false); let submits = 0; const actual = e.G.sys.houseStyles.apply;
  e.G.sys.houseStyles.apply = (...args) => { submits++; return actual(...args); };
  e.G.store.replace(e.parse(e.G.state)); const before = JSON.stringify(e.G.state), navigation = e.navigation.length;
  apply.click(); picker.choose('sea_salt'); tabs.forEach(control => control.click()); e.drain();
  assert.equal(submits, 0); assert.equal(e.navigation.length, navigation); assert.equal(JSON.stringify(e.G.state), before);
});
test('自由搭配换档后的旧改名/颜色/选择回调失效，关闭保留DOM也不能改小屋', () => {
  for (const boundary of ['replace', 'close']) {
    const e = harness({ exterior: true }); e.G.ui.open('exterior'); e.drain();
    const form = e.panel.querySelector('form'), name = e.key('exterior-name'), color = e.panel.querySelector('#exterior-roof-color');
    const selectors = e.panel.querySelectorAll('button').filter(control => control.items), tabs = e.panel.querySelector('.house-design-tabs').querySelectorAll('button');
    let renames = 0, colors = 0; const rename = e.G.sys.exterior.rename, recolor = e.G.sys.exterior.color;
    e.G.sys.exterior.rename = (...args) => { renames++; return rename(...args); }; e.G.sys.exterior.color = (...args) => { colors++; return recolor(...args); };
    if (boundary === 'replace') e.G.store.replace(e.parse(e.G.state)); else { e.panel.className = 'hidden'; e.G.bus.emit('panel:change', { open: false }); }
    const before = JSON.stringify(e.G.state), navigation = e.navigation.length;
    name.value = '过期改名'; form.dispatch('submit'); color.value = '#EEB2C4'; color.dispatch('change');
    selectors.forEach(control => control.choose(control.items.at(-1).id)); tabs.forEach(control => control.click()); e.drain();
    assert.equal(renames, 0); assert.equal(colors, 0); assert.equal(e.navigation.length, navigation); assert.equal(JSON.stringify(e.G.state), before);
  }
});
test('面板已隐藏但关闭事件尚未派发时，连接着的旧DOM也不得绘制', () => {
  for (const kind of ['houseDesign', 'exterior']) {
    const e = harness({ exterior: true }); e.G.ui.open(kind); e.panel.className = 'hidden';
    const before = JSON.stringify(e.G.state); e.drain(); assert.equal(e.calls.length, 0);
    e.G.bus.emit('panel:change', { open: false }); e.drain(); assert.equal(e.calls.length, 0);
    assert.equal(JSON.stringify(e.G.state), before);
  }
});
if (require.main === module) { for (const [name, run] of tests) { run(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组个性化预览UI合约检查通过；真实排版由浏览器验收。'); }
