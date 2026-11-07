'use strict';
// MC-079：复用真实 ui.js 装扮夹具；只包装当前测试需要的浏览器/renderer 边界。
// 家具 place 仅用于安排初始实物；背包点选必须委托 beginPlacement，不在 UI 夹具代放。
const assert = require('node:assert/strict');
const { harness, themeItem, plain } = require('./visual-shell-decor.cjs');
const tests = [], test = (name, run) => tests.push({ name, run });
const atticId = 'attic:observatory';

function succeeds(result) { assert.equal(result?.ok, true, result?.message || '真实规则应成功'); return result; }
function atticHarness(options = {}) {
  const e = harness(), { G } = e, proto = Object.getPrototypeOf(e.panel);
  // 原夹具只覆盖装扮；普通建造卡片还读取浏览器的 lastElementChild。
  Object.defineProperty(proto, 'lastElementChild', { configurable: true, get() { return this.children.at(-1) || null; } });
  e.load('js/data/observatory.js'); e.load('js/systems/observatory.js');
  G.draw = G.draw || {}; G.draw.observatory = { draw() {}, drawConstellation() {} };
  const cameraCalls = [], viewCalls = [], commitCalls = [], ruleCalls = [], successEvents = [];
  G.render.camera.focusObservatory = () => cameraCalls.push(['observatory']);
  G.render.camera.focusRoom = id => cameraCalls.push(['room', id]);
  G.render.getHouseView = () => plain(G.runtime.houseView || { floor: 'all', view: 'cutaway', previewFourFloors: false });
  G.render.setHouseView = patch => {
    viewCalls.push(plain(patch)); G.runtime.houseView = { ...G.render.getHouseView(), ...plain(patch) };
    G.bus.emit('house:view', G.render.getHouseView()); return G.render.getHouseView();
  };
  let denyCommit = false;
  const commit = G.save.commit;
  G.save.commit = (next, settings) => { commitCalls.push({ next: plain(next), options: plain(settings || {}) }); return denyCommit ? false : commit(next, settings); };
  for (const name of ['place', 'move', 'wallpaper', 'floor', 'recolor', 'remove', 'undo']) {
    const action = G.sys.decorating[name];
    G.sys.decorating[name] = (...args) => { ruleCalls.push({ name, args: plain(args) }); return action.apply(G.sys.decorating, args); };
  }
  for (const name of ['state:change', 'item:placed', 'item:moved', 'item:removed', 'room:decorated', 'decoration:undone', 'observatory:built', 'observatory:observed']) G.bus.on(name, value => successEvents.push({ name, value: plain(value || {}) }));
  e.load('js/ui/observatory.js');
  G.store.update(state => { state.level = options.level ?? 30; state.wallet.coin = options.coin ?? 100000; state.settings.dayMode = 'night'; });
  if (options.built !== false) succeeds(G.sys.observatory.build());
  e.flush();
  assert.equal(G.store.atticRoomId, atticId, '测试必须使用真实阁楼空间契约');
  return { ...e, atticId, cameraCalls, viewCalls, commitCalls, ruleCalls, successEvents, rejectWrites(value) { denyCommit = value; } };
}
function attic(e) { const room = e.G.store.decorRoom(e.G.state, atticId); assert.ok(room, '已建阁楼必须由真实 store 解析'); return room; }
function furniture(e, uid, roomId = atticId) { return e.G.store.decorRoom(e.G.state, roomId).items.find(item => item.uid === uid); }
function seed(e, id = 'bed_basic', roomId = atticId) { const result = succeeds(e.G.sys.decorating.place(id, roomId, 25, 100)); e.flush(); return result.uid; }
function tools(e) { return e.document.getElementById('selection-tools'); }
function exactButton(root, text) { const button = root.querySelectorAll('button').find(node => node.textContent.trim() === text); assert.ok(button, text); return button; }
function tab(e, text) { const button = e.body().querySelectorAll('.ui-tab').find(node => node.textContent.includes(text)); assert.ok(button, text); button.click(); e.flush(); }
function wallForm(e, kind) {
  tab(e, kind === 'wallpaper' ? '墙纸' : '地板');
  const pattern = e.body().querySelector('.appearance-controls [data-cute-control="select"]'); assert.ok(pattern);
  const desired = kind === 'wallpaper' ? 'hearts' : 'marble'; assert.ok(pattern.options.some(option => option.id === desired)); pattern.value = desired;
  const color = e.key('wall-color'); assert.ok(color); color.value = '#123456';
  const second = e.key('wall-color2'); if (second) second.value = '#FEDCBA';
  return exactButton(e.body(), kind === 'wallpaper' ? '换上新墙纸' : '铺上新地板');
}
function selectItem(e, uid, roomId = atticId) { e.G.bus.emit('scene:item', { roomId, uid }); e.flush(); assert.equal(tools(e).classList.contains('hidden'), false); }
function selectedColor(e) { const input = tools(e).querySelectorAll('input').find(node => node.type === 'color'); assert.ok(input, '真实选中色彩控件'); return input; }
function snap(e) { return { object: e.G.state, json: JSON.stringify(e.G.state), commits: e.commitCalls.length, events: e.successEvents.length, successes: e.sounds.filter(name => name === 'success').length }; }
function rejected(e, before) {
  assert.equal(e.G.state, before.object, '持久拒写不得发布新内存状态'); assert.equal(JSON.stringify(e.G.state), before.json);
  assert.equal(e.commitCalls.length, before.commits + 1, '同次动作只提交一次真实持久事务'); assert.equal(e.successEvents.length, before.events);
  assert.equal(e.sounds.filter(name => name === 'success').length, before.successes); assert.match(e.toasts.at(-1), /保存|本机|JSON|原来/);
}

