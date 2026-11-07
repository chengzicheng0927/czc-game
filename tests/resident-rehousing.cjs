'use strict';
// 真实墙体改建、居民安置事务与原居民面板；内存存档/DOM，不启动服务或访问玩家数据。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/content-dom.cjs');
const spaces = require('./fixtures/free-spaces.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [], test = (name, fn) => tests.push({ name, fn });
function harness() {
  const env = setup(), { G, context, document, panel } = env;
  const schema = context.CottageBuilding, outcomes = [], navigation = [], events = [];
  let writes = 0, denied = false;
  const write = context.localStorage.setItem;
  context.localStorage.setItem = (key, value) => { if (denied) throw new Error('QuotaExceededError'); writes++; return write(key, value); };
  G.store.update(state => { state.level = 30; state.wallet.coin = 10000; state.wallet.heart = 100; state.tutorial.done = true; });
  const home = spaces.buildSpace(G, 0, 0, 'bedroom').roomId;
  assert.ok(spaces.placeItem(G, 'bed_basic', home, 10, 80).ok); assert.ok(G.sys.residents.invite('lily', home).ok);
  G.store.update(state => { state.residents.lily.affection = 1000; });
  for (const level of [1, 2, 3]) assert.ok(G.sys.residents.claimFriendship('lily', level).ok);
  const original = plain(G.state.building), floorId = original.floors[0].id;
  G.bus.on('resident:rehoused', event => events.push(plain(event)));
  env.load('js/core/public-house.js');
  G.ui.controls.select = (options, value, callback) => { const node = document.createElement('button'); node.value = value; node.options = plain(options); node.choose = id => { node.value = id; callback?.(id); }; return node; };
  G.ui.controls.label = (control, label) => { const node = document.createElement('label'), text = document.createElement('span'); text.textContent = label; node.append(text, control); return node; };
  const api = { roomName: id => G.contentSpaces.get(id) ? '现有卧室 ' + id : '原来的空间', chat() {}, gift() {}, invite() {}, navigate() {}, doAction(result) { outcomes.push(result); if (result.ok) render(); return result.ok; } };
  function render() { panel.className = ''; panel.dataset.kind = 'residents'; const result = G.ui.residentBook.panel(api); panel.replaceChildren(result.content); return result; }
  G.ui.open = name => { navigation.push(name); if (name === 'residents') render(); }; G.ui.refresh = render;
  env.load('js/ui/residents.js');
  G.ui.residentBook.focus('lily');
  function split() {
    G.store.update(state => { state.building = schema.executeCommand(state.building, { type: 'wall.add', wall: { id: 'new_partition', floorId, start: { x: 2, z: 0 }, end: { x: 2, z: 3 }, height: 2.8, thickness: .16, color: '#F4DDE7' } }, G.data.furnitureById); }, { persist: true });
    assert.equal(G.contentSpaces.get(home), null, '分隔后旧几何空间编号必须失效，才能覆盖实际问题');
  }
  const key = name => panel.querySelectorAll('*').find(node => node.dataset.uiFocus === 'resident-v2-' + name);
  return { ...env, schema, home, floorId, original, split, render, key, events, outcomes, navigation, writes: () => writes, fail(value) { denied = value; } };
}
function unchangedExceptAddress(before, after) { const left = plain(before), right = plain(after); delete left.roomId; delete right.roomId; assert.deepEqual(right, left, '安置不得重置好感/心愿/礼物/泡泡等居民记录'); }

test('真实分隔墙使原地址失效，安置查询只读并返回真实合格空位', () => {
  const env = harness(); assert.equal(env.G.sys.residents.relocation('lily').needed, false); env.split();
  const before = JSON.stringify(env.G.state), writes = env.writes(), result = env.G.sys.residents.relocation('lily');
  assert.equal(result.needed, true); assert.equal(result.ok, true); assert.equal(result.roomIds.length, 1);
  const target = env.G.contentSpaces.get(result.roomIds[0]); assert.ok(target); assert.ok(target.items.some(item => env.G.data.furnitureById[item.defId].template === 'bed'));
  assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
});

test('明确安置仅改地址与回忆并一次落盘，保留经济/库存/拥有/好感/礼物，生活与公开投影恢复', () => {
  const env = harness(); env.split(); const { G } = env, before = plain(G.state), writes = env.writes(), target = G.sys.residents.relocation('lily').roomIds[0];
  assert.equal(G.sys.residentLife.snapshot().some(actor => actor.id === 'lily'), false);
  const result = G.sys.residents.relocate('lily', target); assert.equal(result.ok, true); assert.equal(env.writes(), writes + 1); assert.equal(env.events.length, 1);
  assert.equal(G.state.residents.lily.roomId, target); unchangedExceptAddress(before.residents.lily, G.state.residents.lily);
  for (const field of ['wallet', 'inventory', 'collection', 'avatar', 'quests', 'building']) assert.deepEqual(plain(G.state[field]), before[field], field + '不能回滚或重发奖励');
  const disk = JSON.parse(env.context.localStorage.getItem(G.data.balance.saveKey)); assert.equal(disk.residents.lily.roomId, target);
  assert.ok(G.sys.residentLife.snapshot().some(actor => actor.id === 'lily' && actor.homeRoomId === target));
  const publicState = G.publicHouse.project(G.state, { title: '重新安置的小屋' }); assert.ok(publicState.residents.some(resident => resident.id === 'lily' && resident.roomId === G.contentSpaces.get(target).spaceId));
  const calls = env.writes(); assert.equal(G.sys.residents.relocate('lily', target).ok, false); assert.equal(env.writes(), calls, '重复点击不再写入或发入住礼物');
});

test('持久拒写不发布新地址、不发安置事件，保留整份存档可重试', () => {
  const env = harness(); env.split(); const target = env.G.sys.residents.relocation('lily').roomIds[0], before = JSON.stringify(env.G.state), writes = env.writes();
  env.fail(true); assert.equal(env.G.sys.residents.relocate('lily', target).ok, false);
  assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes); assert.equal(env.events.length, 0); assert.equal(env.G.sys.residents.relocation('lily').needed, true);
  env.fail(false); assert.equal(env.G.sys.residents.relocate('lily', target).ok, true);
});

