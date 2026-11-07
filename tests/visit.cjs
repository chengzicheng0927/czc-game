'use strict';
// 访客文档隔离：不读取主人localStorage、不启动规则/保存，也不安装编辑场景输入。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.events = {}; this.hidden = false; this.clientWidth = 800; this.clientHeight = 600; this.classes = new Set(); this.classList = { add: value => this.classes.add(value), toggle: (value, force) => force ? this.classes.add(value) : this.classes.delete(value) }; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); node.parentElement = null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  addEventListener(name, fn) { (this.events[name] || (this.events[name] = [])).push(fn); }
  querySelectorAll(selector) { let nodes = []; for (const child of this.children) { if (selector === 'button' && child.tagName === 'BUTTON') nodes.push(child); nodes = nodes.concat(child.querySelectorAll(selector)); } return nodes; }
  getContext() { return { drawImage() {}, setTransform() {}, clearRect() {} }; }
  set innerHTML(value) { throw new Error('visitor content must use textContent'); }
}
function visitSandbox(response, failure, withLive = false, route = {}, world3d = null) {
  const app = new Element('div'), body = new Element('body'), calls = [], ownerRecord = { coin: 431 }, requestPaths = [], captures = [], windowEvents = {}, timers = [], raf = [], worlds = [], clock = { now: 1000 };
  const state = { house: { name: '公开屋', floors: [{ slots: ['room_a', null, null] }], rooms: { room_a: { type: 'bedroom' } } } };
  const G = { runtime: {}, store: { setWriteGuard(fn) { calls.push('guard'); this.guard = fn; } }, cloud: { async requestPublic(route) { requestPaths.push(route); if (failure) throw failure; return response || { house: { title: '<img src=x>', displayName: '<script>' }, snapshot: { safe: true } }; } }, publicHouse: { materialize(snapshot) { assert.equal(snapshot.safe, true); const copy = structuredClone(state); if (snapshot.extraRoom) { copy.house.rooms.room_b = { type: 'bedroom' }; copy.house.floors[0].slots[1] = 'room_b'; } return copy; } }, data: { rooms: [{ id: 'bedroom', name: '卧室' }] }, render: { captureScene(options) { calls.push('capture'); captures.push(options); const canvas = new Element('canvas'); canvas.width = 1600; canvas.height = 1200; return canvas; } }, save: {}, sys: {}, ui: {} };
  if (world3d) {
    G.render.layout = { garden() { return { garden: true }; }, attic(floors) { return { attic: floors }; }, atticRoom() { return { atticRoom: true }; } };
    G.World3D = class { constructor(onChange) { this.ready = world3d !== 'unready'; this.onChange = onChange; this.renders = []; this.picks = []; this.destroyed = 0; this.pickResult = { world: { x: 12, y: -3 } }; worlds.push(this); } render(context, env) { this.renders.push(env); } pick(x, y, kind) { this.picks.push({ x, y, kind }); return this.pickResult; } destroy() { this.destroyed++; } };
  }
  const live = { mounted: 0, destroyed: 0, moved: [], rendered: [], animationDestroyed: 0 };
  if (withLive) {
    G.live = { move(zone, x, y) { live.moved.push({ zone, x, y }); return { ok: true }; } };
    G.ui.liveRoom = { mount(container, options) { live.mounted++; live.options = options; return { destroy() { live.destroyed++; } }; } };
    G.liveAvatars = {
      view(house, roomId, width, height) { return { width, height, cropX: 0, cropY: 0, roomId }; },
      position(house, point) { return point && ['yard', 'room_a'].includes(point.zone) && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? point : null; },
      clientPoint(canvas, x, y) { return { x, y }; }, unproject(frame, point) { return point; },
      destination(house, point, roomId) { return { zone: roomId || 'yard', x: point.x / 1600, y: point.y / 1200 }; },
      create(options) { live.rendered.push(options); return { update(peers, peerId, messages) { live.lastPeers = peers; live.peerId = peerId; if (messages !== undefined) live.lastMessages = messages; }, destroy() { live.animationDestroyed++; }, redraw() {} }; }
    };
    if (world3d) G.livePeers = { sets: [], clears: 0, set(peers, selfId, messages) { this.sets.push({ peers, selfId, messages }); }, clear() { this.clears++; } };
    live.emit = function (phase = 'connected', patch = {}) { live.options.onState(Object.assign({ phase, houseId: '00000000-0000-4000-8000-000000000001', peerId: 'self', peers: [{ id: 'self', displayName: '小星星', zone: 'yard', x: .4, y: .5, avatar: {} }, { id: 'friend', displayName: '小云朵', zone: 'room_a', x: .5, y: .5, avatar: {} }], messages: [{ id: 'm1', seq: 1, peerId: 'friend', displayName: '小云朵', text: '欢迎来玩！', at: 1 }] }, patch)); };
  }
  for (const [object, names] of [[G.save, ['load', 'init', 'flush', 'commit']], [G.store, ['init', 'update', 'replace']], [G.sys, ['init']], [G.render, ['init', 'start']], [G.ui, ['init']], [G.cloud, ['prepare', 'init']]]) names.forEach(name => { object[name] = () => { throw new Error('owner entry called: ' + name); }; });
  const document = { readyState: 'complete', hidden: false, body, currentScript: { src: 'https://game.test/play/releases/r-' + 'a'.repeat(64) + '/js/ui/visit.js' }, getElementById(id) { assert.equal(id, 'app'); return app; }, createElement(tag) { return new Element(tag); }, addEventListener() {} };
  const location = { pathname: '/play/visit/00000000-0000-4000-8000-000000000001', search: '', hash: '', ...route }, historyCalls = [];
  const history = { state: { keep: 'navigation' }, replaceState(state, title, url) { historyCalls.push({ state, title, url }); location.hash = ''; } };
  const context = vm.createContext({ console, Game: G, document, location, history, structuredClone, setTimeout(fn, ms) { if (ms !== 15000 && ms !== 20000) throw new Error('unexpected timer'); timers.push({ fn, ms, cleared: false, fired: false }); return timers.length; }, clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cleared = true; }, requestAnimationFrame(fn) { raf.push(fn); return raf.length; }, cancelAnimationFrame(id) { raf[id - 1] = null; }, performance: { now: () => clock.now }, devicePixelRatio: 2, setInterval() { throw new Error('unexpected interval'); }, addEventListener(name, fn) { (windowEvents[name] || (windowEvents[name] = [])).push(fn); } }); context.window = context;
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('visitor must not read/write private localStorage'); } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/visit.js'), 'utf8'), context);
  return { G, context, app, body, calls, ownerRecord, requestPaths, captures, live, windowEvents, location, historyCalls, timers, raf, worlds, clock };
}
function findId(node, id) { if (node.id === id) return node; for (const child of node.children || []) { const found = findId(child, id); if (found) return found; } return null; }
function fireRefreshTimer(value) { const timer = value.timers.filter(item => item.ms === 20000 && !item.cleared && !item.fired).at(-1); assert.ok(timer, '应有待执行的20秒核对计时'); timer.fired = true; timer.fn(); }
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function runFrame(value, at) { const frame = value.raf.filter(Boolean).at(-1); assert.ok(frame, '应有待执行的动画帧'); value.raf[value.raf.lastIndexOf(frame)] = null; value.clock.now = at; frame(at); }
function publicResponse(extra = {}) { return { house: { id: '00000000-0000-4000-8000-000000000001', title: '旧名字', displayName: '小主人', updatedAt: 1 }, snapshot: { safe: true, ...extra } }; }
function fire(node, name, event = {}) { for (const fn of node.events[name] || []) fn({ preventDefault() {}, ...event }); }
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
(async () => {
  await test('main最早分支到访客，owner存档/规则/同步/编辑入口均不执行', async () => {
    const value = visitSandbox(); assert.equal(value.G.visit.shouldStart(), true);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), value.context);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(value.app.hidden, true); assert.deepEqual(value.requestPaths, ['/public-houses/00000000-0000-4000-8000-000000000001', '/neighbors/online'], '参观只读公开快照与匿名在线摘要，不发其它请求'); assert.ok(value.calls.includes('guard') && value.calls.includes('capture')); assert.equal(value.ownerRecord.coin, 431); assert.equal(value.G.store.guard().ok, false); assert.ok(Object.isFrozen(value.G.state));
  });
  await test('公开标题与昵称作为文本显示，访客页面没有主人编辑动作', async () => {
    const value = visitSandbox(); await value.G.visit.init(); const shell = value.body.children[0], heading = shell.children[0];
    assert.equal(heading.children[0].children[0].textContent, '<img src=x>'); assert.equal(heading.children[0].children[1].textContent, '<script>的小屋 · 只读参观'); assert.equal(heading.children[1].href, '/play/');
    const labels = shell.querySelectorAll('button').map(button => button.textContent); assert.ok(labels.includes('整座小屋')); assert.ok(labels.some(label => label.includes('卧室'))); assert.ok(!labels.some(label => /建造|购买|导入|收获|登录|保存/.test(label)));
  });
  await test('参观缩放和房间选择只重绘，不触碰自己的进度或写接口', async () => {
    const value = visitSandbox(); await value.G.visit.init(); const shell = value.body.children[0], before = JSON.stringify(value.G.state), buttons = shell.querySelectorAll('button');
    for (const button of buttons.filter(button => button.textContent === '＋' || button.textContent.includes('卧室'))) for (const fn of button.events.click || []) fn();
    assert.equal(JSON.stringify(value.G.state), before); assert.equal(value.ownerRecord.coin, 431); assert.equal(value.requestPaths.length, 2, '缩放和选房间不增加请求（仅快照+在线摘要）');
  });
  await test('重复初始化不重复请求，非visit路径不拦截主人启动', async () => {
    const value = visitSandbox(); await value.G.visit.init(); await value.G.visit.init(); assert.equal(value.requestPaths.length, 2, '重复初始化只请求一次快照和一次在线摘要');
    value.context.location.pathname = '/play/'; assert.equal(value.G.visit.shouldStart(), false); value.context.location.pathname = '/other/visit/00000000-0000-4000-8000-000000000001'; assert.equal(value.G.visit.shouldStart(), false);
  });
  await test('撤下或网络失败有独立恢复入口，不回退打开/覆盖主人存档', async () => {
    const value = visitSandbox(null, { status: 404, message: 'private detail must not display' }); await value.G.visit.init();
    assert.equal(value.app.hidden, true); assert.equal(value.ownerRecord.coin, 431); assert.ok(!value.calls.includes('capture'));
    const shell = value.body.children[0], status = findId(shell, 'visit-status'); assert.ok(status.children[0].textContent.includes('撤下')); assert.ok(!status.children[0].textContent.includes('private')); assert.ok(shell.querySelectorAll('button').some(button => button.textContent === '重新载入'));
  });
  await test('联机组件仅在公开画面成功后挂载，未加入仍是原始只读画面', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); assert.equal(value.live.mounted, 1); assert.equal(value.captures.at(-1).hidePlayer, false); assert.equal(value.live.rendered.length, 0); assert.equal(value.live.moved.length, 0);
    const failed = visitSandbox(null, { status: 404 }, true); await failed.G.visit.init(); assert.equal(failed.live.mounted, 0);
  });
  await test('加入只隐藏快照主人并合成真实参与者，离开恢复静态画面且私档不变', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); const before = JSON.stringify(value.G.state);
    value.live.emit('joining'); assert.equal(value.captures.at(-1).hidePlayer, false); value.live.emit(); assert.equal(value.captures.at(-1).hidePlayer, true); assert.equal(value.live.lastPeers.length, 2); assert.equal(value.live.peerId, 'self'); assert.equal(value.live.lastMessages[0].text, '欢迎来玩！');
    value.live.emit('left', { peerId: null, peers: [] }); assert.equal(value.captures.at(-1).hidePlayer, false); assert.ok(value.live.animationDestroyed > 0); assert.equal(JSON.stringify(value.G.state), before); assert.equal(value.ownerRecord.coin, 431);
  });
  await test('查看房间不移动自己，明确进入和方向控制只调用联机位置接口', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); value.live.emit(); const before = JSON.stringify(value.G.state), buttons = value.body.querySelectorAll('button');
    fire(buttons.find(node => String(node.textContent).includes('卧室')), 'click'); assert.equal(value.live.moved.length, 0);
    fire(buttons.find(node => node.textContent === '走进这间房'), 'click'); assert.equal(value.live.moved.at(-1).zone, 'room_a'); assert.equal(value.live.moved.at(-1).x, .5);
    value.live.options.onMove('right'); assert.equal(value.live.moved.at(-1).zone, 'room_a'); assert.ok(value.live.moved.at(-1).x > .5); assert.equal(JSON.stringify(value.G.state), before);
  });
  await test('点击地面发送位置，拖动和多指取消不误走；箭头可累积自己的本机预测位置', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); value.live.emit(); const stage = findId(value.body, 'visit-stage');
    fire(stage, 'pointerdown', { button: 0, pointerId: 1, clientX: 400, clientY: 600 }); fire(stage, 'pointerup', { pointerId: 1, clientX: 400, clientY: 600 }); assert.equal(value.live.moved.length, 1); assert.equal(value.live.moved[0].x, .25);
    fire(stage, 'pointerdown', { button: 0, pointerId: 2, clientX: 300, clientY: 300 }); fire(stage, 'pointermove', { pointerId: 2, clientX: 350, clientY: 310 }); fire(stage, 'pointerup', { pointerId: 2, clientX: 350, clientY: 310 }); assert.equal(value.live.moved.length, 1);
    fire(stage, 'pointerdown', { button: 0, pointerId: 3, clientX: 300, clientY: 300 }); fire(stage, 'pointerdown', { button: 0, pointerId: 4, clientX: 300, clientY: 300, isPrimary: false }); fire(stage, 'pointerup', { pointerId: 3, clientX: 300, clientY: 300 }); assert.equal(value.live.moved.length, 1);
    fire(stage, 'keydown', { key: 'ArrowRight' }); fire(stage, 'keydown', { key: 'ArrowRight' }); assert.equal(value.live.moved.length, 3); assert.ok(value.live.moved[2].x > value.live.moved[1].x);
  });
  await test('默认场景固定，放大后视角拖动有边界，缩小和加入都归位', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); const stage = findId(value.body, 'visit-stage');
    function drag(id, x, y) { fire(stage, 'pointerdown', { button: 0, pointerId: id, clientX: 100, clientY: 100 }); fire(stage, 'pointermove', { pointerId: id, clientX: x, clientY: y }); fire(stage, 'pointerup', { pointerId: id, clientX: x, clientY: y }); }
    drag(1, 500, 500); assert.equal(stage.children[0].style.transform, 'translate(0px,0px) scale(1)');
    fire(stage, 'keydown', { key: 'ArrowRight' }); assert.equal(stage.children[0].style.transform, 'translate(0px,0px) scale(1)');
    fire(value.body.querySelectorAll('button').find(node => node.textContent === '＋'), 'click'); drag(2, 9999, -9999);
    assert.equal(stage.children[0].style.transform, 'translate(120px,-90px) scale(1.3)'); assert.ok(stage.classes.has('is-zoomed')); assert.equal(stage.classes.has('is-dragging'), false);
    value.live.emit(); assert.equal(stage.children[0].style.transform, 'translate(0px,0px) scale(1)'); assert.ok(stage.classes.has('is-walking')); assert.equal(stage.classes.has('is-zoomed'), false);
    drag(3, -9999, 9999); assert.equal(stage.children[0].style.transform, 'translate(0px,0px) scale(1)'); assert.equal(value.live.moved.length, 0);
    fire(value.body.querySelectorAll('button').find(node => node.textContent === '＋'), 'click'); drag(4, -9999, 9999); fire(stage, 'keydown', { key: '0' }); assert.equal(stage.children[0].style.transform, 'translate(0px,0px) scale(1)');
  });
  await test('失去指针捕获会取消本次拖动，不残留可误走的点击', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); value.live.emit(); const stage = findId(value.body, 'visit-stage');
    fire(stage, 'pointerdown', { button: 0, pointerId: 1, clientX: 400, clientY: 600 }); fire(stage, 'lostpointercapture'); fire(stage, 'pointerup', { pointerId: 1, clientX: 400, clientY: 600 }); assert.equal(value.live.moved.length, 0);
  });
  await test('重连与错误房间状态不能走动，离页释放合成与组件并支持缓存返回后重新加入', async () => {
    const value = visitSandbox(null, null, true); await value.G.visit.init(); value.live.emit('reconnecting'); value.live.options.onMove('right'); assert.equal(value.live.moved.length, 0);
    value.live.emit('connected', { houseId: 'another-house' }); assert.equal(value.captures.at(-1).hidePlayer, false); value.live.options.onMove('right'); assert.equal(value.live.moved.length, 0);
    value.live.emit(); for (const fn of value.windowEvents.pagehide) fn(); assert.equal(value.live.destroyed, 1); for (const fn of value.windowEvents.pageshow) fn({ persisted: true }); assert.equal(value.live.mounted, 2); assert.equal(value.captures.at(-1).hidePlayer, false);
  });
  await test('精确快捷片段仅在快照成功后消费，保留路径查询且缓存返回不重加', async () => {
    const value = visitSandbox(null, null, true, { hash: '#join', search: '?source=neighbors' }); await value.G.visit.init();
    assert.equal(value.live.options.quickJoin, true); assert.equal(value.historyCalls.length, 1); assert.equal(value.historyCalls[0].url, '/play/visit/00000000-0000-4000-8000-000000000001?source=neighbors'); assert.deepEqual(value.historyCalls[0].state, { keep: 'navigation' }); assert.equal(value.location.hash, ''); assert.equal(value.ownerRecord.coin, 431); assert.ok(Object.isFrozen(value.G.state));
    for (const fn of value.windowEvents.pagehide) fn(); value.location.hash = '#join'; for (const fn of value.windowEvents.pageshow) fn({ persisted: true }); assert.equal(value.live.mounted, 2); assert.equal(value.live.options.quickJoin, false); assert.equal(value.historyCalls.length, 1);
  });
  await test('普通参观、未知片段、失败快照或不可消费的历史都不能自动加入', async () => {
    for (const route of [{}, { hash: '#JOIN' }, { hash: '#join-extra' }, { hash: '#join?name=private' }, { search: '?join=1' }]) {
      const value = visitSandbox(null, null, true, route); await value.G.visit.init(); assert.equal(value.live.options.quickJoin, false); assert.equal(value.historyCalls.length, 0); assert.equal(value.live.moved.length, 0);
    }
    const failed = visitSandbox(null, { status: 404 }, true, { hash: '#join' }); await failed.G.visit.init(); assert.equal(failed.live.mounted, 0); assert.equal(failed.historyCalls.length, 0); assert.equal(failed.location.hash, '#join');
    const blocked = visitSandbox(null, null, true, { hash: '#join' }); blocked.context.history.replaceState = () => { throw new Error('history blocked'); }; await blocked.G.visit.init(); assert.equal(blocked.live.options.quickJoin, false); assert.equal(blocked.live.mounted, 1); assert.equal(blocked.captures.at(-1).hidePlayer, false);
  });
  await test('3D参观：用独立World3D按固定取景绘公开快照，选房/外观只改视角，不走2D截图也不碰存档', async () => {
    const value = visitSandbox(null, null, false, {}, 'ok'); await value.G.visit.init(); const stage = findId(value.body, 'visit-stage'), before = JSON.stringify(value.G.state);
    assert.equal(value.worlds.length, 1); assert.equal(value.captures.length, 0, '有WebGL时不走2D captureScene'); assert.ok(stage.classes.has('is-3d')); assert.ok(stage.children[0].className.includes('visit-picture-3d'));
    let env = value.worlds[0].renders.at(-1); assert.equal(env.capturingPhoto, true); assert.equal(env.roomOnly, null); assert.equal(env.hidePlayer, true); assert.equal(env.selfId, null); assert.equal(env.peers.length, 0); assert.equal(env.state, value.G.state);
    assert.equal(env.view.floor, 'all'); assert.equal(env.view.view, 'cutaway'); assert.equal(env.garden.garden, true); assert.equal(env.attic.attic, 1); assert.equal(env.atticRoom.atticRoom, true); assert.equal(env.rooms.length, 3); assert.equal(env.rooms.filter(room => room.data).length, 1); assert.equal(env.rooms[0].id, 'room_a');
    const buttons = value.body.querySelectorAll('button'); fire(buttons.find(node => String(node.textContent).includes('卧室')), 'click'); env = value.worlds[0].renders.at(-1); assert.equal(env.roomOnly, 'room_a'); assert.equal(env.view.floor, 1);
    fire(buttons.find(node => node.textContent === '整座小屋'), 'click'); fire(buttons.find(node => node.textContent === '小屋外观'), 'click'); env = value.worlds[0].renders.at(-1); assert.equal(env.roomOnly, null); assert.equal(env.view.view, 'exterior');
    assert.equal(value.worlds.length, 1, '换视角复用同一个World3D'); assert.equal(JSON.stringify(value.G.state), before); assert.equal(value.ownerRecord.coin, 431); assert.equal(value.requestPaths.length, 2);
  });
  await test('3D参观没有WebGL时销毁替身并退回原2D画法', async () => {
    const value = visitSandbox(null, null, false, {}, 'unready'); await value.G.visit.init(); assert.equal(value.worlds.length, 1); assert.equal(value.worlds[0].destroyed, 1); assert.ok(value.captures.length >= 1); assert.equal(findId(value.body, 'visit-stage').classes.has('is-3d'), false); assert.equal(value.worlds[0].renders.length, 0);
  });
  await test('3D联机：真实成员与气泡交给live-peers，自己的静态主人隐藏，离开后恢复', async () => {
    const value = visitSandbox(null, null, true, {}, 'ok'); await value.G.visit.init(); assert.deepEqual(value.G.livePeers.sets, []);
    value.live.emit(); let env = value.worlds[0].renders.at(-1); assert.equal(env.selfId, 'self'); assert.deepEqual(env.peers.map(peer => peer.id), ['self', 'friend']); assert.equal(env.hidePlayer, true);
    const last = value.G.livePeers.sets.at(-1); assert.equal(last.selfId, 'self'); assert.equal(last.messages[0].text, '欢迎来玩！'); assert.equal(last.peers.length, 2);
    value.live.emit('left', { peerId: null, peers: [] }); env = value.worlds[0].renders.at(-1); assert.equal(env.peers.length, 0); assert.equal(env.selfId, null); assert.ok(value.G.livePeers.clears > 0); assert.equal(value.worlds.length, 1);
  });
  await test('3D联机：他人平滑走过去、跨房间直接出现，画面最多30帧', async () => {
    const value = visitSandbox(null, null, true, {}, 'ok'); await value.G.visit.init(); value.clock.now = 1000; value.live.emit(); const world = value.worlds[0];
    const friendAt = () => world.renders.at(-1).peers.find(peer => peer.id === 'friend');
    assert.equal(friendAt().x, .5); const start = world.renders.length;
    value.live.emit('connected', { peers: [{ id: 'self', displayName: '小星星', zone: 'yard', x: .4, y: .5, avatar: {} }, { id: 'friend', displayName: '小云朵', zone: 'room_a', x: .9, y: .5, avatar: {} }] });
    runFrame(value, 1010); assert.equal(world.renders.length, start, '间隔不到1/30秒不重画');
    runFrame(value, 1100); assert.equal(world.renders.length, start + 1); assert.ok(friendAt().x > .5 && friendAt().x < .9, '走向目标而不是瞬移：' + friendAt().x); assert.ok(Math.abs(friendAt().x - .59) < 1e-9);
    value.live.emit('connected', { peers: [{ id: 'self', displayName: '小星星', zone: 'yard', x: .4, y: .5, avatar: {} }, { id: 'friend', displayName: '小云朵', zone: 'yard', x: .2, y: .2, avatar: {} }] });
    runFrame(value, 1200); assert.equal(friendAt().x, .2); assert.equal(friendAt().y, .2);
    assert.ok(value.raf.some(Boolean), '联机期间持续安排下一帧');
    value.live.emit('left', { peerId: null, peers: [] }); const idle = value.raf.filter(Boolean).length; while (value.raf.some(Boolean)) runFrame(value, value.clock.now + 50); assert.ok(idle >= 0); assert.equal(value.raf.filter(Boolean).length, 0, '离开后只读画面不再持续重画');
  });
  await test('3D点地面：拾取地面再换算成目的地并发送；未加入、拾取落空或拖动都不走', async () => {
    const value = visitSandbox(null, null, true, {}, 'ok'); await value.G.visit.init(); const stage = findId(value.body, 'visit-stage'), world = value.worlds[0], calls = [];
    value.G.liveAvatars.destination = (house, point, roomId) => { calls.push({ point, roomId }); return { zone: roomId || 'yard', x: .3, y: .7 }; };
    fire(stage, 'pointerdown', { button: 0, pointerId: 1, clientX: 400, clientY: 600 }); fire(stage, 'pointerup', { pointerId: 1, clientX: 400, clientY: 600 }); assert.equal(world.picks.length, 0); assert.equal(value.live.moved.length, 0, '只读参观点击不走动');
    value.live.emit(); fire(stage, 'pointerdown', { button: 0, pointerId: 2, clientX: 400, clientY: 600 }); fire(stage, 'pointerup', { pointerId: 2, clientX: 400, clientY: 600 });
    assert.deepEqual(world.picks, [{ x: 200, y: 300, kind: 'floor' }], '屏幕像素按设备像素比换成CSS坐标再拾取'); assert.deepEqual(calls, [{ point: { x: 12, y: -3 }, roomId: null }]); assert.deepEqual(value.live.moved, [{ zone: 'yard', x: .3, y: .7 }]);
    world.pickResult = null; fire(stage, 'pointerdown', { button: 0, pointerId: 3, clientX: 10, clientY: 10 }); fire(stage, 'pointerup', { pointerId: 3, clientX: 10, clientY: 10 }); assert.equal(value.live.moved.length, 1, '没点中地面就不走');
    world.pickResult = { world: { x: 1, y: 1 } }; fire(stage, 'pointerdown', { button: 0, pointerId: 4, clientX: 300, clientY: 300 }); fire(stage, 'pointermove', { pointerId: 4, clientX: 360, clientY: 330 }); fire(stage, 'pointerup', { pointerId: 4, clientX: 360, clientY: 330 }); assert.equal(value.live.moved.length, 1, '拖动不当作点击');
    fire(value.body.querySelectorAll('button').find(node => String(node.textContent).includes('卧室')), 'click'); fire(stage, 'pointerdown', { button: 0, pointerId: 5, clientX: 400, clientY: 600 }); fire(stage, 'pointerup', { pointerId: 5, clientX: 400, clientY: 600 }); assert.equal(calls.at(-1).roomId, 'room_a'); assert.equal(value.live.moved.at(-1).zone, 'room_a');
  });
  await test('串门中小屋版本变化会重新读取公开快照，不踢人、不重复加入、聊天与位置保留', async () => {
    const response = publicResponse(), value = visitSandbox(response, null, true, {}, 'ok'); await value.G.visit.init(); const before = value.requestPaths.length, world = value.worlds[0];
    value.live.emit('connected', { houseVersion: 'a'.repeat(64) }); await settle(); assert.equal(value.requestPaths.length, before, '第一次拿到版本只是记下，不重新读取');
    value.live.emit('connected', { houseVersion: 'a'.repeat(64) }); await settle(); assert.equal(value.requestPaths.length, before, '版本没变不重新读取');
    response.house.updatedAt = 2; response.house.title = '新名字'; response.snapshot = { safe: true, extraRoom: true };
    value.live.emit('connected', { houseVersion: 'b'.repeat(64) }); await settle();
    assert.equal(value.requestPaths.length, before + 1); assert.equal(value.requestPaths.at(-1), '/public-houses/00000000-0000-4000-8000-000000000001');
    const env = world.renders.at(-1); assert.equal(env.rooms.filter(room => room.data).length, 2, '画面换成新布置'); assert.equal(env.selfId, 'self'); assert.equal(env.peers.length, 2); assert.ok(Object.isFrozen(value.G.state));
    assert.ok(findId(value.body, 'visit-app').children[0].children[0].children[0].textContent === '新名字'); assert.ok(value.body.querySelectorAll('button').filter(node => String(node.textContent).includes('卧室')).length === 2, '房间按钮重建');
    assert.equal(value.live.mounted, 1); assert.equal(value.live.destroyed, 0); assert.equal(value.live.moved.length, 0); assert.equal(value.G.livePeers.sets.at(-1).messages[0].text, '欢迎来玩！'); assert.equal(value.ownerRecord.coin, 431);
    value.live.emit('connected', { houseVersion: 'b'.repeat(64) }); await settle(); assert.equal(value.requestPaths.length, before + 1, '同一新版本只读一次');
  });
  await test('更新后原来看的房间已被拆掉就回到整座小屋；读取失败保留旧画面且之后还能补上', async () => {
    const response = publicResponse(), value = visitSandbox(response, null, true, {}, 'ok'); await value.G.visit.init(); const world = value.worlds[0];
    fire(value.body.querySelectorAll('button').find(node => String(node.textContent).includes('卧室')), 'click'); assert.equal(world.renders.at(-1).roomOnly, 'room_a');
    value.G.cloud.requestPublic = async route => { value.requestPaths.push(route); throw new Error('offline'); }; value.live.emit('connected', { houseVersion: 'a'.repeat(64) }); value.live.emit('connected', { houseVersion: 'b'.repeat(64) }); await settle();
    assert.equal(world.renders.at(-1).roomOnly, 'room_a', '读不到就保留当前画面'); assert.equal(value.live.destroyed, 0);
    const failedAt = value.requestPaths.length; fireRefreshTimer(value); await settle(); assert.equal(value.requestPaths.length, failedAt + 1, '串门中也会按计时重试');
    response.house.updatedAt = 3; response.snapshot = { safe: true }; const changedState = structuredClone(value.G.state); changedState.house.rooms = {}; changedState.house.floors = [{ slots: [null, null, null] }];
    value.G.publicHouse.materialize = () => changedState; value.G.cloud.requestPublic = async route => { value.requestPaths.push(route); return response; }; fireRefreshTimer(value); await settle();
    assert.equal(world.renders.at(-1).roomOnly, null, '看的房间不存在了就回整座小屋'); assert.equal(world.renders.at(-1).rooms.filter(room => room.data).length, 0); assert.equal(value.live.destroyed, 0);
  });
  await test('只读参观页面可见时每20秒核对公开时间：没变不重画，变了才刷新，隐藏页不读取', async () => {
    const response = publicResponse(), value = visitSandbox(response, null, false, {}, 'ok'); await value.G.visit.init(); const world = value.worlds[0], paints = world.renders.length, before = value.requestPaths.length;
    fireRefreshTimer(value); await settle(); assert.equal(value.requestPaths.length, before + 1); assert.equal(world.renders.length, paints, '公开时间没变不重画');
    value.context.document.hidden = true; fireRefreshTimer(value); await settle(); assert.equal(value.requestPaths.length, before + 1, '隐藏页不读取'); value.context.document.hidden = false;
    response.house.updatedAt = 9; response.house.title = '周末新布置'; response.snapshot = { safe: true, extraRoom: true }; fireRefreshTimer(value); await settle();
    assert.equal(value.requestPaths.length, before + 2); assert.ok(world.renders.length > paints); assert.equal(world.renders.at(-1).rooms.filter(room => room.data).length, 2);
    value.context.document.hidden = false; assert.ok(value.timers.some(item => item.ms === 20000 && !item.cleared && !item.fired), '核对后继续排下一次');
    for (const fn of value.windowEvents.pagehide) fn(); assert.equal(value.timers.filter(item => item.ms === 20000 && !item.cleared && !item.fired).length, 0, '离页清掉计时');
  });
  console.log(count + ' 组只读访客与联机画面接入检查通过（隔离DOM，不替代浏览器目视验收）。');
})().catch(error => { console.error(error); process.exitCode = 1; });
