'use strict';
// 真实小游戏UI、结算和存档模块，配以可推进时钟与轻量DOM；不启动浏览器或服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function sandbox() {
  let now = 0, serial = 0, activeModal = null;
  const timers = new Map(), events = {}, windowEvents = {}, modals = [], faces = [], finished = [], sounds = [];
  function on(list, name, fn) { (list[name] ||= []).push(fn); }
  function off(list, name, fn) { list[name] = (list[name] || []).filter(item => item !== fn); }
  function emit(list, name) { (list[name] || []).slice().forEach(fn => fn({})); }
  const context = new Proxy({}, { get(object, name) { if (!(name in object)) object[name] = () => {}; return object[name]; } });
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.className = ''; this.disabled = false; this._text = ''; this.style = { setProperty() {} }; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { on(this.listeners, name, fn); }
    removeEventListener(name, fn) { off(this.listeners, name, fn); }
    fire(name) { emit(this.listeners, name); }
    click() { if (!this.disabled) this.fire('click'); }
    focus() {}
    getContext() { return context; }
    get classList() {
      const apply = (name, value) => { const all = new Set(this.className.split(/\s+/).filter(Boolean)); if (value) all.add(name); else all.delete(name); this.className = [...all].join(' '); };
      return { add: name => apply(name, true), toggle: (name, value) => apply(name, value) };
    }
  }
  const addTimer = (fn, delay, repeat, frame = false) => { const id = ++serial; timers.set(id, { fn, delay, at: now + delay, repeat, frame }); return id; };
  const math = Object.create(Math); math.random = () => 0;
  const fixed = new Date(2026, 9, 28, 12).getTime();
  const environment = vm.createContext({
    console, Blob, URL, Math: math,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [fixed + now])); } static now() { return fixed + now; } },
    performance: { now: () => now },
    document: { hidden: false, createElement: tag => new Node(tag), addEventListener: (name, fn) => on(events, name, fn), removeEventListener: (name, fn) => off(events, name, fn) },
    setInterval: (fn, delay) => addTimer(fn, delay, true), clearInterval: id => timers.delete(id),
    setTimeout: (fn, delay) => addTimer(fn, delay || 0, false), clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => addTimer(fn, 1000 / 30, false, true), cancelAnimationFrame: id => timers.delete(id),
    addEventListener: (name, fn) => on(windowEvents, name, fn), removeEventListener: (name, fn) => off(windowEvents, name, fn),
    localStorage: { getItem: () => null, setItem() {} }
  });
  environment.window = environment;
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/residents-expansion.js', 'js/data/minigames.js', 'js/data/garden.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/garden.js', 'js/ui/minigames.js', 'js/ui/bakery.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file }));
  const G = environment.Game; G.store.init(G.save.load());
  G.ui.audio = { play: kind => sounds.push(kind) }; G.audio = G.ui.audio;
  G.ui.panel = { close() {} }; G.ui.refresh = () => {}; G.ui.toast = () => {}; G.ui.open = () => {};
  G.render = { drawCharacter: (canvas, id) => faces.push({ type: 'resident', id }), drawThumbnail: (canvas, id) => faces.push({ type: 'furniture', id }) };
  G.ui.modal = options => {
    if (activeModal) activeModal.close();
    const modal = { options, element: new Node('section'), closed: false, close() { if (this.closed) return; this.closed = true; if (activeModal === this) activeModal = null; if (options.onClose) options.onClose(); } };
    modal.element.append(options.content); activeModal = modal; modals.push(modal); return modal;
  };
  G.bus.on('minigame:finished', event => finished.push(event));
  function step(ms) {
    now += ms;
    const due = [...timers.entries()].filter(([, task]) => task.at <= now);
    due.forEach(([id, task]) => { if (!timers.has(id)) return; if (task.repeat) task.at = now + task.delay; else timers.delete(id); if (task.frame) task.fn(now); else task.fn(); });
  }
  const advance = ms => { while (ms > 0) { const amount = Math.min(50, ms); step(amount); ms -= amount; } };
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const all = () => descendants(modals[0].element);
  const byClass = name => all().find(node => node.className.split(/\s+/).includes(name));
  const ingredient = id => all().find(node => node.dataset.ingredient === id);
  const control = text => all().find(node => node.tagName === 'BUTTON' && node.textContent === text);
  function startBakery() { assert.ok(G.sys.building.buildRoom(0, 0, 'kitchen').ok); G.ui.bakery.start(); }
  function cake(layered = false) { ['vanilla', 'white', ...(layered ? ['vanilla', 'white'] : []), 'strawberry'].forEach(id => ingredient(id).click()); }
  return { G, environment, modals, faces, finished, sounds, timers, advance, jump: ms => { now += ms; }, all, byClass, ingredient, control, startBakery, cake,
    hide(value) { environment.document.hidden = value; emit(events, 'visibilitychange'); }, pagehide() { emit(windowEvents, 'pagehide'); },
    listeners: () => Object.values(events).concat(Object.values(windowEvents)).reduce((sum, list) => sum + list.length, 0) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('✓ ' + name); }
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
(async () => {
  await test('真实12居民牌池三档均混合家具，按身份去重且不修改来源', () => {
    const { G } = sandbox(), before = JSON.stringify([G.data.residents, G.data.furniture]); assert.equal(G.data.residents.length, 12);
    for (const pairs of [6, 8, 10]) for (let seed = 0; seed < 30; seed++) {
      const pool = G.ui.minigames.memoryPool(G.data.residents, G.data.furniture, pairs, seeded(seed));
      assert.equal(pool.length, pairs); assert.equal(pool.filter(card => card.type === 'resident').length, pairs / 2); assert.equal(pool.filter(card => card.type === 'furniture').length, pairs / 2);
      assert.equal(new Set(pool.map(card => card.type + ':' + card.id)).size, pairs);
    }
    assert.equal(JSON.stringify([G.data.residents, G.data.furniture]), before);
  });
  await test('牌池候选不足时不造重复牌，同名不同类别保留且极端随机源安全', () => {
    const pick = sandbox().G.ui.minigames.memoryPool, residents = [{ id: 'same', name: '朋友' }, { id: 'same', name: '重复' }], furniture = [{ id: 'same', name: '家具' }, { id: 'bed', name: '小床' }, { id: 'lamp', name: '台灯' }];
    for (const rng of [() => 0, () => .999999, () => NaN]) {
      const pool = plain(pick(residents, furniture, 4, rng)); assert.equal(pool.length, 4); assert.equal(new Set(pool.map(card => card.type + ':' + card.id)).size, 4); assert.equal(pool.filter(card => card.id === 'same').length, 2);
    }
    assert.equal(pick([], [], 6).length, 0); assert.equal(pick(residents, furniture, -1).length, 0);
  });
  await test('三档记忆真实开局和绘图入口都出现居民与家具，每个身份成一对', () => {
    for (const [difficulty, count] of [['easy', 12], ['normal', 16], ['hard', 20]]) {
      const s = sandbox(); s.G.ui.minigames.start('memory', { difficulty }); s.advance(3500);
      assert.equal(s.faces.length, count); assert.ok(s.faces.some(card => card.type === 'resident')); assert.ok(s.faces.some(card => card.type === 'furniture'));
      const identities = new Set(s.faces.map(card => card.type + ':' + card.id)); assert.equal(identities.size, count / 2);
      identities.forEach(identity => assert.equal(s.faces.filter(card => card.type + ':' + card.id === identity).length, 2));
      s.G.runtime.minigames.running.finish(true);
    }
  });
  await test('顾客有可读笑脸和耐心进度，经过时间后真实减少', () => {
    const s = sandbox(); s.startBakery(); const meter = s.byClass('bakery-patience');
    assert.equal(meter.attributes.role, 'progressbar'); assert.equal(meter.attributes['aria-valuenow'], '100'); assert.match(meter.attributes['aria-valuetext'], /慢慢来/);
    s.advance(11000); assert.ok(Number(meter.attributes['aria-valuenow']) > 0 && Number(meter.attributes['aria-valuenow']) < 50); assert.match(meter.attributes['aria-valuetext'], /香味/);
  });
  await test('耐心到底温柔离开，未完成蛋糕清空；不扣财富、不加订单或赠品', () => {
    const s = sandbox(); s.startBakery(); const before = JSON.stringify(s.G.state); s.ingredient('vanilla').click(); s.advance(20000);
    assert.equal(JSON.stringify(s.G.state), before); assert.equal(s.finished.length, 0); assert.match(s.byClass('bakery-order').textContent, /有点饿/); assert.equal(s.byClass('bakery-patience').attributes['aria-valuenow'], '0');
    assert.equal(s.control('🎂 做好啦，出餐').disabled, true); assert.equal(s.byClass('bakery-bowl').children.find(node => node.tagName === 'CANVAS').attributes['aria-label'], '空盘子');
    s.advance(900); assert.equal(s.byClass('bakery-order').dataset.customer, '2'); assert.equal(s.ingredient('vanilla').disabled, false); assert.equal(s.ingredient('white').disabled, true); assert.equal(JSON.stringify(s.G.state), before);
  });
  await test('计时心跳尚未运行时，截止瞬间的出餐先识别到期且不产生奖励', () => {
    const s = sandbox(); s.startBakery(); s.cake(); s.jump(20000); s.control('🎂 做好啦，出餐').fire('click');
    assert.equal(s.byClass('bakery-order').dataset.customer, '1'); assert.match(s.byClass('bakery-order').textContent, /有点饿/); assert.equal(s.finished.length, 0);
    s.control('🎂 做好啦，出餐').fire('click'); s.advance(1000); assert.equal(s.byClass('bakery-order').dataset.customer, '2');
    s.control('收好本局礼物').click(); assert.equal(s.finished[0].score, 0); assert.equal(s.G.state.inventory.cake_strawberry || 0, 0); assert.equal(s.G.state.quests.stats.bakeryOrders || 0, 0);
  });
  await test('截止前出餐与随后旧心跳、重复出餐只推进一位顾客和一个订单', () => {
    const s = sandbox(); s.startBakery(); s.cake(); s.jump(19999); s.control('🎂 做好啦，出餐').fire('click');
    assert.equal(s.byClass('bakery-order').dataset.customer, '2'); s.control('🎂 做好啦，出餐').fire('click'); s.advance(101);
    assert.equal(s.byClass('bakery-order').dataset.customer, '2'); assert.doesNotMatch(s.byClass('bakery-order').textContent, /有点饿/);
    s.control('收好本局礼物').click(); assert.equal(s.finished.length, 1); assert.equal(s.finished[0].score, 1); assert.equal(s.G.state.quests.stats.bakeryOrders, 1); assert.equal(s.G.state.inventory.cake_strawberry, 1);
  });
  await test('错蛋糕可重做，三单后真实变双层且耐心延长为25秒', () => {
    const s = sandbox(); s.startBakery(); ['cocoa', 'white', 'strawberry'].forEach(id => s.ingredient(id).click()); s.control('🎂 做好啦，出餐').click();
    assert.equal(s.byClass('bakery-order').dataset.customer, '1'); assert.match(s.byClass('bakery-feedback').textContent, /没关系/); s.control('↶ 重新做').click();
    for (let i = 0; i < 3; i++) { s.cake(); s.control('🎂 做好啦，出餐').click(); }
    assert.equal(s.byClass('bakery-order').dataset.customer, '4'); const recipe = s.byClass('bakery-recipe').textContent; assert.equal((recipe.match(/香草/g) || []).length, 2);
    s.advance(20000); assert.equal(s.byClass('bakery-order').dataset.customer, '4'); assert.ok(Number(s.byClass('bakery-patience').attributes['aria-valuenow']) > 0);
    s.cake(true); s.control('🎂 做好啦，出餐').click(); s.control('收好本局礼物').click(); assert.equal(s.finished[0].score, 4);
  });
  await test('切到后台暂停唯一心跳和耐心，回来后不追补超时', () => {
    const s = sandbox(); s.startBakery(); s.advance(5000); const meter = s.byClass('bakery-patience').attributes['aria-valuenow'], time = s.byClass('bakery-time').textContent;
    assert.equal(s.timers.size, 1); s.hide(true); assert.equal(s.timers.size, 0); s.jump(120000); s.hide(false); assert.equal(s.timers.size, 1);
    assert.equal(s.byClass('bakery-time').textContent, time); assert.equal(s.byClass('bakery-patience').attributes['aria-valuenow'], meter); assert.equal(s.byClass('bakery-order').dataset.customer, '1');
    s.advance(15000); assert.match(s.byClass('bakery-order').textContent, /有点饿/);
  });
  await test('关窗即时停心跳，随后只结算一次并移除可见性、卸载与换档监听', async () => {
    const s = sandbox(); s.startBakery(); s.cake(); s.control('🎂 做好啦，出餐').click(); s.modals[0].close();
    assert.equal(s.timers.size, 0); await Promise.resolve(); assert.equal(s.finished.length, 1); assert.equal(s.finished[0].score, 1); assert.equal(s.listeners(), 0); assert.equal(s.G.ui.bakery.isRunning(), false);
    s.modals[0].close(); s.advance(60000); assert.equal(s.finished.length, 1); assert.equal(s.G.state.inventory.cake_strawberry, 1);
  });
  await test('换档取消旧局，已关闭局的待结算微任务也不能污染新进度', async () => {
    const s = sandbox(); s.startBakery(); s.cake(); s.control('🎂 做好啦，出餐').click(); s.modals[0].close(); const before = JSON.stringify(s.G.state);
    s.G.bus.emit('state:replace', s.G.state); await Promise.resolve(); s.control('🎂 做好啦，出餐').fire('click');
    assert.equal(JSON.stringify(s.G.state), before); assert.equal(s.finished.length, 0); assert.equal(s.G.ui.bakery.isRunning(), false); assert.equal(s.listeners(), 0); assert.equal(s.timers.size, 0); assert.equal(s.G.runtime.minigames.sessions.size, 0);
  });
  await test('离开页面取消旧局并释放资源，不在卸载时新开结果或发奖', () => {
    const s = sandbox(); s.startBakery(); const before = JSON.stringify(s.G.state); s.pagehide(); s.advance(70000);
    assert.equal(JSON.stringify(s.G.state), before); assert.equal(s.G.ui.bakery.isRunning(), false); assert.equal(s.listeners(), 0); assert.equal(s.timers.size, 0); assert.equal(s.modals.length, 1); assert.equal(s.finished.length, 0);
  });
  await test('整局结束与顾客到期同刻只发本局一次一星保底，不把离客计成订单', () => {
    const s = sandbox(); s.startBakery(); s.advance(60000); assert.equal(s.finished.length, 1); assert.equal(s.finished[0].stars, 1); assert.equal(s.finished[0].score, 0); assert.equal(s.G.state.inventory.cake_strawberry || 0, 0); assert.equal(s.listeners(), 0); assert.equal(s.timers.size, 0);
    s.advance(60000); s.control('收好本局礼物').fire('click'); assert.equal(s.finished.length, 1);
  });
  console.log('\n' + passed + ' 组小游戏界面与时钟检查通过。');
})().catch(error => { console.error(error); process.exitCode = 1; });
