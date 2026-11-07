'use strict';
// 纯Node契约：生日舞台不另启页面、服务或音频设备。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { setup } = require('./fixtures/content-state.cjs');
const root = path.resolve(__dirname, '..');
function stage(options = {}) {
  let clock = new Date(2026, 9, 28, 12).getTime(), nextRaf = 0, activeModal = null, stoppedSounds = 0;
  const nodes = [], rafs = new Map(), listeners = {}, windowListeners = {}, sounds = [], portraits = [], avatars = [], toasts = [], modals = [];
  const context = () => {
    const calls = [], target = { calls };
    for (const method of ['beginPath', 'roundRect', 'fill', 'stroke', 'clearRect', 'setTransform', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'ellipse', 'save', 'restore', 'translate', 'rotate', 'drawImage', 'fillText']) target[method] = (...args) => { args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), method + '坐标必须有效'); }); calls.push([method, ...args]); };
    return target;
  };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = {}; this._text = ''; this.className = ''; this.width = 0; this.height = 0; this.ctx = context(); nodes.push(this); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    append(...children) { children.forEach(node => { this.children.push(node); node.parentElement = this; }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    click() { if (!this.disabled) (this.listeners.click || []).forEach(fn => fn({ target: this })); }
    getBoundingClientRect() { return { width: parseFloat(this.style.width) || 680, height: parseFloat(this.style.height) || 340 }; }
    getContext() { return this.ctx; }
    get classList() { const apply = (name, enabled) => { const values = new Set(this.className.split(/\s+/).filter(Boolean)); if (enabled) values.add(name); else values.delete(name); this.className = Array.from(values).join(' '); return enabled; }; return { add: name => apply(name, true), toggle: (name, enabled) => apply(name, enabled === undefined ? !this.className.split(/\s+/).includes(name) : enabled), contains: name => this.className.split(/\s+/).includes(name) }; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
  }
  const add = (list, name, fn) => (list[name] ||= new Set()).add(fn), remove = (list, name, fn) => list[name]?.delete(fn);
  const document = { hidden: false, body: new Node('body'), createElement: tag => new Node(tag), addEventListener: (name, fn) => add(listeners, name, fn), removeEventListener: (name, fn) => remove(listeners, name, fn) };
  const environment = vm.createContext({ console, Set, Map, document,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    requestAnimationFrame: fn => { rafs.set(++nextRaf, fn); return nextRaf; }, cancelAnimationFrame: id => rafs.delete(id),
    addEventListener: (name, fn) => add(windowListeners, name, fn), removeEventListener: (name, fn) => remove(windowListeners, name, fn),
    matchMedia: () => ({ matches: !!options.reduced }), devicePixelRatio: 1
  }); environment.window = environment;
  for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/residents-expansion.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/birthday.js', 'js/core/bus.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file });
  const G = environment.Game;
  G.state = { profile: { name: '小云朵', birthday: '10-28' }, calendar: { claimed: { '2026:player_birthday': true } }, avatar: { hair: 'twin_tails' }, residents: {}, wallet: { coin: 1234 }, inventory: { festival_birthday_cake: 1 }, memories: [{ text: '礼物已收好' }] };
  (options.guests || []).forEach(id => { G.state.residents[id] = { movedIn: true }; });
  G.audio = { play: kind => sounds.push(kind), stopBirthday: () => { stoppedSounds++; }, speak() { assert.fail('庆生不能自动朗读'); } };
  G.render = { drawCharacter: (canvas, id) => portraits.push(id), drawAvatar: (canvas, avatar) => avatars.push(avatar) };
  G.draw = { festival: { draw(c, def, x, y) { c.fillText(def.motif, x, y); } } };
  G.ui = { toast: text => toasts.push(text), modal(options) {
    if (activeModal) activeModal.close();
    const modal = { options, closed: false, element: new Node('section'), close() { if (this.closed) return; this.closed = true; if (activeModal === this) activeModal = null; options.onClose?.(); } };
    modal.element.append(options.content); activeModal = modal; modals.push(modal); return modal;
  } };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/birthday.js'), 'utf8'), environment, { filename: 'js/ui/birthday.js' });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  return { G, environment, document, nodes, rafs, sounds, portraits, avatars, toasts, modals, listeners, windowListeners, descendants, stoppedSounds: () => stoppedSounds,
    button(text) { return descendants(activeModal.element).find(node => node.tagName === 'BUTTON' && node.textContent === text); },
    canvas() { return descendants(activeModal.element).find(node => node.className === 'birthday-stage'); },
    frame(now) { const pending = Array.from(rafs.entries()); pending.forEach(([id, fn]) => { if (rafs.delete(id)) fn(now); }); },
    visibility(hidden) { document.hidden = hidden; Array.from(listeners.visibilitychange || []).forEach(fn => fn()); },
    at(date) { const parts = date.split('-').map(Number); clock = new Date(parts[0], parts[1] - 1, parts[2], 12).getTime(); }
  };
}
function calendarStage() {
  const s = stage(), real = setup(), { G } = s, calls = [], opened = [];
  real.G.store.update(state => { state.profile.birthday = '10-28'; state.tutorial.done = true; });
  Object.defineProperty(G, 'state', { get: () => real.G.state }); G.sys = real.G.sys; G.store = real.G.store; G.save = real.G.save; G.bus = real.G.bus;
  G.ui.refresh = () => calls.push('refresh'); G.ui.open = name => opened.push(name); G.ui.speak = () => assert.fail('日历不能自动朗读');
  const birthdayOpen = G.ui.birthday.open; G.ui.birthday.open = options => { calls.push(options?.fromClaim ? 'claim-celebrate' : 'replay-celebrate'); return birthdayOpen(options); };
  // 音频单元另测真实7音；此处只接收真实领取事件，检查舞台不会二次请求。
  G.bus.on('festival:claimed', entry => { if (entry.festivalId === 'player_birthday') G.audio.play('birthday'); });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/calendar.js'), 'utf8'), s.environment, { filename: 'js/ui/calendar.js' });
  return Object.assign(s, { real, calls, opened });
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('生日舞台需要真实当天与当年已收凭据，不接受仅调试强制活动', () => {
  const s = stage(), { G } = s; delete G.state.calendar.claimed['2026:player_birthday']; assert.equal(G.ui.birthday.available(), false); assert.equal(G.ui.birthday.open(), false); assert.equal(s.modals.length, 0);
  G.state.calendar.claimed['2025:player_birthday'] = true; assert.equal(G.ui.birthday.available(), false); G.state.calendar.claimed['2026:player_birthday'] = true; assert.equal(G.ui.birthday.available(), true);
  s.at('2026-10-29'); G.runtime.timeDebug = { festival: 'player_birthday', date: '2026-10-28' }; assert.equal(G.ui.birthday.available(), false); assert.equal(G.ui.birthday.open(), false);
});
test('全体真实入住朋友使用现有角色，未入住与未知居民不混入，玩家形象相同', () => {
  const s = stage({ guests: ['lily', 'rainbow'] }), { G } = s; G.state.residents.pudding = { movedIn: false }; G.state.residents.unknown = { movedIn: true };
  const before = JSON.stringify(G.state), modal = G.ui.birthday.open({ fromClaim: true }); assert.ok(modal); assert.match(modal.element.textContent, /2 位入住朋友都来啦/); assert.match(modal.element.textContent, /莉莉、彩虹/);
  assert.deepEqual(s.portraits, ['lily', 'rainbow', 'nuomi']); assert.equal(s.avatars[0], G.state.avatar); assert.equal(JSON.stringify(G.state), before); assert.match(s.canvas().attributes['aria-label'], /皇冠.*莉莉、彩虹.*蛋糕/);
  const all = stage({ guests: G.data.residents.map(def => def.id) }); assert.match(all.G.ui.birthday.open({ fromClaim: true }).element.textContent, /12 位入住朋友/); assert.equal(all.portraits.length, 13);
});
test('收礼后不叠加播放，再开与主动重唱只播一遍生日曲；重看不发奖', () => {
  const s = stage({ guests: ['lily'] }), { G } = s, before = JSON.stringify(G.state); const modal = G.ui.birthday.open({ fromClaim: true }); assert.deepEqual(s.sounds, []);
  s.button('再唱一遍').click(); assert.deepEqual(s.sounds, ['birthday']); assert.equal(G.ui.birthday.open(), modal); assert.deepEqual(s.sounds, ['birthday']);
  s.button('收好祝福').click(); assert.equal(s.stoppedSounds(), 1); G.ui.birthday.open(); assert.deepEqual(s.sounds, ['birthday', 'birthday']); assert.equal(JSON.stringify(G.state), before);
});
test('祝福逐位阅读且无自动朗读，所有朋友都在名单与祝福中', () => {
  const s = stage({ guests: ['lily', 'pudding'] }), modal = s.G.ui.birthday.open({ fromClaim: true });
  assert.match(modal.element.textContent, /糯米的祝福 · 1 \/ 3/); s.button('换份祝福').click(); assert.match(modal.element.textContent, /莉莉的祝福 · 2 \/ 3/); s.button('换份祝福').click(); assert.match(modal.element.textContent, /布丁的祝福 · 3 \/ 3/); s.button('换份祝福').click(); assert.match(modal.element.textContent, /糯米的祝福 · 1 \/ 3/); assert.deepEqual(s.sounds, []);
});
test('空小屋有糯米与玩家静态陪伴，减少动态也只绘制一次', () => {
  for (const options of [{}, { guests: ['lily'], reduced: true }]) { const s = stage(options), modal = s.G.ui.birthday.open({ fromClaim: true }); assert.equal(s.rafs.size, 0); assert.ok(s.canvas().ctx.calls.some(call => call[0] === 'drawImage')); if (!options.guests) { assert.match(modal.element.textContent, /糯米先陪你/); assert.match(modal.element.textContent, /今天有糯米和你/); assert.deepEqual(s.portraits, ['nuomi']); } modal.close(); }
});
test('舞台最多12帧绘制，后台停绘停曲，回来不自动重唱', () => {
  const s = stage({ guests: ['lily'] }); s.G.ui.birthday.open({ fromClaim: true }); const canvas = s.canvas(), draws = () => canvas.ctx.calls.filter(call => call[0] === 'clearRect').length;
  const first = draws(); s.frame(16); s.frame(32); s.frame(64); assert.equal(draws(), first); s.frame(84); assert.equal(draws(), first + 1); s.frame(100); assert.equal(draws(), first + 1);
  s.visibility(true); assert.equal(s.rafs.size, 0); assert.equal(s.stoppedSounds(), 1); const background = draws(); s.frame(1000); assert.equal(draws(), background);
  s.visibility(false); assert.equal(s.rafs.size, 1); assert.equal(draws(), background + 1); assert.deepEqual(s.sounds, []);
});
test('关闭、换档与跨日清理帧、监听与全部画布像素，可再次安全打开', () => {
  for (const exit of ['close', 'replace', 'day']) { const s = stage({ guests: ['lily'] }), modal = s.G.ui.birthday.open({ fromClaim: true }); assert.equal(s.rafs.size, 1);
    if (exit === 'replace') s.G.bus.emit('state:replace', {}); else if (exit === 'day') { s.at('2026-10-29'); s.G.bus.emit('time:change', {}); } else s.G.ui.birthday.close();
    assert.equal(modal.closed, true); assert.equal(s.rafs.size, 0); assert.equal(s.listeners.visibilitychange.size, 0); assert.equal(s.windowListeners.resize.size, 0); assert.ok(s.nodes.filter(node => node.tagName === 'CANVAS').every(node => node.width === 0 && node.height === 0)); assert.equal(s.stoppedSounds(), 1);
    if (exit !== 'day') { assert.ok(s.G.ui.birthday.open({ fromClaim: true })); s.G.ui.birthday.close(); }
  }
});
test('生日年度礼物一起落盘，存储失败不发事件或消费凭据，不凭空新增衣物', () => {
  const { G } = setup(); G.store.update(state => { state.profile.birthday = '10-28'; }); let events = 0; G.bus.on('festival:claimed', () => events++); const clothes = JSON.stringify(G.state.avatar.owned);
  const commit = G.save.commit, before = JSON.stringify(G.state); G.save.commit = () => false; const failed = G.sys.time.claim('player_birthday'); assert.equal(failed.ok, false); assert.match(failed.message, /没有存好/); assert.equal(JSON.stringify(G.state), before); assert.equal(events, 0);
  G.save.commit = commit; const result = G.sys.time.claim('player_birthday'); assert.ok(result.ok, result.message); assert.equal(events, 1); assert.equal(G.state.calendar.claimed['2026:player_birthday'], true); assert.equal(G.state.inventory.festival_birthday_cake, 1); assert.equal(result.event.gift.outfitId, undefined); assert.equal(JSON.stringify(G.state.avatar.owned), clothes);
  const saved = JSON.stringify(G.state); assert.equal(G.sys.time.claim('player_birthday').ok, false); assert.equal(JSON.stringify(G.state), saved);
});
test('同步存储重入不会二领，老年度凭据保留且次年可领新一份', () => {
  const { G, at } = setup(); G.store.update(state => { state.profile.birthday = '10-28'; state.calendar.claimed['2025:player_birthday'] = true; }); const commit = G.save.commit; let entered = false, nested;
  G.save.commit = state => { if (!entered) { entered = true; nested = G.sys.time.claim('player_birthday'); } return commit(state); };
  assert.ok(G.sys.time.claim('player_birthday').ok); assert.equal(nested.ok, false); assert.match(nested.message, /正在收好/); assert.equal(G.state.inventory.festival_birthday_cake, 1); assert.equal(G.state.calendar.claimed['2025:player_birthday'], true);
  at('2027-10-28'); assert.ok(G.sys.time.claim('player_birthday').ok); assert.equal(G.state.inventory.festival_birthday_cake, 2); assert.equal(G.state.calendar.claimed['2027:player_birthday'], true);
});
test('其余节日礼物与圣诞衣橱仍保留独立凭据，背包满时不会开始持久写入', () => {
  const { G } = setup(); G.sys.time.setDebug({ date: '2026-06-01' }); assert.ok(G.sys.time.claim('children_day').ok); assert.ok(G.state.calendar.claimed['2026:children_day']);
  G.sys.time.setDebug({ date: '2026-12-25' }); G.store.update(state => { state.inventory.festival_christmas_tree = 9999; }); const before = JSON.stringify(G.state), commit = G.save.commit; let commits = 0; G.save.commit = () => { commits++; return true; };
  assert.equal(G.sys.time.claim('christmas').ok, false); assert.equal(commits, 0); assert.equal(JSON.stringify(G.state), before);
  G.save.commit = commit; G.store.update(state => { state.inventory.festival_christmas_tree = 0; }); assert.ok(G.sys.time.claim('christmas').ok); assert.equal(G.state.avatar.owned.dress_winter, true); assert.equal(G.state.inventory.festival_christmas_tree, 1);
});
test('真实日历领奖成功先刷新再进生日舞台，const庆生闭包有效且只有一次旋律', () => {
  const s = calendarStage(), letter = s.G.ui.calendar.open('player_birthday'), celebrate = s.descendants(letter.element).find(node => node.textContent === '一起庆生'); assert.equal(celebrate.disabled, true);
  s.button('收下小礼物').click(); assert.deepEqual(s.calls, ['refresh', 'claim-celebrate']); assert.equal(letter.closed, true); assert.equal(s.G.state.inventory.festival_birthday_cake, 1); assert.equal(s.G.state.calendar.claimed['2026:player_birthday'], true); assert.deepEqual(s.sounds, ['birthday']); assert.equal(celebrate.disabled, false);
  const before = JSON.stringify(s.G.state); s.G.ui.birthday.close(); const replay = s.G.ui.calendar.open('player_birthday'); assert.equal(s.descendants(replay.element).find(node => node.textContent === '礼物收好啦').disabled, true); s.button('一起庆生').click(); assert.equal(replay.closed, true); assert.deepEqual(s.calls, ['refresh', 'claim-celebrate', 'replay-celebrate']); assert.deepEqual(s.sounds, ['birthday', 'birthday']); assert.equal(JSON.stringify(s.G.state), before);
});
test('真实日历保存失败留在信中，不进入表演，重试成功后才庆祝', () => {
  const s = calendarStage(), letter = s.G.ui.calendar.open('player_birthday'), before = JSON.stringify(s.G.state), commit = s.G.save.commit; s.G.save.commit = () => false;
  s.button('收下小礼物').click(); assert.deepEqual(s.calls, []); assert.equal(letter.closed, false); assert.equal(JSON.stringify(s.G.state), before); assert.equal(s.button('一起庆生').disabled, true); assert.equal(s.button('收下小礼物').disabled, false); assert.deepEqual(s.sounds, ['error']);
  s.G.save.commit = commit; s.button('收下小礼物').click(); assert.equal(letter.closed, true); assert.deepEqual(s.calls, ['refresh', 'claim-celebrate']); assert.deepEqual(s.sounds, ['error', 'birthday']);
});
test('真实日历圣诞衣橱闭包可更新领取状态并打开对应服饰，不误开生日舞台', () => {
  const s = calendarStage(); s.G.sys.time.setDebug({ date: '2026-12-25' }); const letter = s.G.ui.calendar.open('christmas'), wardrobe = s.button('去衣橱穿穿'); assert.equal(wardrobe.disabled, true);
  s.button('收下小礼物').click(); assert.equal(wardrobe.disabled, false); assert.deepEqual(s.calls, ['refresh']); assert.equal(s.G.state.avatar.owned.dress_winter, true); wardrobe.click(); assert.equal(letter.closed, true); assert.deepEqual(s.opened, ['avatar']); assert.deepEqual(s.sounds, ['success']);
});
console.log('\n' + passed + ' 组生日庆祝与保存检查通过。');
