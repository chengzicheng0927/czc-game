'use strict';
// 主场景串门的渲染侧：G.render.visit.set(visitState|null)、renderState、peers/自己、点击与写保护、离开复位。
// 使用内存Game、真实WebGL引擎和有状态GL替身；G.visitSession/G.hostRoom/G.live 为桩。不证明实际像素，不代替浏览器目视。
const assert = require('node:assert/strict');
const { setup, near, vector } = require('./fixtures/scene-harness.cjs');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const plain = value => JSON.parse(JSON.stringify(value));
// Game 在 vm 上下文里创建，数组/对象原型与宿主不同；先转成纯 JSON 再比较。
const same = (actual, expected, message) => assert.deepStrictEqual(plain(actual), plain(expected), message);
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.keys(value).forEach(key => deepFreeze(value[key])); Object.freeze(value); } return value; }

// 另一座小屋：只有一层，没有第二层的房间；名字、小人都不同。
function otherHouse(env, patch) {
  const s = plain(env.G.state);
  s.house.name = '别人的小屋'; s.house.floors = [s.house.floors[0]]; delete s.house.rooms[env.upper];
  s.avatar = Object.assign({}, env.G.data.defaultAvatar(), { hair: 'bob' });
  if (patch) patch(s);
  return deepFreeze(s);
}
// 用 live 快照桩驱动 scene 里的 liveSnapshot（scene 在 init 时订阅 G.live）。
function liveStub() {
  const listeners = []; let snapshot = null;
  return { status: () => snapshot, subscribe(fn) { listeners.push(fn); return () => {}; }, emit(next) { snapshot = next; listeners.forEach(fn => fn(next)); } };
}
function peerList(G) {
  const avatar = G.data.defaultAvatar();
  return [{ id: 'me', zone: 'yard', x: .5, y: .5, avatar, displayName: '我' }, { id: 'p2', zone: 'yard', x: .2, y: .6, avatar, displayName: '小花' }];
}
function start(options) {
  const live = liveStub(), env = setup(Object.assign({ beforeInit(G) { G.live = live; } }, options || {}));
  env.live = live; env.hosting = false; env.walks = []; env.hostWalks = [];
  env.G.hostRoom = { active: () => env.hosting, walkTo: point => { env.hostWalks.push(point); return false; }, leave() {} };
  env.G.visitSession = { walkTo: point => { env.walks.push(point); return true; } };
  return env;
}
const actors = (env, kind) => env.world.actors.filter(actor => actor.kind === kind);
// 在画面里找一个不属于家具/标签/居民的“地面”点：只要 pick 结果不是被忽略类型。
function groundPoint(env) {
  for (let y = 200; y < 560; y += 12) for (let x = 100; x < 700; x += 12) {
    const hit = env.G.render.camera.screenToWorld(x, y);
    if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y) && !hit.outsideViewport && ['room', 'empty'].includes(hit.target?.kind)) return { x, y };
  }
  return null;
}
function click(env, point) { env.event('pointerdown', point); env.event('pointerup', point); }

test('set(state)：渲染读 visitState，G.state 引用与内容不变；楼层/房间来自 visitState；本地玩家与向导隐藏、自己的花园/邻居/小访客不进画面', () => {
  const env = start();
  try {
    const G = env.G, own = G.state, before = JSON.stringify(own), vs = otherHouse(env); env.redraw();
    const ownFloors = String(own.house.floors.length); assert.notEqual(ownFloors, '1'); assert.equal(env.main.dataset.houseFloors, ownFloors); assert.ok(actors(env, 'player').length === 1);
    assert.equal(G.render.visit.active(), false);
    G.render.visit.set(vs); env.redraw();
    assert.equal(G.render.visit.active(), true);
    assert.equal(env.world.env.state, vs, 'env.state 就是 visitState'); assert.equal(G.state, own, 'G.state 引用不变'); assert.equal(JSON.stringify(G.state), before, 'G.state 内容不变');
    assert.equal(env.main.dataset.houseFloors, '1', '楼层数来自 visitState');
    const ids = env.world.env.rooms.filter(r => r.id).map(r => r.id); same(ids, [env.first], 'rooms() 来自 visitState，没有自己家的二层房间');
    assert.equal(env.world.env.hidePlayer, true); assert.equal(env.world.env.visiting, true);
    assert.equal(actors(env, 'player').length, 0, '本地玩家被隐藏'); assert.equal(actors(env, 'resident').length, 0, '向导兔不出现在别人家');
    assert.equal(env.world.env.visitor, null); same(env.world.env.neighbors, []);
    assert.ok(env.world.env.gardenStatuses.every(s => Object.keys(s).length === 0), '花圃不显示自己的作物进度');
    assert.ok(!env.world.labels.some(l => ['room-label', 'room-enter', 'empty'].includes(l.kind)), '别人的房间不挂建造/换位/进入房间标签');
    assert.equal(env.world.env.stage, null); assert.equal(env.world.env.gardenPage, null);
    G.render.visit.set(null); env.redraw();
    assert.equal(G.render.visit.active(), false); assert.equal(env.world.env.state, own); assert.equal(env.main.dataset.houseFloors, ownFloors);
    assert.equal(actors(env, 'player').length, 1); assert.equal(env.world.env.hidePlayer, false);
  } finally { env.destroy(); }
});

