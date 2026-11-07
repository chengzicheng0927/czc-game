'use strict';
// 通过真实scene初始化后的Pointer Events驱动名牌；不创建浏览器、服务或绘制循环。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function surface() {
  const calls = [], listeners = new Map(), captures = new Set(), classes = new Set(); let depth = 0;
  const context = new Proxy({
    globalAlpha: 1, calls,
    save() { depth++; }, restore() { assert.ok(--depth >= 0, 'Canvas restore必须配对'); },
    measureText(value) { return { width: [...String(value)].length * 10 }; },
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    get depth() { return depth; }
  }, { get(object, property) { if (property in object) return object[property]; return (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), property + '坐标必须有限'); calls.push([property, args]); }; } });
  const canvas = { width: 900, height: 700, style: {}, classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) }, getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    addEventListener(name, fn) { listeners.set(name, fn); }, setAttribute() {},
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); }
  };
  return { canvas, context, listeners, captures };
}
function setup() {
  const main = surface(), surfaces = [], documentListeners = new Map(), windowListeners = new Map(), messages = [], sounds = [], storage = new Map();
  const frameQueue = new Map(); let frameId = 0, now = 1000;
  // 浏览器会异步运行RAF；每次只推进当前批次，连续动画排入的下一帧留待下次。
  const advanceFrame = (elapsed = 40) => { now += elapsed; const batch = [...frameQueue.values()]; frameQueue.clear(); batch.forEach(fn => fn(now)); return batch.length; };
  const document = { hidden: false, addEventListener(name, fn) { const list = documentListeners.get(name) || []; list.push(fn); documentListeners.set(name, list); }, createElement(tag) { assert.equal(tag, 'canvas'); const value = surface(); surfaces.push(value); return value.canvas; }, getElementById: () => main.canvas };
  const c = vm.createContext({ console, document, Blob, URL, performance: { now: () => now }, requestAnimationFrame: fn => { const id = ++frameId; frameQueue.set(id, fn); return id; }, cancelAnimationFrame(id) { frameQueue.delete(id); }, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); c.window = c; c.addEventListener = (name, fn) => { const list = windowListeners.get(name) || []; list.push(fn); windowListeners.set(name, list); }; c.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/room-layout.js', 'js/render/room-space.js', 'js/render/room-shell.js', 'js/render/scene.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  const G = c.Game; G.store.init(); const first = G.sys.building.buildRoom(0, 0, 'bedroom').roomId, second = G.sys.building.buildRoom(0, 1, 'kitchen').roomId;
  G.ui = { toast(value) { messages.push(value); }, refresh() {}, selection() {} }; G.audio = { play(value) { sounds.push(value); } };
  G.sys.garden = { capacity: () => 6, status: () => ({ crop: null }) }; G.render.init(main.canvas);
  G.render.camera.x = 0; G.render.camera.y = -150; G.render.camera.scale = .9;
  const point = (x, y) => G.render.camera.worldToScreen(x, y);
  const label = id => { const value = G.render.layout.roomLabel(id); return point(value.x + value.w / 2, value.y + value.h / 2); };
  const dispatch = (name, p, id = 1) => { const fn = main.listeners.get(name); assert.ok(fn, name + '必须绑定'); fn({ pointerId: id, button: 0, clientX: p.x, clientY: p.y, preventDefault() {} }); };
  const event = (name, value = {}) => (documentListeners.get(name) || []).forEach(fn => fn(value));
  return { G, first, second, main, surfaces, document, messages, sounds, point, label, dispatch, event, advanceFrame, pendingFrames: () => [...frameQueue.keys()], windowEvent(name, value={}) { (windowListeners.get(name) || []).forEach(fn=>fn(value)); } };
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });
test('名牌几何与真实命中共用，房内主体和未开放格不会被认作名牌', () => {
  const { G, first } = setup(), box = G.render.layout.roomLabel(first);
  assert.equal(box.w, 168); assert.equal(box.h, 30); assert.equal(G.render.layout.roomLabelAt({ x: box.x + 1, y: box.y + 1 }).roomId, first);
  assert.equal(G.render.layout.roomLabelAt({ x: box.x + 20, y: box.y + 50 }), null);
  G.state.house.rooms.locked = JSON.parse(JSON.stringify(G.state.house.rooms[first])); G.state.house.floors[0].slots[2] = 'locked';
  const locked = G.render.layout.roomLabel('locked'); assert.equal(G.render.layout.roomLabelAt({ x: locked.x + 80, y: locked.y + 15 }), null);
});
test('轻点名牌仅打开换位入口，不动房屋、金币、家具或回忆', () => {
  const { G, first, label, dispatch } = setup(), before = JSON.stringify(G.state), entries = [];
  G.bus.on('scene:room-layout', value => entries.push(value)); const at = label(first); dispatch('pointerdown', at); dispatch('pointerup', at);
  assert.equal(entries.length, 1); assert.equal(entries[0].roomId, first); assert.equal(JSON.stringify(G.state), before);
});
test('真实标签拖到另一间房交换身份引用，一次音效与相机跟随源房间', () => {
  const { G, first, second, label, point, dispatch, sounds } = setup(), rooms = JSON.stringify(G.state.house.rooms), coin = G.state.wallet.coin;
  const at = label(first), target = point(0, -110); dispatch('pointerdown', at); dispatch('pointermove', target); dispatch('pointerup', target);
  assert.equal(G.state.house.floors[0].slots[0], second); assert.equal(G.state.house.floors[0].slots[1], first); assert.equal(JSON.stringify(G.state.house.rooms), rooms); assert.equal(G.state.wallet.coin, coin);
  assert.equal(sounds.filter(value => value === 'success').length, 1); assert.equal(G.render.camera.x, 0); assert.equal(G.runtime.activeRoomId, first);
});
test('拖到已开放空格移动整间房，名牌命中自动跟随新位置', () => {
  const { G, first, label, point, dispatch } = setup(); G.store.update(state => { state.level = 3; });
  const at = label(first), target = point(320, -110); dispatch('pointerdown', at); dispatch('pointermove', target); dispatch('pointerup', target);
  assert.equal(G.state.house.floors[0].slots[0], null); assert.equal(G.state.house.floors[0].slots[2], first); const box = G.render.layout.roomLabel(first); assert.equal(box.x, 236); assert.equal(G.render.layout.roomLabelAt({ x: box.x + 10, y: box.y + 10 }).roomId, first);
});
test('释放到世界外或未开放格不互换，也不会触发家具收回', () => {
  for (const coordinate of [[1800, -900], [320, -110]]) {
    const { G, first, label, point, dispatch, sounds } = setup(), before = JSON.stringify(G.state), at = label(first), target = point(...coordinate);
    dispatch('pointerdown', at); dispatch('pointermove', target); dispatch('pointerup', target); assert.equal(JSON.stringify(G.state), before); assert.equal(sounds.length, 0);
  }
});
test('Escape与pointercancel取消拖动并释放捕获，之后可重新点标签', () => {
  for (const cancel of ['Escape', 'pointercancel']) {
    const { G, first, label, point, dispatch, event, main } = setup(), before = JSON.stringify(G.state), at = label(first), target = point(0, -110);
    dispatch('pointerdown', at); dispatch('pointermove', target); if (cancel === 'Escape') event('keydown', { key: 'Escape' }); else dispatch('pointercancel', target); dispatch('pointerup', target);
    assert.equal(JSON.stringify(G.state), before); assert.equal(main.captures.size, 0); let opened = 0; G.bus.on('scene:room-layout', () => opened++); const fresh = label(first); dispatch('pointerdown', fresh); dispatch('pointerup', fresh); assert.equal(opened, 1);
  }
});
test('双指手势不会在松手后误提交房间，下一次单指仍可打开名牌', () => {
  const { G, first, label, point, dispatch } = setup(), before = JSON.stringify(G.state), at = label(first), target = point(0, -110);
  dispatch('pointerdown', at, 1); dispatch('pointermove', target, 1); dispatch('pointerdown', { x: at.x + 50, y: at.y + 30 }, 2); dispatch('pointerup', target, 1); dispatch('pointerup', at, 2);
  assert.equal(JSON.stringify(G.state), before); let opened = 0; G.bus.on('scene:room-layout', () => opened++); const fresh = label(first); dispatch('pointerdown', fresh); dispatch('pointerup', fresh); assert.equal(opened, 1);
});
test('拖动期间房间用途或格位改变会拒绝旧操作，换档与后台也清理手势', () => {
  for (const mutation of ['type', 'position', 'replace', 'hidden']) {
    const { G, first, second, label, point, dispatch, document, event } = setup(), at = label(first), target = point(0, -110);
    dispatch('pointerdown', at); dispatch('pointermove', target);
    if (mutation === 'type') G.store.update(state => { state.house.rooms[first].type = 'living'; });
    if (mutation === 'position') G.sys.building.swapRooms(first, 0, 1, second);
    if (mutation === 'replace') G.store.replace(G.state);
    if (mutation === 'hidden') { document.hidden = true; event('visibilitychange'); }
    const after = JSON.stringify(G.state); dispatch('pointerup', target); assert.equal(JSON.stringify(G.state), after);
  }
});
test('窗口失焦取消正在拖动的名牌，晚到pointerup不提交并允许下一次轻点', () => {
  const { G, first, label, point, dispatch, windowEvent, main } = setup(), before=JSON.stringify(G.state), target=point(0,-110);
  dispatch('pointerdown',label(first)); dispatch('pointermove',target); assert.ok(main.captures.size>0);
  windowEvent('blur'); assert.equal(main.captures.size,0); dispatch('pointerup',target); assert.equal(JSON.stringify(G.state),before);
  let opened=0; G.bus.on('scene:room-layout',()=>opened++); const at=label(first); dispatch('pointerdown',at); dispatch('pointerup',at); assert.equal(opened,1);
});
test('离屏照片不含名牌或拖动提示，拍照不消耗待提交拖动', () => {
  const { G, first, second, label, point, dispatch, main, sounds, advanceFrame, pendingFrames } = setup(), at = label(first), target = point(0, -110);
  assert.equal(main.context.calls.length, 0, '初始绘制应等待浏览器帧，不能同步伪造Canvas调用');
  G.render.redraw(); assert.equal(pendingFrames().length, 1, '同一帧的重绘请求合并'); assert.equal(advanceFrame(), 1);
  assert.ok(main.context.calls.some(call => call[0] === 'fillText' && String(call[1][0]).includes('· 换位')));
  assert.equal(main.context.depth, 0); main.context.calls.length = 0;
  dispatch('pointerdown', at); dispatch('pointermove', target);
  advanceFrame(16); assert.equal(main.context.calls.length, 0, '未满30fps帧间隔时不绘制');
  advanceFrame(18); assert.ok(main.context.calls.some(call => call[0] === 'fillText' && String(call[1][0]).includes('互换位置')), '实际交互帧必须画出拖动提示');
  const before = JSON.stringify(G.state), camera = JSON.stringify(G.render.camera), mainCalls = main.context.calls.length, captures = [...main.captures], pending = pendingFrames();
  const photo = G.render.captureScene({ scope: 'house' }); const out = photo.getContext('2d');
  assert.ok(out.calls.some(call => call[0] === 'fill'), '照片必须实际绘制场景，空画布不能通过提示隔离检查');
  assert.ok(!out.calls.some(call => call[0] === 'fillText' && /换位|互换位置|移到这块空位|拖到已开放/.test(String(call[1][0])))); assert.equal(out.depth, 0); assert.equal(JSON.stringify(G.state), before); assert.equal(JSON.stringify(G.render.camera), camera);
  assert.equal(main.context.calls.length, mainCalls); assert.deepEqual([...main.captures], captures); assert.deepEqual(pendingFrames(), pending);
  dispatch('pointerup', target); assert.equal(G.state.house.floors[0].slots[0], second); assert.equal(G.state.house.floors[0].slots[1], first);
  assert.equal(sounds.filter(value => value === 'success').length, 1); G.render.destroy(); assert.equal(pendingFrames().length, 0);
});
for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组房间名牌与真实场景事件检查通过（模拟Pointer Events和Canvas，不代替浏览器拖动验收）。');
