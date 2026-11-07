'use strict';
// 屋主同屋：加入自己的公开小屋、在主场景绘制同屋小朋友、走动与结束清理；只读，不写存档、不发其它请求。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = x => JSON.parse(JSON.stringify(x)), idle = () => new Promise(r => setImmediate(r));
const house = { floors: [{ slots: ['room_a', null, null] }], rooms: { room_a: { type: 'bedroom' } } };
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
  const drawn = [], texts = [], avatarCalls = [], toasts = []; let redraws = 0, mounted = 0, destroyed = 0;
  const G = { live, ui: { toast: t => toasts.push(t), liveRoom: { mount(slot, opts) { mounted++; G.mountOptions = opts; return { destroy() { destroyed++; } }; } } }, runtime: { activeRoomId: options.room || null }, state: { house, store: null }, neighbors: { ownId: () => options.noHouse ? '' : '11111111-1111-4111-8111-111111111111' }, render: { redraw() { redraws++; } }, draw: { avatar: (c, avatar, x, y, scale, o) => avatarCalls.push({ avatar, x, y, scale, o }) }, store: { update() { throw new Error('同屋不能写存档'); } } };
  const context = vm.createContext({ window: { Game: G }, document, console, Math, Map, Set, Array, Number, String, Promise, Date });
  for (const file of ['js/render/live-avatars.js', 'js/render/live-peers.js', 'js/ui/host-room.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const canvas = new Proxy({}, { get: (_, name) => name === 'measureText' ? () => ({ width: 40 }) : (...a) => { drawn.push(name); if (name === 'fillText') texts.push(String(a[0])); } , set: () => true });
  return { G, calls, state: () => state, emit, toasts, avatarCalls, drawn, texts, canvas, panels: () => body.children, counts: () => ({ redraws, mounted, destroyed }), setState(s) { state = { ...state, ...s }; emit(); } };
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });
test('没有公开小屋或没有联机组件时不能进入，也不发请求', async () => {
  const b = sandbox({ noHouse: true }); const r = await b.G.hostRoom.enter(); assert.equal(r.ok, false); assert.equal(b.calls.length, 0); assert.equal(b.G.hostRoom.active(), false); assert.equal(b.G.hostRoom.walkTo({ x: 0, y: 0 }), false);
});
test('进入：用自己的公开小屋快捷加入，挂载同屋面板，并站到正在看的房间', async () => {
  const b = sandbox({ room: 'room_a' }); assert.equal((await b.G.hostRoom.enter()).ok, true);
  assert.deepEqual(b.calls.slice(0, 2), [['quickJoin', '11111111-1111-4111-8111-111111111111'], ['move', 'room_a', .5, .5]]); assert.equal(b.G.hostRoom.active(), true); assert.equal(b.panels().length, 1); assert.equal(b.counts().mounted, 1);
  assert.equal((await b.G.hostRoom.enter()).ok, true); assert.equal(b.counts().mounted, 1, '重复进入不重复挂载'); assert.equal(b.G.livePeers.count(), 1);
});
test('失败时提示并清理，不留下面板或订阅', async () => {
  const b = sandbox({ fail: true }); assert.equal((await b.G.hostRoom.enter()).ok, false); assert.deepEqual(b.toasts, ['没能进入']); assert.equal(b.panels().length, 0); assert.equal(b.G.hostRoom.active(), false);
});
test('主场景绘制同屋的人：自己和朋友都画，撞脸加彩环，名牌带“我/主人”，位置落在房间内，头顶显示发言气泡', async () => {
  const b = sandbox(); await b.G.hostRoom.enter(); const same = { hair: 'bob' };
  b.setState({ peers: [{ id: 'me', displayName: '小主人', avatar: same, isHost: true, zone: 'room_a', x: .5, y: .5 }, { id: 'kid', displayName: '小云', avatar: same, isHost: false, zone: 'yard', x: .2, y: .5 }], messages: [{ id: 'm1', seq: 1, peerId: 'kid', displayName: '小云', text: '你的小屋真好看！', at: 1 }] });
  b.G.livePeers.draw(b.canvas, { time: 1, delta: .05, reducedMotion: false, scale: .5, house }); assert.equal(b.avatarCalls.length, 2);
  assert.ok(b.drawn.filter(x => x === 'ellipse').length >= 2, '两人形象相同，各自一圈彩环'); const room = b.avatarCalls.find(c => c.y < 0); assert.ok(room, '房间里的人画在房子范围内');
  assert.ok(b.texts.includes('你的小屋真好看！'), '主游戏页同屋人物头顶显示聊天气泡');
  assert.equal(b.G.livePeers.bubbleOf('kid'), '你的小屋真好看！');
  b.G. World3D = function () { this.env = { width: 800, height: 600, offsetX: 0, offsetY: 0 }; this.actors = [{ kind: 'peer', id: 'kid', p: [0, 0, 0] }]; };
  b.G.World3D.prototype.project = () => ({ x: 400, y: 260 });
  b.G.World3D.prototype.drawLabels = function () {};
  b.setState({ messages: [{ id: 'm2', seq: 2, peerId: 'kid', displayName: '小云', text: '3D头顶也看得到！', at: 2 }] });
  b.texts.length = 0; new b.G.World3D().drawLabels(b.canvas);
  assert.ok(b.texts.includes('3D头顶也看得到！'), '3D主场景标签层同样绘制同屋头顶气泡');
  b.G.livePeers.draw(b.canvas, { time: 1, delta: .05, reducedMotion: true, scale: .5, house }); assert.equal(b.avatarCalls.length, 4);
  b.G.livePeers.draw(b.canvas, { time: 1, delta: .05, scale: .5, house: null }); assert.equal(b.avatarCalls.length, 4, '没有房屋资料时不画');
});
test('走动：只有同屋会话中才接管点击；点地面走过去，方向键步进；点击空处不处理', async () => {
  const b = sandbox(); assert.equal(b.G.hostRoom.walkTo({ x: 0, y: 100 }), false); await b.G.hostRoom.enter();
  assert.equal(b.G.hostRoom.walkTo({ x: 0, y: 100 }), true); const move = b.calls.filter(c => c[0] === 'move').at(-1); assert.equal(move[1], 'yard'); assert.ok(move[2] >= 0 && move[2] <= 1);
  assert.equal(b.G.hostRoom.walkTo({ x: 9999, y: 9999 }), false);
  b.G.mountOptions.onMove('left'); const step = b.calls.filter(c => c[0] === 'move').at(-1); assert.ok(Math.abs(step[2] - .42) < 1e-9);
  b.setState({ phase: 'reconnecting' }); const before = b.calls.length; b.G.mountOptions.onMove('up'); assert.equal(b.calls.length, before, '重连中不走动');
});
test('结束：离开后面板、订阅与画面全部清理，之后点击恢复原样；联机出错也会收尾并提示', async () => {
  let b = sandbox(); await b.G.hostRoom.enter(); b.G.hostRoom.leave(); await idle();
  assert.equal(b.G.hostRoom.active(), false); assert.equal(b.panels().length, 0); assert.equal(b.G.livePeers.count(), 0); assert.equal(b.counts().destroyed, 1); assert.equal(b.G.hostRoom.walkTo({ x: 0, y: 100 }), false);
  b = sandbox(); await b.G.hostRoom.enter(); b.setState({ phase: 'error', peerId: null, error: '串门连接已结束' }); assert.equal(b.G.hostRoom.active(), false); assert.deepEqual(b.toasts, ['串门连接已结束']); assert.equal(b.panels().length, 0);
});
(async () => { for (const t of tests) { await t.fn(); console.log('✓ ' + t.name); } console.log(tests.length + ' 组屋主同屋检查通过（不写存档，无监听）'); })().catch(e => { console.error(e); process.exit(1); });