test('未建阁楼遵守Lv17与1000糖果，不能进入假装扮；真实建造后才出现布置入口', () => {
  for (const [level, coin] of [[16, 5000], [17, 999]]) {
    const e = atticHarness({ built: false, level, coin }); e.open('observatory'); const before = JSON.stringify(e.G.state);
    assert.equal(e.key('observatory-action').disabled, true); assert.equal(e.key('observatory-decor').hidden, true); assert.equal(e.key('observatory-decor').disabled, true);
    e.key('observatory-decor').click(); e.G.ui.open('decor', { roomId: atticId }); e.flush();
    assert.equal(e.panel.dataset.kind, 'observatory'); assert.equal(e.G.store.decorRoom(e.G.state, atticId), null); assert.equal(e.beginCalls.length, 0); assert.equal(JSON.stringify(e.G.state), before);
  }
  const e = atticHarness({ built: false, level: 17, coin: 1000 }), rooms = JSON.stringify(e.G.state.house.rooms), floors = JSON.stringify(e.G.state.house.floors), count = e.G.state.quests.stats.roomsBuilt;
  e.open('observatory'); assert.match(e.key('observatory-action').textContent, /1,000/); assert.equal(e.key('observatory-decor').hidden, true); e.click('observatory-action');
  assert.equal(e.G.state.wallet.coin, 0); assert.deepEqual(plain(attic(e).items), []); assert.equal(e.key('observatory-decor').hidden, false); assert.equal(e.key('observatory-decor').disabled, false);
  assert.equal(JSON.stringify(e.G.state.house.rooms), rooms); assert.equal(JSON.stringify(e.G.state.house.floors), floors); assert.equal(e.G.state.quests.stats.roomsBuilt, count);
});

