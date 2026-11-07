'use strict';
// 第二批装扮上下文/主题/商店闭环；复用首批夹具，导入不会自动执行首批用例。
const assert = require('node:assert/strict');
const { harness, unchanged, owned, themeItem } = require('./visual-shell-decor.cjs');
const tests = [], test = (name, run) => tests.push({ name, run });

test('指定房间的装扮上下文清楚，换房折叠且不堆楼层导航，三种背包页签保留', () => {
  const e = harness(); e.G.runtime.activeRoomId = e.bedroom; const before = JSON.stringify(e.G.state); e.open('decor', { roomId: e.living });
  const context = e.body().querySelector('.decor-room-context'); assert.ok(context); assert.match(context.textContent, /客厅/); assert.match(context.textContent, /1楼.*第2间/); assert.equal(e.G.runtime.activeRoomId, e.living);
  const picker = e.body().querySelector('details.decor-room-switch'); assert.ok(picker); assert.notEqual(picker.open, true); assert.equal(e.body().querySelector('.house-navigation'), null);
  for (const name of ['背包', '墙纸', '地板']) assert.ok(e.body().querySelectorAll('button').some(button => button.textContent.includes(name)), name);
  unchanged(e, before);
});

test('从房间菜单装扮显式带roomId，不依赖随后改变的当前房间', () => {
  const e = harness(); e.G.bus.emit('scene:room', { roomId: e.living }); e.flush(); const dialog = e.modals.at(-1); assert.ok(dialog);
  const button = dialog.content.querySelectorAll('button').find(node => node.textContent.includes('装扮这个房间')); assert.ok(button); e.G.runtime.activeRoomId = e.bedroom; button.click(); e.flush();
  assert.deepEqual(e.navigation.at(-1), ['decor', { roomId: e.living }]); assert.equal(e.G.runtime.activeRoomId, e.living);
});

test('真实主题、搜索与库存过滤；空主题可去商店，再返回原房原主题而不自动购买', () => {
  const e = harness(), definition = themeItem(e, 'forest'); assert.ok(definition); e.G.store.update(state => e.G.data.furniture.filter(def => def.theme === 'forest').forEach(def => { delete state.inventory[def.id]; })); e.flush();
  const before = JSON.stringify(e.G.state); e.open('decor', { roomId: e.living }); const themes = e.key('decor-theme').options;
  for (const theme of Object.values(e.G.data.themes)) assert.ok(themes.some(option => option.id === theme.id), theme.id);
  e.choose('decor-theme', 'forest'); assert.equal(e.body().querySelectorAll('.item-card').length, 0); e.click('decor-buy-theme'); assert.equal(e.panel.dataset.kind, 'shop');
  assert.ok(e.key('decor-return')); assert.equal(e.buyCalls.length, 0); assert.ok(e.item(definition.id)); e.click('decor-return');
  assert.equal(e.panel.dataset.kind, 'decor'); assert.equal(e.key('decor-theme').value, 'forest'); assert.equal(e.G.runtime.activeRoomId, e.living); unchanged(e, before);
});

test('南瓜搜索缺货进入真实节日商店，主动购买后可回原房原主题摆放', () => {
  const e = harness(), id = 'festival_pumpkin_lantern', definition = e.G.data.furnitureById[id]; assert.ok(definition); assert.equal(definition.theme, 'basic');
  e.G.store.update(state => { delete state.inventory[id]; }); e.flush(); e.open('decor', { roomId: e.living }); e.choose('decor-theme', 'basic'); e.input('decor-search', '南瓜');
  const before = JSON.stringify(e.G.state); e.click('decor-buy-theme'); assert.equal(e.panel.dataset.kind, 'shop'); assert.ok(e.item(id), 'festival商品不能被普通all页隐藏'); unchanged(e, before);
  const purchase = e.buy(id); assert.ok(purchase); assert.equal(purchase.disabled, false); const coin = e.G.state.wallet.coin; purchase.click(); e.flush();
  assert.equal(e.buyCalls.length, 1); assert.equal(e.buyCalls[0][0], id); assert.equal(e.G.state.inventory[id], 1); assert.ok(e.G.state.wallet.coin < coin);
  e.click('decor-return'); assert.equal(e.G.runtime.activeRoomId, e.living); assert.equal(e.key('decor-theme').value, 'basic'); assert.equal(e.key('decor-search').value, '南瓜'); assert.ok(e.item(id));
  e.item(id).click(); e.flush(); assert.deepEqual(e.beginCalls.at(-1), [id, e.living]); assert.equal(e.panel.classList.contains('hidden'), true); assert.equal(e.G.state.inventory[id], 1);
});

