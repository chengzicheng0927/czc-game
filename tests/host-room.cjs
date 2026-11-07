'use strict';
// 屋主同屋：加入自己的公开小屋、在主场景绘制同屋小朋友、走动与结束清理；只读，不写存档、不发其它请求。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = x => JSON.parse(JSON.stringify(x)), idle = () => new Promise(r => setImmediate(r));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8'));
function sandbox(options = {}) {
  const calls = [], listeners = []; let state = { phase: 'idle', authenticated: true, houseId: null, peerId: null, peers: [], messages: [], error: '' };
  const emit = () => listeners.slice().forEach(fn => fn(plain(state)));
  const self = { id: 'me', displayName: '小主人', avatar: { hair: 'bob' }, isHost: true, zone: 'yard', x: .5, y: .5, updatedAt: 1 };
  const live = { status: () => plain(state), subscribe(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    async quickJoin(id) { calls.push(['quickJoin', id]); if (options.fail) return { ok: false, message: '没能进入' }; state = { ...state, phase: 'connected', houseId: id, peerId: 'me', peers: [self] }; emit(); return { ok: true }; },
    move(zone, x, y) { calls.push(['move', zone, x, y]); return { ok: true }; }, leave() { calls.push(['leave']); state = { ...state, phase: 'left', peerId: null, peers: [] }; emit(); return Promise.resolve({ ok: true }); } };
  const body = { children: [], append(...n) { n.forEach(x => { x.parent = body; body.children.push(x); }); } };
  class Node { constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.textContent = ''; this.attributes = {}; } setAttribute(k, v) { this.attributes[k] = v; } append(...n) { n.forEach(x => { x.parent = this; this.children.push(x); }); } remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; } }
  const document = { createElement: tag => new Node(tag), body };
  const toasts = [], scenePackets = []; let redraws = 0, mounted = 0, destroyed = 0, peers = [];
  const context = vm.createContext({ document, console, Math, Map, Set, Array, Number, String, Promise, Date }); context.window = context;
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const core = new Set(['js/core/namespace.js', 'js/building/schema.js', 'js/core/content-spaces.js', 'js/core/live-space.js']);
  manifest.filter(file => core.has(file) || file.startsWith('js/data/')).forEach(run);
  for (const file of core) assert.ok(manifest.includes(file), '实际清单缺少：' + file);
  const G = context.Game, schema = context.CottageBuilding;
  let building = schema.createEmptyDocument();
  const vertices = [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
  vertices.forEach((start, index) => { building = schema.executeCommand(building, { type: 'wall.add', wall: { id: 'host_wall_' + index, floorId: 'floor_0', start, end: vertices[(index + 1) % 4], height: 2.8, thickness: .16, color: '#F4DDE7' } }); });
  G.state = { building, house: { name: '自己的小屋' }, wallet: { coin: 123 } };
  const ownJson = JSON.stringify(G.state), roomId = G.contentSpaces.list(G.state)[0].id;
  G.runtime.activeRoomId = options.room ? roomId : null;
  G.live = live; G.ui = { toast: t => toasts.push(t), liveRoom: { mount(slot, opts) { mounted++; G.mountOptions = opts; return { destroy() { destroyed++; } }; } } };
  G.neighbors = { ownId: () => options.noHouse ? '' : '11111111-1111-4111-8111-111111111111' };
  G.render = { redraw() { redraws++; }, getHouseView: () => ({ floor: 'floor_0', view: 'cutaway' }) };
  // 此处只观察UI交给当前场景的真实数据；人物几何/气泡像素由Babylon浏览器验收。
  G.livePeers = { set(next, selfId, messages) { peers = plain(next); scenePackets.push({ peers, selfId, messages: plain(messages) }); }, clear() { peers = []; }, count: () => peers.length };
  G.store = { update() { throw new Error('同屋不能写存档'); } };
  run('js/ui/host-room.js');
  return { G, calls, state: () => state, emit, toasts, scenePackets, ownJson, roomId, panels: () => body.children, counts: () => ({ redraws, mounted, destroyed }), setState(s) { state = { ...state, ...s }; emit(); } };
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });
test('没有公开小屋或没有联机组件时不能进入，也不发请求', async () => {
  const b = sandbox({ noHouse: true }); const r = await b.G.hostRoom.enter(); assert.equal(r.ok, false); assert.equal(b.calls.length, 0); assert.equal(b.G.hostRoom.active(), false); assert.equal(b.G.hostRoom.walkTo({ x: 0, y: 0 }), false);
});
test('进入：用自己的公开小屋快捷加入，挂载同屋面板，并站到正在看的房间', async () => {
  const b = sandbox({ room: 'room_a' }); assert.equal((await b.G.hostRoom.enter()).ok, true);
  assert.deepEqual(b.calls.slice(0, 2), [['quickJoin', '11111111-1111-4111-8111-111111111111'], ['move', 'floor_0', .5, .5]]); assert.equal(b.G.hostRoom.active(), true); assert.equal(b.panels().length, 1); assert.equal(b.counts().mounted, 1);
  assert.equal((await b.G.hostRoom.enter()).ok, true); assert.equal(b.counts().mounted, 1, '重复进入不重复挂载'); assert.equal(b.G.livePeers.count(), 1);
});
test('失败时提示并清理，不留下面板或订阅', async () => {
  const b = sandbox({ fail: true }); assert.equal((await b.G.hostRoom.enter()).ok, false); assert.deepEqual(b.toasts, ['没能进入']); assert.equal(b.panels().length, 0); assert.equal(b.G.hostRoom.active(), false);
});
test('同屋人物与气泡原样交给当前场景，真实楼层坐标可反向还原且不改私档', async () => {
  const b = sandbox(); await b.G.hostRoom.enter(); const same = { hair: 'bob' };
  const next = { peers: [{ id: 'me', displayName: '小主人', avatar: same, isHost: true, zone: 'floor_0', x: .5, y: .5 }, { id: 'kid', displayName: '小云', avatar: same, isHost: false, zone: 'yard', x: .2, y: .5 }], messages: [{ id: 'm1', seq: 1, peerId: 'kid', displayName: '小云', text: '你的小屋真好看！', at: 1 }] };
  const before = JSON.stringify(next); b.setState(next);
  const packet = b.scenePackets.at(-1); assert.deepEqual(packet.peers, next.peers); assert.equal(packet.selfId, 'me'); assert.deepEqual(packet.messages, next.messages);
  assert.deepEqual(plain(b.G.liveSpace.position(b.G.state, packet.peers[0])), { x: 0, y: 0, z: 0, floorId: 'floor_0' });
  assert.equal(JSON.stringify(next), before); assert.equal(JSON.stringify(b.G.state), b.ownJson);
});
test('走动：只有同屋会话中才接管点击；点地面走过去，方向键步进；点击空处不处理', async () => {
  const b = sandbox(); assert.equal(b.G.hostRoom.walkTo({ x: 0, z: 3 }), false); await b.G.hostRoom.enter();
  assert.equal(b.G.hostRoom.walkTo({ x: 0, z: 3 }), true); const move = b.calls.filter(c => c[0] === 'move').at(-1); assert.equal(move[1], 'yard'); assert.ok(move[2] >= 0 && move[2] <= 1);
  assert.equal(b.G.hostRoom.walkTo({ x: 9999, z: 9999 }), false);
  b.G.mountOptions.onMove('left'); const step = b.calls.filter(c => c[0] === 'move').at(-1); const point = b.G.liveSpace.position(b.G.state, { zone: step[1], x: step[2], y: step[3] }); assert.ok(Math.abs(point.x + .8) < 1e-9 && Math.abs(point.z) < 1e-9); assert.equal(JSON.stringify(b.G.state), b.ownJson);
  b.setState({ phase: 'reconnecting' }); const before = b.calls.length; b.G.mountOptions.onMove('up'); assert.equal(b.calls.length, before, '重连中不走动');
});
test('结束：离开后面板、订阅与画面全部清理，之后点击恢复原样；联机出错也会收尾并提示', async () => {
  let b = sandbox(); await b.G.hostRoom.enter(); b.G.hostRoom.leave(); await idle();
  assert.equal(b.G.hostRoom.active(), false); assert.equal(b.panels().length, 0); assert.equal(b.G.livePeers.count(), 0); assert.equal(b.counts().destroyed, 1); assert.equal(b.G.hostRoom.walkTo({ x: 0, y: 100 }), false);
  b = sandbox(); await b.G.hostRoom.enter(); b.setState({ phase: 'error', peerId: null, error: '串门连接已结束' }); assert.equal(b.G.hostRoom.active(), false); assert.deepEqual(b.toasts, ['串门连接已结束']); assert.equal(b.panels().length, 0);
});
(async () => { for (const t of tests) { await t.fn(); console.log('✓ ' + t.name); } console.log(tests.length + ' 组屋主同屋检查通过（不写存档，无监听）'); })().catch(e => { console.error(e); process.exit(1); });