test('peers：live 画同屋的人并只画自己这个 peer；路过不画任何人；屋主接待行为不变；断线阶段不画', () => {
  const env = start();
  try {
    const G = env.G, vs = otherHouse(env), peers = peerList(G), snapshot = phase => ({ phase, peerId: 'me', peers });
    env.live.emit(snapshot('connected')); env.redraw();
    same(env.world.env.peers, [], '没有接待也没有串门：不画 peers'); assert.equal(actors(env, 'player').length, 1);
    env.hosting = true; env.redraw(); // 屋主接待：既有行为，peers 进 env，自己的 peer 取代本地玩家
    assert.equal(env.world.env.peers.length, 2); assert.equal(env.world.env.selfId, 'me'); assert.equal(actors(env, 'peer').length, 2); assert.equal(actors(env, 'player').length, 0);
    env.hosting = false;
    G.runtime.visit = { active: true, houseId: 'h', mode: 'passerby', selfPeerId: null, state: vs };
    G.render.visit.set(vs); env.redraw();
    same(env.world.env.peers, [], '路过不画 peers'); assert.equal(actors(env, 'peer').length, 0); assert.equal(actors(env, 'player').length, 0, '路过也不画自己');
    env.hosting = true; env.redraw(); same(env.world.env.peers, [], '串门期间以串门模式为准，不被屋主接待的状态混入'); env.hosting = false;
    G.runtime.visit.mode = 'live'; G.runtime.visit.selfPeerId = 'me'; env.redraw();
    assert.equal(env.world.env.peers.length, 2); assert.equal(env.world.env.selfId, 'me'); assert.equal(actors(env, 'peer').length, 2, '自己的 peer 与同屋的人都画'); assert.equal(actors(env, 'peer').filter(a => a.id === 'me').length, 1);
    assert.equal(actors(env, 'player').length, 0, '本地玩家仍隐藏'); assert.equal(env.world.env.hidePlayer, true);
    env.live.emit(snapshot('reconnecting')); env.redraw(); assert.equal(env.world.env.peers.length, 2, '重连中仍画');
    env.live.emit(snapshot('idle')); env.redraw(); same(env.world.env.peers, [], '断开后不画');
    env.live.emit(snapshot('connected'));
    G.render.visit.set(null); G.runtime.visit = null; env.redraw();
    same(env.world.env.peers, []); assert.equal(actors(env, 'player').length, 1);
  } finally { env.destroy(); }
});