test('阁楼建造持久拒写不会显示布置入口、扣糖果或假报成功，重试只建一次', () => {
  const e = atticHarness({ built: false, level: 17, coin: 1000 }); e.open('observatory'); const before = snap(e); e.rejectWrites(true); e.click('observatory-action');
  assert.equal(e.G.state, before.object); assert.equal(JSON.stringify(e.G.state), before.json); assert.equal(e.commitCalls.length, before.commits + 1); assert.equal(e.successEvents.length, before.events);
  assert.equal(e.key('observatory-decor').hidden, true); assert.equal(e.key('observatory-decor').disabled, true); assert.equal(e.G.state.house.attic, null); assert.match(e.key('observatory-feedback').textContent, /糖果保持原样/); assert.equal(e.sounds.filter(name => name === 'success').length, before.successes);
  e.rejectWrites(false); e.click('observatory-action'); assert.ok(attic(e)); assert.equal(e.G.state.wallet.coin, 0); assert.equal(e.successEvents.filter(event => event.name === 'observatory:built').length, 1);
});

test('已建天文台布置按钮选中真实阁楼并保留镜头，显式观星入口仍聚焦剖面', () => {
  const e = atticHarness(); e.open('observatory'); const before = JSON.stringify(e.G.state), commits = e.commitCalls.length;
  const preservedView = { floor: 'all', view: 'exterior', previewFourFloors: true };
  e.G.render.setHouseView(preservedView); const cameraCount = e.cameraCalls.length; e.click('observatory-decor');
  assert.deepEqual(e.navigation.at(-1), ['decor', { roomId: atticId }]); assert.equal(e.G.runtime.activeRoomId, atticId); assert.equal(e.panel.dataset.kind, 'decor'); assert.match(e.body().querySelector('.decor-room-name').textContent, /阁楼/); assert.doesNotMatch(e.body().querySelector('.decor-room-name').textContent, /第\d+间/);
  const picker = e.key('decor-room-picker'); assert.ok(picker); assert.equal(picker.value, atticId); assert.ok(picker.options.some(option => option.id === atticId && /阁楼/.test(option.name))); assert.ok(e.key('decor-observatory'));
  assert.deepEqual(e.G.render.getHouseView(), preservedView); assert.equal(e.cameraCalls.length, cameraCount, '打开装饰不强制切层或移动镜头');
  e.open('decor', { roomId: e.living }); assert.equal(e.G.runtime.activeRoomId, e.living); assert.deepEqual(e.G.render.getHouseView(), preservedView); assert.equal(e.cameraCalls.length, cameraCount);
  e.open('observatory');
  assert.equal(e.G.runtime.activeRoomId, atticId); assert.deepEqual(e.G.render.getHouseView(), { floor: 'attic', view: 'cutaway', previewFourFloors: false }); assert.ok(e.cameraCalls.length > cameraCount); assert.deepEqual(e.cameraCalls.at(-1), ['observatory']);
  e.open('decor'); assert.equal(e.G.runtime.activeRoomId, atticId); assert.equal(e.key('decor-room-picker').value, atticId); assert.deepEqual(e.G.render.getHouseView(), { floor: 'attic', view: 'cutaway', previewFourFloors: false });
  assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.commitCalls.length, commits); assert.equal(e.ruleCalls.filter(call => call.name === 'place').length, 0);
});

test('场景阁楼入口不进入普通房间菜单，装扮可回原观星记录且不重复领奖', () => {
  const e = atticHarness(); e.open('observatory'); e.click('observatory-action'); const sky = JSON.stringify(e.G.state.observatory), before = JSON.stringify(e.G.state), modals = e.modals.length;
  assert.equal(e.G.state.observatory.fragments, 3); e.G.bus.emit('scene:room', { roomId: atticId }); e.flush();
  assert.equal(e.panel.dataset.kind, 'decor'); assert.equal(e.modals.length, modals); assert.equal(e.G.runtime.activeRoomId, atticId); assert.doesNotMatch(e.body().textContent, /拆除房间|换个用途|房间换位置/);
  e.click('decor-observatory'); assert.equal(e.panel.dataset.kind, 'observatory'); assert.equal(e.key('observatory-action').disabled, true); assert.match(e.body().textContent, /今天已/); assert.equal(JSON.stringify(e.G.state.observatory), sky); assert.equal(JSON.stringify(e.G.state), before);
  const unbuilt = atticHarness({ built: false }); unbuilt.G.bus.emit('scene:room', { roomId: atticId }); unbuilt.flush(); assert.equal(unbuilt.panel.dataset.kind, 'observatory'); assert.equal(unbuilt.modals.length, 0); assert.equal(unbuilt.key('observatory-decor').hidden, true);
});