test('换档后旧购买、返回与摆放按钮都不能操作新档或恢复旧房上下文', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const oldPlacement = e.item('bed_basic'); e.choose('decor-theme', 'forest'); e.click('decor-buy-theme');
  const oldReturn = e.key('decor-return'), oldPurchase = e.body().querySelectorAll('.item-card').map(card => card.querySelector('button')).find(button => button && !button.disabled); assert.ok(oldReturn); assert.ok(oldPurchase);
  e.G.store.replace(e.parse(e.G.state)); e.flush(); const saved = JSON.stringify(e.G.state), buys = e.buyCalls.length, begins = e.beginCalls.length;
  oldPurchase.click(); oldReturn.click(); oldPlacement.click(); e.flush(); assert.equal(JSON.stringify(e.G.state), saved); assert.equal(e.buyCalls.length, buys); assert.equal(e.beginCalls.length, begins); assert.notEqual(e.G.runtime.activeRoomId, e.living);
});

test('折叠换房会真正更换当前房与后续beginPlacement目标，不修改房屋数据', () => {
  const e = harness(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); const before = JSON.stringify(e.G.state);
  const fold = e.body().querySelector('details.decor-room-switch'); assert.ok(fold); fold.open = true;
  const picker = fold.querySelector('[data-cute-control="select"]'); assert.ok(picker); picker.choose(e.bedroom); e.flush();
  assert.equal(e.G.runtime.activeRoomId, e.bedroom); assert.match(e.body().querySelector('.decor-room-name').textContent, /卧室/); assert.match(e.body().querySelector('.decor-room-context').textContent, /1楼.*第1间/);
  e.item('bed_basic').click(); e.flush(); assert.deepEqual(e.beginCalls.at(-1), ['bed_basic', e.bedroom]); unchanged(e, before);
});

test('商店更换主题分类与搜索不污染返回装扮的原房/主题/分类/搜索', () => {
  const e = harness(), category = e.G.data.furnitureById.bed_basic.category;
  const target = e.G.data.furniture.find(def => def.theme === 'forest' && def.category === category && !def.rewardOnly && !def.festivalId && def.place !== 'yard'); assert.ok(target);
  e.G.store.update(state => e.G.data.furniture.filter(def => def.theme === 'forest').forEach(def => { delete state.inventory[def.id]; })); e.flush();
  e.open('decor', { roomId: e.living }); e.choose('decor-theme', 'forest'); e.input('decor-search', target.name);
  const bedroomCategory = e.body().querySelectorAll('button').find(button => button.textContent === '卧室'); assert.ok(bedroomCategory); bedroomCategory.click(); e.flush();
  const before = JSON.stringify(e.G.state); e.click('decor-buy-theme');
  const shopTheme = e.body().querySelector('[aria-label="筛选家具主题"]'); assert.ok(shopTheme); shopTheme.choose('strawberry'); e.flush(); e.input('shop-search', '沙发');
  const livingCategory = e.body().querySelectorAll('button').find(button => button.textContent === '客厅'); assert.ok(livingCategory); livingCategory.click(); e.flush(); e.click('decor-return');
  assert.equal(e.G.runtime.activeRoomId, e.living); assert.equal(e.key('decor-theme').value, 'forest'); assert.equal(e.key('decor-search').value, target.name);
  const restored = e.body().querySelectorAll('button').find(button => button.textContent === '卧室'); assert.ok(restored); assert.equal(restored.getAttribute('aria-pressed'), 'true'); unchanged(e, before);
});

test('同ID换档后的旧主题/房间选择器与搜索输入不能驱动新装扮上下文', () => {
  const e = harness(); e.open('decor', { roomId: e.living });
  const oldTheme = e.key('decor-theme'), oldSearch = e.key('decor-search'), oldRoom = e.body().querySelector('details.decor-room-switch').querySelector('[data-cute-control="select"]'); assert.ok(oldTheme); assert.ok(oldSearch); assert.ok(oldRoom);
  e.G.store.replace(e.parse(e.G.state)); e.flush(); e.open('decor', { roomId: e.living });
  const before = JSON.stringify(e.G.state), theme = e.key('decor-theme').value, search = e.key('decor-search').value;
  oldTheme.choose('basic'); oldRoom.choose(e.bedroom); oldSearch.value = '南瓜'; oldSearch.fire('input'); e.flush();
  assert.equal(e.G.runtime.activeRoomId, e.living); assert.equal(e.key('decor-theme').value, theme); assert.equal(e.key('decor-search').value, search); assert.equal(e.beginCalls.length, 0); unchanged(e, before);
});