test('点击：串门期间编辑类点击无效，点地面走动转给 walkTo，相机操作照常，全程不写存档', () => {
  const env = start();
  try {
    const G = env.G; G.render.setHouseView({ floor: 1 }); env.redraw(); // 聚焦一层，挂画才不被遮挡
    const events = []; ['scene:item', 'scene:room', 'scene:empty', 'scene:room-layout', 'scene:garden', 'scene:resident', 'scene:player', 'scene:neighbor', 'scene:observatory', 'yard:selected'].forEach(name => G.bus.on(name, () => events.push(name)));
    click(env, env.framePoint()); same(plain(G.runtime.selected), { roomId: env.first, uid: env.uid }, '基线：自己家点家具会选中'); G.runtime.selected = null; events.length = 0;
    const vs = otherHouse(env); G.runtime.visit = { active: true, mode: 'live', selfPeerId: 'me', state: vs }; G.render.visit.set(vs); G.render.setHouseView({ floor: 1 }); env.redraw();
    const before = env.snapshot(), own = JSON.stringify(G.state);
    click(env, env.framePoint()); assert.equal(G.runtime.selected, null, '不选中别人的家具'); assert.equal(env.walks.length, 0, '点家具不当作走动');
    same(events, [], '没有任何编辑类总线事件');
    const ground = groundPoint(env); assert.ok(ground, '找到一个地面点');
    click(env, ground); assert.equal(env.walks.length, 1, '点地面转给 visitSession.walkTo'); assert.ok(Number.isFinite(env.walks[0].x) && Number.isFinite(env.walks[0].y)); same(events, [], '走动不触发选房间/待建事件');
    env.G.visitSession.walkTo = () => false; click(env, ground); assert.equal(env.hostWalks.length, 1, 'walkTo 返回假时再试 hostRoom.walkTo'); same(events, []);
    // 拖家具：只当作拖动相机，不改任何家具。
    const f = env.framePoint(), pan0 = Array.from(env.world.panVector || [0, 0, 0]);
    env.event('pointerdown', f); env.event('pointermove', { x: f.x + 40, y: f.y + 25 }); env.event('pointerup', { x: f.x + 40, y: f.y + 25 }); env.redraw();
    assert.notDeepEqual(Array.from(env.world.panVector), pan0, '拖动＝平移相机'); assert.equal(G.runtime.selected, null);
    // HTML 拖放摆放被拒绝。
    const drop = env.main.dispatch('drop', { clientX: f.x, clientY: f.y, dataTransfer: { getData: () => 'frame_basic' } }); assert.ok(drop.prevented);
    assert.equal(G.render.beginPlacement('frame_basic', env.first).ok, false, '串门中不能开始摆放'); assert.equal(G.runtime.placing, null);
    // 相机操作照常：缩放、旋转、整屋/楼层聚焦。
    const range = env.world.range; G.render.camera.zoom(1.5); env.redraw(); assert.notEqual(env.world.range, range, '缩放可用');
    const angle = env.world.angle; G.render.camera.rotate(40, 10); env.redraw(); assert.notEqual(env.world.angle, angle, '旋转可用');
    G.render.setHouseView({ floor: 1 }); env.redraw(); assert.equal(G.render.camera.focusKind, 'floor'); G.render.camera.fit(); G.render.setHouseView({ floor: 'all' }); env.redraw(); assert.equal(G.render.camera.focusKind, 'overview');
    assert.equal(env.snapshot().writes, before.writes, '串门期间不调用 store.update'); assert.equal(JSON.stringify(G.state), own); assert.equal(events.length, 0);
  } finally { env.destroy(); }
});

test('写保护与按键：串门时摆放/拍照被拒、方向键不移动本地玩家，离开后恢复', () => {
  const env = start();
  try {
    const G = env.G, vs = otherHouse(env); env.redraw();
    G.runtime.player.zone = env.first; G.runtime.player.walking = false;
    G.runtime.visit = { active: true, mode: 'passerby', state: vs }; G.render.visit.set(vs); env.redraw();
    const writes = env.snapshot().writes, own = JSON.stringify(G.state);
    assert.throws(() => G.render.captureScene({ scope: 'house' }), /串门/, '串门时拍照被禁用');
    // 方向键：本地玩家的 player-movement 在串门时不响应（live 的方向键由 live-room 控制自己的 peer）。
    const win = G.constructor.constructor('return window')(), arrow = key => win.dispatch('keydown', { key });
    arrow('ArrowUp'); assert.equal(G.runtime.player.zone, env.first, '串门时按方向键不把本地玩家带去院子'); win.dispatch('keyup', { key: 'ArrowUp' });
    G.render.visit.set(null); G.runtime.visit = null; env.redraw();
    assert.equal(env.snapshot().writes, writes); assert.equal(JSON.stringify(G.state), own);
    arrow('ArrowUp'); assert.equal(G.runtime.player.zone, 'yard', '回家后方向键恢复'); win.dispatch('keyup', { key: 'ArrowUp' }); G.playerMovement.resetKeys(); env.redraw(); // 排空 player-movement 的动画帧
    assert.ok(G.render.captureScene({ scope: 'house' }).width > 0, '回家后可拍照');
  } finally { env.destroy(); }
});