test('未知空间/无床卧室/满员/未入住朋友都拒绝，不写状态或普通库存', () => {
  const env = harness(); env.split(); const { G } = env, target = G.sys.residents.relocation('lily').roomIds[0], empty = G.contentSpaces.list().find(room => room.id !== target).id;
  let before = JSON.stringify(G.state), writes = env.writes();
  for (const [id, room] of [['lily', 'missing'], ['lily', empty], ['unknown', target], ['pudding', target]]) assert.equal(G.sys.residents.relocate(id, room).ok, false);
  assert.equal(JSON.stringify(G.state), before); assert.equal(env.writes(), writes);
  // 读取有效历史住户凭据构造已满卧室，仍由真实store校验其两人容量。
  G.store.update(state => {
    for (const id of ['bobo', 'doudou']) state.residents[id] = Object.assign({}, plain(state.residents.lily), {
      roomId: target, affection: 0, wish: null, wishLastClaimedDate: '', friendshipClaims: [], bestFriendBadge: false
    });
  });
  before = JSON.stringify(G.state); writes = env.writes(); const full = G.sys.residents.relocation('lily'); assert.equal(full.needed, true); assert.equal(full.ok, false); assert.equal(full.roomIds.length, 0);
  assert.equal(G.sys.residents.relocate('lily', target).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(env.writes(), writes);
});

test('拆除并重围后可恢复，建筑撤销不回滚居民记录，JSON恢复仍能再次安置', () => {
  const env = harness(); env.split(); const { G } = env, target = G.sys.residents.relocation('lily').roomIds[0]; assert.ok(G.sys.residents.relocate('lily', target).ok);
  const resident = plain(G.state.residents.lily), wallet = plain(G.state.wallet);
  // 模拟编辑器只恢复建筑文档的undo；安置是独立显式行为，不把全状态回滚。
  G.store.update(state => { state.building = env.schema.validateDocument(env.original, G.data.furnitureById); }, { persist: true });
  assert.deepEqual(plain(G.state.residents.lily), resident); assert.deepEqual(plain(G.state.wallet), wallet); assert.equal(G.sys.residents.relocation('lily').needed, true);
  assert.ok(G.sys.residents.relocate('lily', env.home).ok);
  const wall = G.state.building.walls[0];
  G.store.update(state => { state.building = env.schema.executeCommand(state.building, { type: 'entity.remove', id: wall.id }, G.data.furnitureById); }, { persist: true });
  assert.equal(G.sys.residents.relocation('lily').ok, false);
  G.store.update(state => { state.building = env.schema.executeCommand(state.building, { type: 'wall.add', wall: { ...plain(wall), id: 'rebuilt_wall' } }, G.data.furnitureById); }, { persist: true });
  assert.equal(G.sys.residents.relocation('lily').needed, false, '相同围合几何重建可恢复原空间身份');
  const restored = G.store.validate(JSON.parse(JSON.stringify(G.state))); G.store.replace(restored); assert.ok(G.sys.residentLife.snapshot().some(actor => actor.id === 'lily')); unchangedExceptAddress(resident, G.state.residents.lily);
});

test('原居民面板给出真实卧室安置入口，成功更新；旧控件跨换档拒绝写入', () => {
  const env = harness(); env.split(); env.render();
  const picker = env.key('rehouse-room-lily'), accept = env.key('rehouse-lily'); assert.ok(picker && accept); assert.match(env.panel.textContent, /给朋友重新安置/);
  const chosen = picker.value; accept.click(); assert.equal(env.G.state.residents.lily.roomId, chosen); assert.equal(env.outcomes.at(-1).ok, true); assert.equal(env.key('rehouse-lily'), undefined);
  env.G.store.update(state => { state.building = env.schema.validateDocument(env.original, env.G.data.furnitureById); }, { persist: true }); env.render(); const stale = env.key('rehouse-lily'); assert.ok(stale);
  env.G.store.replace(env.G.store.defaultState()); const before = JSON.stringify(env.G.state), writes = env.writes(); stale.click(); accept.click(); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
});

test('没有合格卧室时原面板提示准备房间，入口只导航、不自动改建或扣款', () => {
  const env = harness(); const wall = env.G.state.building.walls[0];
  env.G.store.update(state => { state.building = env.schema.executeCommand(state.building, { type: 'entity.remove', id: wall.id }, env.G.data.furnitureById); }, { persist: true }); env.render();
  assert.equal(env.key('rehouse-lily'), undefined); const button = env.key('rehouse-build-lily'); assert.ok(button);
  const before = JSON.stringify(env.G.state), writes = env.writes(); button.click(); assert.equal(env.navigation.at(-1), 'build'); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.writes(), writes);
});

for (const item of tests) { item.fn(); console.log('✓ ' + item.name); }
console.log(tests.length + ' 组改建后居民重新安置检查通过（真实规则/内存DOM，不替代浏览器）。');
