'use strict';
// 真实坐标、裁剪和人物合成模块；不监听HTTP，不访问主人状态或浏览器存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/render/live-avatars.js'), 'utf8');
const house = Object.freeze({ floors: [{ slots: ['bedroom', null, 'kitchen'] }, { slots: [null, 'study', null] }, { slots: ['music', null, null] }, { slots: [null, null, 'attic_room'] }], rooms: { bedroom: {}, kitchen: {}, study: {}, music: {}, attic_room: {} }, attic: true });
function sandbox(reducedMotion = false) {
  let now = 0, next = 0;
  const scheduled = new Map(), listeners = {}, draws = [], paints = [], texts = [];
  const document = { hidden: false, addEventListener(name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); }, removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(value => value !== fn); } };
  const context2d = { setTransform() {}, clearRect() { paints.push(now); texts.length = 0; }, drawImage() {}, save() {}, restore() {}, beginPath() {}, ellipse() {}, roundRect() {}, rect() {}, fill() {}, stroke() {}, fillText(text) { texts.push(String(text)); }, measureText(text) { return { width: Array.from(text).length * 8 }; } };
  const canvas = { width: 1600, height: 1200, clientWidth: 800, getContext() { return context2d; }, getBoundingClientRect() { return { left: 75, top: 20, width: 400, height: 300 }; } };
  const G = {};
  Object.defineProperty(G, 'state', { get() { throw new Error('live rendering must not access owner state'); } });
  const context = vm.createContext({ Game: G, document, Map, Set, performance: { now: () => now }, matchMedia() { return { matches: reducedMotion, addEventListener() {}, removeEventListener() {} }; } }); context.window = context;
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('live rendering must not access localStorage'); } });
  vm.runInContext(source, context);
  const api = G.liveAvatars;
  function renderer(roomId = null) {
    return api.create({ canvas, background: {}, house, view: api.view(house, roomId, canvas.width, canvas.height), now: () => now, reducedMotion, requestFrame(fn) { const id = ++next; scheduled.set(id, fn); return id; }, cancelFrame(id) { scheduled.delete(id); }, drawAvatar(c, avatar, x, y, scale, options) { draws.push({ avatar, x, y, scale, options, at: now }); } });
  }
  return { api, renderer, canvas, document, scheduled, listeners, draws, paints, texts, tick(milliseconds) { now += milliseconds; const frames = [...scheduled.values()]; scheduled.clear(); for (const frame of frames) frame(now); }, show(hidden) { document.hidden = hidden; for (const fn of listeners.visibilitychange || []) fn(); } };
}
const almost = (a, b) => assert.ok(Math.abs(a - b) < .000001, a + ' != ' + b);
const peer = (id = 'one', patch = {}) => Object.freeze({ id, displayName: '<小星星>', avatar: { hair: 'bob' }, isHost: id === 'one', zone: 'yard', x: .2, y: .5, ...patch });
let groups = 0;
function test(name, fn) { fn(); groups++; console.log('✓ ' + name); }
test('公开楼层/房间位置取自真实slots，空格和未知房间不生成角色', () => {
  const { api } = sandbox(); assert.equal(api.room(house, 'attic_room').x, 160); assert.equal(api.room(house, 'attic_room').y, -880); assert.equal(api.room(house, 'missing'), null); assert.equal(api.position(house, peer('x', { zone: 'missing' })), null);
});
test('前院及五间不同楼层房间的归一化位置能双向还原，包括四角边界', () => {
  const { api } = sandbox();
  for (const zone of ['yard', ...Object.keys(house.rooms)]) for (const x of [0, .15, .5, 1]) for (const y of [0, .3, .8, 1]) {
    const point = api.position(house, { zone, x, y }); const back = api.destination(house, point, zone === 'yard' ? null : zone); assert.equal(back.zone, zone); almost(back.x, x); almost(back.y, y);
  }
});
test('整屋裁剪与房间近景使用同一frame，投影反解不偏移或串到其它房间', () => {
  const { api } = sandbox();
  for (const roomId of [null, 'bedroom', 'study', 'attic_room']) {
    const viewport = api.view(house, roomId, 1600, 1200); assert.ok(viewport.width > 0 && viewport.height > 0); if (roomId) assert.equal(viewport.cropX, 0);
    for (const zone of roomId ? [roomId] : ['yard', ...Object.keys(house.rooms)]) { const original = api.position(house, { zone, x: .75, y: .4 }); const projected = api.project(viewport, original); const recovered = api.unproject(viewport, projected); almost(recovered.x, original.x); almost(recovered.y, original.y); }
  }
});
test('地面之外、非法数字和越界位置不产生移动，选择房间不能点到前院', () => {
  const { api } = sandbox(); assert.equal(api.destination(house, { x: 0, y: -1000 }), null); assert.equal(api.destination(house, { x: 0, y: 150 }, 'study'), null); assert.equal(api.position(house, { zone: 'yard', x: NaN, y: .5 }), null); assert.equal(api.position(house, { zone: 'yard', x: 1.01, y: .5 }), null); assert.equal(api.destination(house, { x: Infinity, y: 50 }), null);
});
test('点击坐标反解包含画布的平移缩放和留白，画布之外不会误走', () => {
  const { api, canvas } = sandbox(); const point = api.clientPoint(canvas, 275, 170); almost(point.x, 800); almost(point.y, 600); assert.equal(api.clientPoint(canvas, 74, 170), null); assert.equal(api.clientPoint(canvas, 600, 200), null);
});
test('真实头像绘制接收公开服装/位置，远端新位置平滑行走到终点且无状态写入', () => {
  const env = sandbox(), renderer = env.renderer('study'), first = peer('one', { zone: 'study', x: .1 }); renderer.update([first], 'one'); const start = env.draws.at(-1).x;
  renderer.update([peer('one', { zone: 'study', x: .9 })], 'one'); env.tick(50); const middle = env.draws.at(-1); assert.ok(middle.x > start); assert.equal(middle.options.still, false); assert.equal(middle.avatar.hair, 'bob');
  env.tick(1600); const end = env.draws.at(-1); assert.ok(end.x > middle.x); assert.equal(end.options.still, true); assert.equal(first.x, .1); assert.equal(env.scheduled.size, 0); renderer.destroy();
});
test('只画当前房间的成员，真实深度排序，离开成员会从重新清空的画面移除', () => {
  const env = sandbox(true), renderer = env.renderer('study'); renderer.update([peer('front', { zone: 'study', y: .8 }), peer('yard'), peer('back', { zone: 'study', y: .1 })], 'front'); assert.deepEqual(env.draws.map(x => x.avatar.hair), ['bob', 'bob']); assert.ok(env.draws[0].y < env.draws[1].y);
  const before = env.draws.length; renderer.update([], 'front'); env.tick(40); assert.equal(env.draws.length, before); assert.ok(env.paints.length >= 2); renderer.destroy();
});
test('八人高频消息也合并到30fps以内，静止时不保留动画循环', () => {
  const env = sandbox(), renderer = env.renderer(); const peers = Array.from({ length: 8 }, (_, i) => peer('p' + i, { x: .1 + i * .1 })); renderer.update(peers, 'p0');
  for (let i = 0; i < 30; i++) renderer.update(peers.map(p => ({ ...p, x: Math.min(.99, p.x + .05) })), 'p0'); assert.equal(env.paints.length, 1); assert.equal(env.scheduled.size, 1); env.tick(16); assert.equal(env.paints.length, 1); env.tick(18); assert.equal(env.paints.length, 2); env.tick(1600); assert.equal(env.scheduled.size, 0); renderer.destroy();
});
test('减少动态直接显示最终位置，不产生连续走动；隐藏页面取消绘制，恢复后只重绘有效成员', () => {
  const still = sandbox(true), stillRenderer = still.renderer(); stillRenderer.update([peer()], 'one'); stillRenderer.update([peer('one', { x: .9 })], 'one'); still.tick(40); assert.equal(still.draws.at(-1).options.still, true); assert.equal(still.scheduled.size, 0); stillRenderer.destroy();
  const env = sandbox(), renderer = env.renderer(); renderer.update([peer()], 'one'); renderer.update([peer('one', { x: .9 })], 'one'); assert.equal(env.scheduled.size, 1); env.show(true); assert.equal(env.scheduled.size, 0); const before = env.paints.length; env.tick(200); renderer.update([peer('two')], 'two'); assert.equal(env.paints.length, before); env.show(false); assert.ok(env.paints.length > before); assert.equal(env.draws.at(-1).options.still, true); renderer.destroy();
});
test('销毁可重入，释放帧和可见性监听，迟到更新不能重新绘图', () => {
  const env = sandbox(), renderer = env.renderer(); renderer.update([peer()], 'one'); renderer.update([peer('one', { x: .9 })], 'one'); renderer.destroy(); renderer.destroy(); const before = env.paints.length; assert.equal(env.scheduled.size, 0); assert.equal(env.listeners.visibilitychange.length, 0); renderer.update([peer()], 'one'); env.tick(100); assert.equal(env.paints.length, before);
});
test('人物头顶发言气泡：显示最新发言、支持双行折行、屏蔽即隐藏且6秒后自动消散', () => {
  const env = sandbox(true), renderer = env.renderer();
  const msg = (seq, text, peerId = 'one') => ({ id: 'm' + seq, seq, peerId, displayName: '<小星星>', text, at: seq });
  renderer.update([peer('one')], 'one', [msg(1, '你好呀！')]);
  assert.ok(env.texts.includes('你好呀！'), '头顶画出刚刚发送的文字');
  env.tick(2000); renderer.update([peer('one', { x: .4 })], 'one', [msg(1, '你好呀！')]);
  assert.ok(env.texts.includes('你好呀！'), '走动不重置或弄丢未过期的气泡');
  env.tick(40); renderer.update([peer('one', { x: .4 })], 'one', []);
  assert.ok(!env.texts.includes('你好呀！'), '屏蔽过滤后头顶气泡立即隐藏');
  env.tick(40); renderer.update([peer('one', { x: .4 })], 'one', [msg(1, '你好呀！')]);
  assert.ok(env.texts.includes('你好呀！'), '未过期前恢复聊天可继续显示');
  env.tick(4500); renderer.redraw();
  assert.ok(!env.texts.includes('你好呀！'), '超过6秒后气泡自动消散，旧消息不重弹');
  env.tick(40); renderer.update([peer('one', { x: .4 })], 'one', [msg(2, '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥')]);
  assert.ok(env.texts.some(t => t.endsWith('…')), '超长消息自动折行并截断省略');
  renderer.destroy();
});
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
test('挨得近的人同时说话，气泡往上错开不互相盖住；离得远或没传placed时位置不变', () => {
  const { api, canvas } = sandbox(), c = canvas.getContext('2d'), bounds = { left: 0, top: 0, width: 1600, height: 1200 };
  const alone = api.drawBubble(c, '你好呀！', 400, 600, 14, null, bounds);
  const placed = [], first = api.drawBubble(c, '你好呀！', 400, 600, 14, null, bounds, placed), second = api.drawBubble(c, '我也来啦', 430, 604, 14, null, bounds, placed), third = api.drawBubble(c, '一起玩吧', 390, 598, 14, null, bounds, placed);
  assert.equal(first.y, alone.y, '第一个气泡保持原位'); assert.equal(placed.length, 3, '每个画出的气泡都记入placed');
  assert.ok(!overlap(first, second) && !overlap(first, third) && !overlap(second, third), '三个气泡两两不重叠'); assert.ok(second.y < first.y && third.y < second.y, '后画的依次往上');
  const far = api.drawBubble(c, '我在远处', 1200, 600, 14, null, bounds, placed); assert.equal(far.y, first.y, '离得远的不受影响'); assert.equal(placed.length, 4);
  const stacked = []; for (let i = 0; i < 12; i++) api.drawBubble(c, '太挤了' + i, 400 + i, 40, 14, null, bounds, stacked);
  assert.ok(stacked.every(rect => rect.y >= bounds.top + 4), '推到画面顶部时收回画面内，不被裁掉');
});
test('3D气泡按画面从前往后排序再画，前面的人气泡留在原位，后面的错开且不盖住', () => {
  let now = 1000; const drawn = [], G = {};
  const ctx = { save() {}, restore() {}, beginPath() {}, roundRect() {}, rect() {}, fill() {}, stroke() {}, measureText: text => ({ width: Array.from(text).length * 8 }), fillText(text, x, y) { drawn.push({ text: String(text), x, y }); } };
  const context = vm.createContext({ Game: G, Map, Set, performance: { now: () => now }, setTimeout() { return 1; }, clearTimeout() {} }); context.window = context;
  vm.runInContext(source, context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/render/live-peers.js'), 'utf8'), context);
  G.World3D = function () {}; G.World3D.prototype.drawLabels = function () {};
  const people = [{ id: 'back', x: 420, y: 300 }, { id: 'front', x: 430, y: 340 }, { id: 'mid', x: 425, y: 320 }];
  G.livePeers.set(people.map(p => ({ id: p.id, displayName: p.id, avatar: {}, zone: 'yard', x: .5, y: .5 })), 'front', people.map((p, i) => ({ id: 'm' + i, seq: i + 1, peerId: p.id, displayName: p.id, text: '我是' + p.id, at: i })));
  const world = new G.World3D(); world.env = { offsetX: 0, offsetY: 0, width: 800, height: 600 }; world.project = point => ({ x: point[0], y: point[1] });
  world.actors = people.map(p => ({ kind: 'peer', id: p.id, current: [p.x, p.y, 0] }));
  world.drawLabels(ctx);
  assert.deepEqual(drawn.map(item => item.text), ['我是front', '我是mid', '我是back'], '画面更靠前的先画');
  assert.ok(drawn[0].y > drawn[1].y && drawn[1].y > drawn[2].y, '后面的人气泡依次更高');
  now += 7000; drawn.length = 0; world.drawLabels(ctx); assert.equal(drawn.length, 0, '6秒后全部消散');
});
console.log(groups + ' 组联机人物坐标、插值与生命周期检查通过（无监听，不替代浏览器目视）。');