test('装饰picker只切换阁楼或普通房间目标并保留镜头，普通建造与居民床位范围不扩大', () => {
  const e = atticHarness(); e.open('decor', { roomId: atticId }); const preservedView = e.G.render.getHouseView(), cameraCount = e.cameraCalls.length; e.choose('decor-room-picker', e.living);
  assert.equal(e.G.runtime.activeRoomId, e.living); assert.match(e.body().querySelector('.decor-room-name').textContent, /客厅/); assert.equal(e.key('decor-observatory'), null); assert.deepEqual(e.G.render.getHouseView(), preservedView); assert.equal(e.cameraCalls.length, cameraCount);
  e.choose('decor-room-picker', atticId); assert.equal(e.G.runtime.activeRoomId, atticId); assert.deepEqual(e.G.render.getHouseView(), preservedView); assert.equal(e.cameraCalls.length, cameraCount);
  seed(e); assert.equal(e.G.sys.residents.eligibility('lily').roomIds.includes(atticId), false); assert.equal(e.G.sys.residents.eligibility('lily').ok, false, '阁楼有床仍不产生普通居民床位');
  seed(e, 'bed_basic', e.bedroom); assert.deepEqual(plain(e.G.sys.residents.eligibility('lily').roomIds), [e.bedroom]);
  e.open('build'); assert.ok(e.body().querySelectorAll('[data-cute-control="select"]').length); for (const picker of e.body().querySelectorAll('[data-cute-control="select"]')) assert.equal(picker.options.some(option => option.id === atticId), false);
  assert.equal(Object.hasOwn(e.G.state.house.rooms, atticId), false); assert.equal(e.G.state.house.floors.some(floor => floor.slots.includes(atticId)), false); assert.equal(e.G.data.rooms.some(room => room.id === 'observatory'), false);
  e.G.bus.emit('resident:invite_requested', { id: 'lily' }); e.flush(); const invite = e.modals.at(-1).content.querySelector('[data-cute-control="select"]'); assert.ok(invite); assert.deepEqual(invite.options.map(option => option.id), [e.bedroom]);
});

test('背包只显示真实剩余库存，商店已拥有数量包含阁楼与普通房中的实物', () => {
  const e = atticHarness(); seed(e); e.open('decor', { roomId: atticId }); assert.ok(e.item('bed_basic')); assert.match(e.item('bed_basic').querySelector('.item-count').textContent, /×1/);
  seed(e, 'bed_basic', e.bedroom); e.open('decor', { roomId: atticId }); assert.equal(e.G.state.inventory.bed_basic, 0); assert.equal(e.item('bed_basic'), null);
  const before = JSON.stringify(e.G.state); e.open('shop'); e.input('shop-search', e.G.data.furnitureById.bed_basic.name); assert.ok(e.item('bed_basic')); assert.match(e.item('bed_basic').textContent, /已拥有 2/); assert.equal(e.buyCalls.length, 0); assert.equal(JSON.stringify(e.G.state), before);
});