function mobileDecor() {
  const e = harness(); e.mobile(); owned(e, 'bed_basic'); e.open('decor', { roomId: e.living }); resetMovement(e); return e;
}
function resetMovement(e) { e.scroll(600); e.scrollCalls.length = 0; e.focusCalls.length = 0; }
function noMovement(e, reason) { assert.equal(e.scrollCalls.length, 0, reason + '不可滚动'); assert.equal(e.focusCalls.length, 0, reason + '不可抢焦点'); assert.equal(e.scrollY(), 600, reason + '保留当前位置'); }

test('手机深页点选成功后单次RAF回到实际场景顶部，聚焦取消时preventScroll', () => {
  const e = mobileDecor(), before = JSON.stringify(e.G.state); e.item('bed_basic').click();
  assert.equal(e.panel.classList.contains('hidden'), true); assert.equal(e.G.runtime.placing, 'bed_basic'); noMovement(e, '成功同步阶段');
  e.flush(); assert.deepEqual(e.scrollCalls, [{ top: e.worldPageTop, behavior: 'auto' }]); assert.equal(e.scrollY(), e.worldPageTop);
  const cancel = e.key('placement-cancel'); assert.ok(cancel); assert.equal(e.document.activeElement, cancel); assert.equal(e.focusCalls.length, 1); assert.equal(e.focusCalls[0].node, cancel); assert.deepEqual(e.focusCalls[0].options, { preventScroll: true });
  e.flush(); assert.equal(e.scrollCalls.length, 1, '后续刷新不持续拉回场景'); e.click('placement-cancel'); assert.equal(e.G.runtime.placing, null); unchanged(e, before);
});

test('失败、取消、同件重新开始、同ID换档与离开手机尺寸会使旧回场景RAF失效', () => {
  {
    const e = mobileDecor(); e.begin({ ok: false, message: '这次不能摆放。' }); e.item('bed_basic').click(); e.flush();
    assert.equal(e.panel.classList.contains('hidden'), false); assert.equal(e.G.runtime.placing, null); noMovement(e, 'begin失败');
  }
  {
    const e = mobileDecor(); e.item('bed_basic').click(); const oldFrames = e.takeFrames(); e.key('placement-cancel').click(); resetMovement(e); e.runFrames(oldFrames);
    assert.equal(e.G.runtime.placing, null); noMovement(e, '取消后的旧回调');
  }
  {
    const e = mobileDecor(); e.item('bed_basic').click(); const oldFrames = e.takeFrames(); e.open('decor', { roomId: e.living }); resetMovement(e);
    e.item('bed_basic').click(); const currentFrames = e.takeFrames(); assert.equal(e.G.runtime.placing, 'bed_basic'); resetMovement(e); e.runFrames(oldFrames); noMovement(e, '同件再次开始前一轮回调');
    e.runFrames(currentFrames); assert.deepEqual(e.scrollCalls, [{ top: e.worldPageTop, behavior: 'auto' }]); assert.equal(e.focusCalls.length, 1); assert.deepEqual(e.focusCalls[0].options, { preventScroll: true });
  }
  {
    const e = mobileDecor(); e.item('bed_basic').click(); const oldFrames = e.takeFrames(); e.G.store.replace(e.parse(e.G.state)); e.flush(); e.open('decor', { roomId: e.living }); resetMovement(e);
    e.item('bed_basic').click(); const currentFrames = e.takeFrames(); resetMovement(e); e.runFrames(oldFrames); noMovement(e, '同ID换档前回调');
    e.runFrames(currentFrames); assert.deepEqual(e.scrollCalls, [{ top: e.worldPageTop, behavior: 'auto' }]); assert.equal(e.G.runtime.activeRoomId, e.living);
  }
  {
    const e = mobileDecor(); e.item('bed_basic').click(); const oldFrames = e.takeFrames(); e.mobile(false); resetMovement(e); e.runFrames(oldFrames); noMovement(e, '手机尺寸已结束的回调');
  }
});

test('手机深页原生dragstart及收面板RAF保持滚动与焦点，不抢拖放手势', () => {
  const e = mobileDecor(), before = JSON.stringify(e.G.state), values = new Map(), dataTransfer = { dropEffect: 'copy', setData(type, value) { values.set(type, value); } };
  const start = e.item('bed_basic').fire('dragstart', { dataTransfer }); assert.notEqual(start.prevented, true); assert.equal(values.get('application/x-marshmallow-item'), 'bed_basic'); assert.equal(e.panel.classList.contains('hidden'), false); noMovement(e, 'dragstart');
  e.flush(); assert.equal(e.panel.classList.contains('hidden'), true); assert.equal(e.G.runtime.placing, 'bed_basic'); noMovement(e, '原生拖放收面板后'); unchanged(e, before);
});

(async () => { for (const { name, run } of tests) { await run(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组装扮房间/主题/商店闭环检查通过（内存DOM，不替代真实桌面/手机验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