test('快照刷新：再次 set 保持相机与视角，只有聚焦的房间被拆掉才复位；总线 state:change/replace 不弄乱画面', () => {
  const env = start();
  try {
    const G = env.G, c = G.render.camera, w = env.world, vs = otherHouse(env); env.redraw();
    G.runtime.visit = { active: true, mode: 'passerby', state: vs }; G.render.visit.set(vs); env.redraw();
    assert.equal(c.focusKind, 'overview'); c.setInteractionMode('orbit'); c.rotate(70, 20); c.pan(25, -10); c.zoom(1.3); env.redraw();
    const keep = { angle: w.angle, elevation: w.elevation, pan: Array.from(w.panVector), range: w.range, scale: c.scale, x: c.x, y: c.y, focusKind: c.focusKind };
    const next = otherHouse(env, s => { s.house.name = '改名后的小屋'; });
    G.render.visit.set(next); env.redraw();
    assert.equal(w.env.state, next, '用新 state 重画'); assert.equal(w.env.state.house.name, '改名后的小屋');
    near(w.angle, keep.angle, 1e-12); near(w.elevation, keep.elevation, 1e-12); vector(Array.from(w.panVector), keep.pan, 1e-12); near(w.range, keep.range, 1e-9); near(c.scale, keep.scale, 1e-9); assert.equal(c.focusKind, keep.focusKind);
    G.bus.emit('state:change', {}); G.bus.emit('state:replace', {}); env.redraw();
    assert.equal(G.render.visit.active(), true); assert.equal(w.env.state, next); near(w.angle, keep.angle, 1e-12); vector(Array.from(w.panVector), keep.pan, 1e-12); near(c.scale, keep.scale, 1e-9);
    // 正聚焦的房间被拆掉：复位到整屋，不残留 activeRoomId。
    c.focusRoom(env.first); runtime(G).activeRoomId = env.first; env.redraw(); assert.equal(c.focusKind, 'room');
    const removed = otherHouse(env, s => { s.house.floors[0].slots = s.house.floors[0].slots.map(id => id === env.first ? null : id); delete s.house.rooms[env.first]; });
    G.render.visit.set(removed); env.redraw();
    assert.equal(c.focusKind, 'overview'); assert.equal(runtime(G).activeRoomId, null); same(plain(G.render.getHouseView()), { floor: 'all', view: 'cutaway', previewFourFloors: false });
  } finally { env.destroy(); }
});
function runtime(G) { return G.runtime; }

test('离开：set(null) 回到干净的自己家园视图（楼层 all、相机默认、无残留选中/摆放/房间），幂等', () => {
  const env = start();
  try {
    const G = env.G, c = G.render.camera, w = env.world, vs = otherHouse(env), own = JSON.stringify(G.state); c.goHome(); env.redraw();
    const home = { scale: c.scale, x: c.x, y: c.y, range: w.range };
    G.runtime.visit = { active: true, mode: 'live', selfPeerId: 'me', state: vs }; G.render.visit.set(vs); env.redraw();
    G.render.setHouseView({ floor: 1 }); c.focusRoom(env.first); G.runtime.activeRoomId = env.first; G.runtime.selected = { roomId: env.first, uid: env.uid }; c.setInteractionMode('orbit'); c.rotate(90, 30); c.pan(30, 20); c.zoom(1.6); env.redraw();
    G.runtime.visit = null; G.render.visit.set(null); env.redraw();
    assert.equal(w.env.state, G.state); assert.equal(JSON.stringify(G.state), own);
    same(plain(G.render.getHouseView()), { floor: 'all', view: 'cutaway', previewFourFloors: false }); assert.equal(c.focusKind, 'overview'); assert.equal(c.getInteractionMode(), 'pan');
    assert.equal(G.runtime.activeRoomId, null); assert.equal(G.runtime.selected, null); assert.equal(G.runtime.placing, null);
    near(w.angle, .43, 1e-12); near(w.elevation, .49, 1e-12); vector(Array.from(w.panVector), [0, 0, 0], 1e-12);
    near(c.scale, home.scale, 1e-9); near(c.x, home.x, 1e-9); near(c.y, home.y, 1e-9); near(w.range, home.range, 1e-9);
    assert.equal(env.main.dataset.houseFloors, String(G.state.house.floors.length)); assert.equal(actors(env, 'player').length, 1); assert.equal(env.world.env.hidePlayer, false);
    assert.ok(w.labels.some(l => l.kind === 'room-label'), '自己的小屋恢复房间标签');
    G.render.visit.set(null); env.redraw(); near(c.scale, home.scale, 1e-9); // 幂等
    G.render.setHouseView({ floor: 1 }); env.redraw(); click(env, env.framePoint()); same(plain(G.runtime.selected), { roomId: env.first, uid: env.uid }, '回家后编辑点击恢复');
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组主场景串门渲染检查通过（GL状态替身、会话/接待/live 为桩，不代替浏览器目视）。');