test('阁楼点选先委托beginPlacement，失败保留面板，成功后持续取消/换一件且不代放家具', () => {
  const e = atticHarness(); e.open('decor', { roomId: atticId }); const before = JSON.stringify(e.G.state), places = e.ruleCalls.filter(call => call.name === 'place').length;
  e.begin({ ok: false, message: '阁楼剖面暂时还没有准备好。' }); e.item('bed_basic').click(); e.flush(); assert.deepEqual(e.beginCalls.at(-1), ['bed_basic', atticId]); assert.equal(e.panel.classList.contains('hidden'), false); assert.equal(e.G.runtime.placing, null); assert.match(e.toasts.at(-1), /阁楼剖面/);
  e.begin({ ok: true, message: '可以摆放。' }); e.item('bed_basic').click(); e.flush(); assert.equal(e.panel.classList.contains('hidden'), true); assert.equal(e.G.runtime.selected, null); assert.equal(e.G.runtime.placing, 'bed_basic'); assert.match(tools(e).querySelector('.placement-status').textContent, /阁楼/); assert.ok(e.key('placement-cancel')); e.click('placement-change');
  assert.equal(e.G.runtime.placing, null); assert.equal(e.panel.dataset.kind, 'decor'); assert.equal(e.G.runtime.activeRoomId, atticId); assert.match(e.body().querySelector('.decor-room-name').textContent, /阁楼/);
  e.item('bed_basic').click(); e.flush(); e.click('placement-cancel'); assert.equal(e.G.runtime.placing, null); assert.equal(tools(e).classList.contains('hidden'), true); assert.equal(e.cancelCalls.length, 2); assert.equal(e.ruleCalls.filter(call => call.name === 'place').length, places); assert.equal(JSON.stringify(e.G.state), before);
});

test('阁楼墙纸与地板按钮调用真实持久装饰事务，普通房间和观星凭据保持', () => {
  const e = atticHarness(); e.open('decor', { roomId: atticId }); const ordinary = JSON.stringify(e.G.state.house.rooms), sky = JSON.stringify(e.G.state.observatory), commits = e.commitCalls.length;
  wallForm(e, 'wallpaper').click(); e.flush(); assert.deepEqual(plain(attic(e).wallpaper), { pattern: 'hearts', color: '#123456', color2: '#FEDCBA' });
  wallForm(e, 'floor').click(); e.flush(); assert.deepEqual(plain(attic(e).floor), { pattern: 'marble', color: '#123456' }); assert.equal(e.commitCalls.length, commits + 2);
  assert.equal(e.ruleCalls.filter(call => call.name === 'wallpaper').at(-1).args[0], atticId); assert.equal(e.ruleCalls.filter(call => call.name === 'floor').at(-1).args[0], atticId); assert.equal(JSON.stringify(e.G.state.house.rooms), ordinary); assert.equal(JSON.stringify(e.G.state.observatory), sky);
});

test('阁楼家具被scene:item选中后深度控件只在change提交一次真实move并保留UID', () => {
  const e = atticHarness(), uid = seed(e); selectItem(e, uid); const depth = e.key('item-depth-' + uid); assert.ok(depth); const before = JSON.stringify(e.G.state), commits = e.commitCalls.length, item = plain(furniture(e, uid)), inventory = e.G.state.inventory.bed_basic;
  depth.value = '0.25'; depth.fire('input'); assert.equal(JSON.stringify(e.G.state), before); assert.equal(e.commitCalls.length, commits); depth.fire('change'); e.flush();
  const move = e.ruleCalls.filter(call => call.name === 'move').at(-1); assert.deepEqual(move.args, [atticId, uid, atticId, item.x, item.y, null, 0.25]); assert.equal(e.commitCalls.length, commits + 1); assert.equal(furniture(e, uid).depth, 0.25); assert.equal(furniture(e, uid).uid, uid); assert.equal(e.G.state.inventory.bed_basic, inventory); assert.equal(e.key('item-depth-' + uid).value, '0.25');
});

