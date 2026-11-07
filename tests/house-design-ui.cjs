'use strict';
// 真实外观/风格事务与原面板：Promise预览只替代GPU边界，不替代浏览器视觉验收。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/content-dom.cjs');
const spaces = require('./fixtures/free-spaces.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [], test = (name, run) => tests.push({ name, run });
function sandbox() {
  const env = setup(), { G, context, panel, document } = env;
  const frames = new Map(), previewCalls = [], toasts = [], audio = [], navigation = [], styleCalls = [], exteriorCalls = [];
  let serial = 0, writes = 0, denied = false, preview = () => Promise.resolve({ ok: true }), body = null;
  context.requestAnimationFrame = callback => { const id = ++serial; frames.set(id, callback); return id; };
  context.cancelAnimationFrame = id => frames.delete(id);
  const storeItem = context.localStorage.setItem;
  context.localStorage.setItem = (key, value) => { if (denied) throw new Error('QuotaExceededError'); writes++; return storeItem(key, value); };
  ['js/data/house-styles.js', 'js/systems/exterior.js', 'js/systems/house-styles.js'].forEach(env.load);
  const styleApply = G.sys.houseStyles.apply, buyAndEquip = G.sys.exterior.buyAndEquip;
  G.sys.houseStyles.apply = (...args) => { styleCalls.push(args); return styleApply(...args); };
  G.sys.exterior.buyAndEquip = (...args) => { exteriorCalls.push(args); return buyAndEquip(...args); };
  G.draw = { exterior: { preview() { throw new Error('不得恢复旧外观绘图引擎'); } } };
  G.audio = { play: name => audio.push(name) };
  G.render = { previewExterior(canvas, exterior) {
    canvas.drawnExterior = plain(exterior); previewCalls.push({ canvas, exterior: plain(exterior), building: JSON.stringify(G.state.building) });
    return preview(canvas, exterior);
  }, redraw() {} };
  G.ui.toast = message => toasts.push(message);
  G.ui.controls.select = (options, value, callback) => {
    const node = document.createElement('button'); node.value = value; node.options = plain(options);
    node.choose = next => { node.value = next; callback(next); }; return node;
  };
  G.ui.controls.label = (control, text) => { const node = document.createElement('div'), label = document.createElement('span'); label.textContent = text; node.append(label, control); return node; };
  G.ui.controls.color = (value, key) => { const node = document.createElement('input'); node.type = 'color'; node.value = value; node.dataset.uiFocus = key; return node; };
  function render(name = 'houseDesign') {
    panel.className = ''; panel.dataset.kind = name;
    if (name === 'houseDesign' || name === 'exterior') body = G.ui[name].panel().content;
    else { body = document.createElement('div'); body.textContent = '自由布局入口'; }
    panel.replaceChildren(body); G.bus.emit('panel:change', { open: true }); return body;
  }
  G.ui.open = name => { navigation.push(name); return render(name); };
  G.ui.panel.close = () => { panel.className = 'hidden'; G.bus.emit('panel:change', { open: false }); };
  ['js/ui/house-design.js', 'js/ui/exterior.js'].forEach(env.load);
  const nodes = () => body.querySelectorAll('*'), focus = name => nodes().find(node => node.dataset.uiFocus === name);
  const button = name => nodes().find(node => node.tagName === 'BUTTON' && node.textContent === name);
  return { ...env, open: tab => G.ui.houseDesign.open(tab), render, body: () => body, focus, button, nodes,
    styleCalls, exteriorCalls, previewCalls, toasts, audio, navigation, writes: () => writes,
    fail(value) { denied = value; }, preview(fn) { preview = fn; },
    frame() { const entry = frames.entries().next().value; assert.ok(entry, '应有预览帧'); frames.delete(entry[0]); return entry[1](0); },
    async flushFrames() { let count = 0; while (frames.size) { assert.ok(++count < 100, '预览队列不能循环失控'); const entry = frames.entries().next().value; frames.delete(entry[0]); await entry[1](0); } },
    pendingFrames: () => frames.size
  };
}
function ready(G) { G.store.update(state => { state.level = 12; state.wallet.coin = 5000; state.wallet.heart = 500; }); }
function rooms(G) { ready(G); spaces.buildSpace(G, 0, 0, 'bedroom'); spaces.buildSpace(G, 0, 1, 'kitchen'); }

test('选择器和六张灵感缩略图只试穿，真实建筑、状态与磁盘保持原样', async () => {
  const env = sandbox(); rooms(env.G); const before = JSON.stringify(env.G.state), writes = env.writes(); env.open();
  env.focus('house-style-picker').choose('mint_cloud'); await env.flushFrames();
  assert.equal(env.focus('house-style-picker').value, 'mint_cloud'); assert.equal(env.styleCalls.length, 0); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
  const stage = env.nodes().find(node => node.tagName === 'CANVAS'); assert.equal(stage.drawnExterior.roof, 'roof_cloud');
  const choices = env.nodes().filter(node => node.className.includes('house-style-choice')); assert.equal(choices.length, 6); choices.find(node => node.attributes['aria-label'].includes('海盐蓝')).click();
  await env.flushFrames(); assert.equal(env.focus('house-style-picker').value, 'sea_salt'); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.styleCalls.length, 0);
  assert.ok(env.previewCalls.every(call => call.building === JSON.stringify(env.G.state.building)), '预览使用当前真实建筑');
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
test('自由搭配与自由布局保留原入口，只导航且不修改真实空间或存档', () => {
  const env = sandbox(); rooms(env.G); const before = JSON.stringify(env.G.state), writes = env.writes(); env.open(); env.button('自由搭配').click(); assert.equal(env.navigation.at(-1), 'exterior');
  env.open(); env.button('自由布局').click(); assert.equal(env.navigation.at(-1), 'roomLayout');
  env.open('layouts'); assert.equal(env.navigation.at(-1), 'roomLayout'); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.G.sys.layoutTemplates, undefined); assert.equal(env.G.sys.building, undefined);
});
test('换档清理风格临时选择、失败消息与旧按钮的写入资格', () => {
  const env = sandbox(); rooms(env.G); env.open(); env.focus('house-style-picker').choose('mint_cloud'); env.fail(true); env.focus('house-style-apply').click(); env.fail(false);
  const oldPicker = env.focus('house-style-picker'), oldAccept = env.focus('house-style-apply');
  env.G.store.replace(env.G.store.defaultState()); env.render(); const before = JSON.stringify(env.G.state), writes = env.writes(), calls = env.styleCalls.length;
  oldPicker.choose('blueberry_night'); oldAccept.click();
  assert.equal(env.focus('house-style-picker').value, 'strawberry_cream'); assert.doesNotMatch(env.body().textContent, /还没有保存/); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.styleCalls.length, calls);
});
test('试穿图详情标出真实部件和两种颜色，语义与单独搭配入口保留', async () => {
  const env = sandbox(); ready(env.G); env.open(); env.focus('house-style-picker').choose('mint_cloud'); await env.flushFrames(); const before = JSON.stringify(env.G.state), writes = env.writes();
  const stage = env.nodes().find(node => node.tagName === 'CANVAS'); assert.equal(stage.drawnExterior.roof, 'roof_cloud'); assert.equal(stage.attributes.role, 'img'); assert.equal(stage.attributes['aria-label'], '薄荷云朵外观预览');
  assert.match(env.body().textContent, /屋顶 #B3D8C5 · 外墙 #E4EFCC/); assert.ok(env.nodes().some(node => node.attributes.role === 'status' && node.attributes['aria-live'] === 'polite')); assert.ok(env.nodes().some(node => node.attributes['aria-label'] === '六套小屋灵感预览'));
  env.button('单独搭配屋顶和颜色').click(); assert.equal(env.navigation.at(-1), 'exterior'); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.styleCalls.length, 0);
});
test('Promise预览迟到、关闭或被换页后，不改旧caption、不复活队列且旧控件不能确认', async () => {
  const env = sandbox(); ready(env.G); let resolve; env.preview(() => new Promise(done => { resolve = done; })); env.open();
  const caption = env.nodes().find(node => node.tagName === 'FIGCAPTION'), oldText = caption.textContent, oldPicker = env.focus('house-style-picker'), oldAccept = env.focus('house-style-apply');
  const pending = env.frame(); env.G.ui.panel.close(); const before = JSON.stringify(env.G.state), writes = env.writes();
  oldPicker.choose('mint_cloud'); oldAccept.click(); resolve({ ok: false }); await pending;
  assert.equal(caption.textContent, oldText); assert.equal(env.pendingFrames(), 0); assert.equal(env.styleCalls.length, 0); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
  env.preview(() => Promise.resolve({ ok: true })); env.open(); await env.flushFrames(); assert.equal(env.pendingFrames(), 0); assert.equal(env.previewCalls.length, 8, '旧队列取消，新面板只执行舞台和六张缩略图');
});
test('预览失败只显示可读回退，报价和主动确认仍由真实规则决定', async () => {
  const env = sandbox(); ready(env.G); env.preview(() => Promise.reject(new Error('内存GPU不可用'))); env.open(); env.focus('house-style-picker').choose('mint_cloud'); await env.flushFrames();
  assert.match(env.body().textContent, /预览暂不可用/); assert.equal(env.focus('house-style-apply').disabled, false); assert.equal(env.styleCalls.length, 0);
  env.focus('house-style-apply').click(); assert.equal(env.G.sys.houseStyles.current(), 'mint_cloud'); assert.deepEqual(env.audio, ['success']);
});
test('外观单款试穿不写盘，购买装备真实一次事务且原按钮失效', async () => {
  const env = sandbox(); rooms(env.G); env.G.ui.open('exterior');
  const picker = env.nodes().find(node => node.options?.some(option => option.id === 'roof_cloud'));
  const before = JSON.stringify(env.G.state), writes = env.writes(); picker.choose('roof_cloud'); await env.flushFrames();
  assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.G.sys.exterior.owned('roof_cloud'), false);
  const accept = env.nodes().find(node => node.tagName === 'BUTTON' && node.textContent.startsWith('购买并换上')); assert.ok(accept); accept.click(); accept.click();
  assert.deepEqual(env.exteriorCalls, [['roof_cloud']]); assert.equal(env.writes(), writes + 1); assert.equal(env.G.state.house.exterior.roof, 'roof_cloud'); assert.equal(env.G.sys.exterior.owned('roof_cloud'), true);
  assert.equal(env.G.state.wallet.coin, JSON.parse(before).wallet.coin - 140); assert.equal(JSON.stringify(env.G.state.building), JSON.stringify(JSON.parse(before).building));
});
test('外观购买拒写与换档都保留经济/建筑，迟到预览和旧颜色按钮不得作用于新档', async () => {
  const env = sandbox(); ready(env.G); env.G.ui.open('exterior'); env.nodes().find(node => node.options?.some(option => option.id === 'roof_cloud')).choose('roof_cloud');
  const accept = env.nodes().find(node => node.tagName === 'BUTTON' && node.textContent.startsWith('购买并换上')), before = JSON.stringify(env.G.state);
  env.fail(true); accept.click(); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.audio.length, 0); assert.equal(env.G.sys.exterior.owned('roof_cloud'), false); env.fail(false);
  let resolve; env.preview(() => new Promise(done => { resolve = done; })); const oldColor = env.nodes().find(node => node.attributes['aria-label'] === '蜜桃甜粉 #FF9FB5');
  const pending = env.frame(); env.G.store.replace(env.G.store.defaultState()); const newState = JSON.stringify(env.G.state), writes = env.writes();
  oldColor.click(); accept.click(); resolve({ ok: false }); await pending;
  assert.equal(JSON.stringify(env.G.state), newState); assert.equal(env.writes(), writes); assert.equal(env.pendingFrames(), 0);
});
(async () => { for (const item of tests) { await item.run(); console.log('✓ ' + item.name); } console.log(tests.length + ' 组原小屋外观/风格UI检查通过（内存DOM与预览合同，不替代浏览器外观验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