test('墙地同次持久拒写保留存档与成功事件，恢复后原按钮可仅提交一次重试', () => {
  for (const kind of ['wallpaper', 'floor']) {
    const e = atticHarness(); e.open('decor', { roomId: atticId }); const apply = wallForm(e, kind), before = snap(e); e.rejectWrites(true); apply.click(); e.flush(); rejected(e, before); assert.equal(e.panel.dataset.kind, 'decor'); assert.equal(e.panel.classList.contains('hidden'), false);
    e.rejectWrites(false); apply.click(); e.flush(); assert.equal(e.commitCalls.length, before.commits + 2); assert.equal(e.successEvents.filter(event => event.name === 'room:decorated' && event.value.roomId === atticId).length, 1); assert.equal(attic(e)[kind].pattern, kind === 'wallpaper' ? 'hearts' : 'marble');
  }
});

test('选中阁楼家具的深度/颜色拒写不假成功，控件还原保存值且可重试', () => {
  const e = atticHarness(), uid = seed(e); selectItem(e, uid); const depth = e.key('item-depth-' + uid), originalDepth = depth.value; e.rejectWrites(true);
  let before = snap(e); depth.value = '0.1'; depth.fire('input'); depth.fire('change'); e.flush(); rejected(e, before); assert.equal(depth.value, originalDepth); assert.equal(furniture(e, uid).depth, Number(originalDepth));
  const color = selectedColor(e), originalColor = color.value; before = snap(e); color.value = '#112233'; color.fire('change'); e.flush(); rejected(e, before); assert.equal(color.value, originalColor); assert.equal(furniture(e, uid).color, null);
  e.rejectWrites(false); const commits = e.commitCalls.length; depth.value = '0.1'; depth.fire('change'); e.flush(); assert.equal(e.commitCalls.length, commits + 1); assert.equal(furniture(e, uid).depth, 0.1);
  const retryColor = selectedColor(e); retryColor.value = '#112233'; retryColor.fire('change'); e.flush(); assert.equal(e.commitCalls.length, commits + 2); assert.equal(furniture(e, uid).color, '#112233'); assert.equal(furniture(e, uid).uid, uid);
});

test('阁楼选中家具收起与撤销都经真实持久事务，拒写不丢家具或库存', () => {
  const e = atticHarness(), uid = seed(e), inventory = e.G.state.inventory.bed_basic, original = plain(furniture(e, uid)); selectItem(e, uid);
  let before = snap(e); e.rejectWrites(true); exactButton(tools(e), '📦 收起来').click(); e.flush(); rejected(e, before); assert.ok(furniture(e, uid)); assert.equal(e.G.runtime.selected.uid, uid); assert.equal(e.G.state.inventory.bed_basic, inventory);
  e.rejectWrites(false); exactButton(tools(e), '📦 收起来').click(); e.flush(); assert.equal(furniture(e, uid), undefined); assert.equal(e.G.state.inventory.bed_basic, inventory + 1); assert.equal(e.G.runtime.selected, null); assert.equal(tools(e).classList.contains('hidden'), true);
  e.open('decor', { roomId: atticId }); before = snap(e); e.rejectWrites(true); exactButton(e.body(), '↶ 撤销').click(); e.flush(); rejected(e, before); assert.equal(furniture(e, uid), undefined); assert.equal(e.G.state.inventory.bed_basic, inventory + 1);
  e.rejectWrites(false); exactButton(e.body(), '↶ 撤销').click(); e.flush(); assert.deepEqual(plain(furniture(e, uid)), original); assert.equal(e.G.state.inventory.bed_basic, inventory); assert.equal(e.successEvents.filter(event => event.name === 'item:removed' && event.value.roomId === atticId).length, 1); assert.equal(e.successEvents.filter(event => event.name === 'decoration:undone').length, 1);
});

test('阁楼缺货去真实商店保留原房主题筛选，返回装饰保留当前视角，不自动购买', () => {
  for (const target of ['attic', 'ordinary']) {
    const e = atticHarness(), roomId = target === 'attic' ? atticId : e.living, definition = themeItem(e, 'forest'); assert.ok(definition);
    e.G.store.update(state => e.G.data.furniture.filter(def => def.theme === 'forest').forEach(def => { delete state.inventory[def.id]; })); e.flush(); e.open('decor', { roomId }); e.choose('decor-theme', 'forest'); e.input('decor-search', definition.name); const before = JSON.stringify(e.G.state);
    e.click('decor-buy-theme'); assert.equal(e.panel.dataset.kind, 'shop'); assert.ok(e.item(definition.id)); assert.equal(e.buyCalls.length, 0); const shopTheme = e.body().querySelector('[aria-label="筛选家具主题"]'); shopTheme.choose('basic'); e.flush(); e.input('shop-search', '小床');
    const preservedView = { floor: target === 'attic' ? 1 : 'attic', view: 'exterior', previewFourFloors: true };
    e.G.render.setHouseView(preservedView); const cameraCount = e.cameraCalls.length; e.click('decor-return');
    assert.equal(e.G.runtime.activeRoomId, roomId); assert.equal(e.key('decor-theme').value, 'forest'); assert.equal(e.key('decor-search').value, definition.name); assert.deepEqual(e.G.render.getHouseView(), preservedView); assert.equal(e.cameraCalls.length, cameraCount); assert.equal(e.buyCalls.length, 0); assert.equal(JSON.stringify(e.G.state), before);
  }
});

test('同ID换档后旧阁楼入口/背包/商店/墙地与depth/color DOM不得驱动新档', () => {
  const e = atticHarness(), uid = seed(e); e.open('observatory'); const oldEntry = e.key('observatory-decor'); e.click('observatory-decor');
  const oldPlace = e.item('bed_basic'), oldRoom = e.key('decor-room-picker'), oldTheme = e.key('decor-theme'), oldSearch = e.key('decor-search'); assert.ok(oldPlace);
  selectItem(e, uid); const oldDepth = e.key('item-depth-' + uid), oldColor = selectedColor(e), oldWall = wallForm(e, 'wallpaper'), oldFloor = wallForm(e, 'floor'); tab(e, '背包'); e.choose('decor-theme', 'forest'); e.click('decor-buy-theme');
  const oldReturn = e.key('decor-return'), oldBuy = e.body().querySelectorAll('.item-card').map(card => card.querySelector('button')).find(button => button && !button.disabled); assert.ok(oldReturn); assert.ok(oldBuy);
  e.G.store.replace(e.parse(e.G.state)); e.flush(); assert.equal(e.G.runtime.selected, null); assert.equal(e.G.runtime.placing, null); assert.notEqual(e.G.runtime.activeRoomId, atticId); assert.equal(tools(e).classList.contains('hidden'), true); e.open('decor', { roomId: atticId });
  const before = snap(e), begins = e.beginCalls.length, buys = e.buyCalls.length, rules = e.ruleCalls.length, navigation = e.navigation.length, theme = e.key('decor-theme').value;
  oldEntry.click(); oldPlace.click(); oldRoom.choose(e.bedroom); oldTheme.choose('basic'); oldSearch.value = '南瓜'; oldSearch.fire('input'); oldReturn.click(); oldBuy.click(); oldWall.click(); oldFloor.click(); oldDepth.value = '0'; oldDepth.fire('change'); oldColor.value = '#000000'; oldColor.fire('change'); e.flush();
  assert.equal(JSON.stringify(e.G.state), before.json); assert.equal(e.commitCalls.length, before.commits); assert.equal(e.ruleCalls.length, rules); assert.equal(e.beginCalls.length, begins); assert.equal(e.buyCalls.length, buys); assert.equal(e.navigation.length, navigation); assert.equal(e.G.runtime.activeRoomId, atticId); assert.equal(e.key('decor-theme').value, theme); assert.equal(e.key('decor-search').value, ''); assert.match(e.body().querySelector('.decor-room-name').textContent, /阁楼/);
});

(async () => { for (const { name, run } of tests) { await run(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组阁楼装扮UI检查通过（内存DOM/renderer边界，不替代实际3D命中与设备验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
