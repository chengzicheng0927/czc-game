'use strict';
// MC-072：真实data/store/save、人工日期、合成入住档案、内存DOM与绘图委托。
// 不加载scene、不读私人档、不改设备时钟，不作浏览器像素/声音/触屏/读屏证明。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push([name, fn]);
const plain = value => JSON.parse(JSON.stringify(value));
function harness(options = {}) {
  let clock = new Date(2026, 3, 16, 12).getTime(), rafId = 0, modal = null, writes = 0;
  const nodes = [], frames = new Map(), documentEvents = new Map(), windowEvents = new Map(), mediaEvents = new Set(), busEvents = new Map();
  const storage = new Map(), sounds = [], portraits = [], avatars = [], operations = [], toasts = [], emits = [], handles = [], mutations = [];
  const add = (map, key, fn) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(fn); };
  const remove = (map, key, fn) => map.get(key)?.delete(fn);
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this._text = ''; this._disabled = false; this._hidden = false; this.width = 300; this.height = 150; this.scrollTop = 0; nodes.push(this); }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get hidden() { return this._hidden; }
    set hidden(value) { this._hidden = !!value; if (value && this.contains(document.activeElement)) document.activeElement = document.body; }
    get disabled() { return this._disabled; }
    set disabled(value) { this._disabled = !!value; if (value && document.activeElement === this) document.activeElement = document.body; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    set innerHTML(_) { assert.fail('生日舞台不得整段innerHTML重绘'); }
    append(...children) { children.forEach(node => { node.remove(); this.children.push(node); node.parentElement = this; }); }
    remove() { if (!this.parentElement) return; if (this.contains(document.activeElement)) document.activeElement = document.body; this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
    replaceChildren(...children) { this.children.forEach(node => { if (node.contains(document.activeElement)) document.activeElement = document.body; node.parentElement = null; }); this.children = []; this._text = ''; this.append(...children); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(key, fn) { add(this.listeners, key, fn); }
    removeEventListener(key, fn) { remove(this.listeners, key, fn); }
    dispatch(key) { [...(this.listeners.get(key) || [])].forEach(fn => fn({ target: this })); }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus(options) { let hidden = false; for (let n = this; n; n = n.parentElement) hidden ||= n.hidden; if (this.isConnected && !this.disabled && !hidden) { document.activeElement = this; if (!options?.preventScroll) for (let n = this.parentElement; n; n = n.parentElement) n.scrollTop = 0; } }
    get classList() { const names = () => new Set(this.className.split(/\s+/).filter(Boolean)); return { contains: name => names().has(name), add: (...values) => { const set = names(); values.forEach(v => set.add(v)); this.className = [...set].join(' '); }, toggle: (name, on) => { const set = names(), enabled = on === undefined ? !set.has(name) : on; if (enabled) set.add(name); else set.delete(name); this.className = [...set].join(' '); return enabled; } }; }
    getContext() { if (options.noCanvas) return null; if (!this.ctx) this.ctx = new Proxy({}, { get: (object, key) => key in object ? object[key] : (...args) => { args.forEach(arg => { if (typeof arg === 'number') assert.ok(Number.isFinite(arg), '绘图数字必须有效'); }); operations.push({ canvas: this, key, args }); }, set: (object, key, value) => { object[key] = value; return true; } }); return this.ctx; }
  }
  const document = { body: null, hidden: !!options.hidden, activeElement: null, createElement: tag => new Node(tag), addEventListener: (name, fn) => add(documentEvents, name, fn), removeEventListener: (name, fn) => remove(documentEvents, name, fn) };
  document.body = new Node('body'); document.activeElement = document.body;
  const media = { matches: !!options.reduced, addEventListener: (_, fn) => mediaEvents.add(fn), removeEventListener: (_, fn) => mediaEvents.delete(fn) };
  if (options.legacyMedia) { delete media.addEventListener; delete media.removeEventListener; media.addListener = fn => mediaEvents.add(fn); media.removeListener = fn => mediaEvents.delete(fn); }
  const context = vm.createContext({ console, Blob, URL, document, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    requestAnimationFrame: fn => { frames.set(++rafId, fn); return rafId; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout() { assert.fail('生日UI不得新增计时器'); }, setInterval() { assert.fail('生日UI不得轮询'); }, clearTimeout() {}, clearInterval() {} });
  context.window = context; context.devicePixelRatio = options.dpr || 1; context.matchMedia = () => media;
  context.addEventListener = (key, fn) => add(windowEvents, key, fn); context.removeEventListener = (key, fn) => remove(windowEvents, key, fn);
  context.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { writes++; storage.set(key, value); } };
  const files = ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/gifts.js','js/data/birthday.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game;
  G.store.init(); G.store.update(state => { state.profile.name = '小云朵'; state.profile.birthday = '04-16'; state.calendar.claimed['2026:player_birthday'] = true; state.inventory.festival_birthday_cake = 1; state.tutorial.done = true; });
  // 真实save.commit先生成有效原文；入住档案随后仅合成于内存，UI不得改动两者。
  assert.equal(G.save.commit(G.state), true); const raw = storage.get(G.data.balance.saveKey); storage.set(G.data.balance.saveKey, ' \n' + raw + '\n ');
  const ids = options.ids || G.data.residents.slice(0, options.count ?? 4).map(def => def.id);
  ids.forEach(id => { G.state.residents[id] = { movedIn: true }; });
  const update = G.store.update, commit = G.save.commit, flush = G.save.flush;
  G.store.update = (...args) => { mutations.push('update'); return update(...args); };
  G.save.commit = (...args) => { mutations.push('commit'); return commit(...args); };
  G.save.flush = (...args) => { mutations.push('flush'); return flush(...args); };
  const on = G.bus.on, emit = G.bus.emit;
  G.bus.on = (name, fn) => { add(busEvents, name, fn); const off = on(name, fn); return () => { remove(busEvents, name, fn); off(); }; };
  G.bus.emit = (name, value) => { emits.push(name); return emit(name, value); };
  G.audio = { play: name => sounds.push(name), stopBirthday: () => sounds.push('stopBirthday'), speak() { assert.fail('不能自动朗读'); } };
  G.render = {
    drawCharacter(canvas, id) { assert.ok(canvas.isConnected, '先挂载再画人物'); portraits.push({ canvas, id }); canvas.width = 192; canvas.height = 248; if (options.drawFails) throw new Error('绘图不可用'); },
    drawAvatar(canvas, avatar) { assert.ok(canvas.isConnected); avatars.push({ canvas, avatar, snapshot: plain(avatar) }); canvas.width = 192; canvas.height = 248; }
  };
  G.draw = { festival: { draw(c, def, x, y) { operations.push({ key: 'prop', def: plain(def), x, y }); } } };
  G.sys = { time: { claim() { assert.fail('生日舞台不能领取'); } } };
  G.ui = { toast: message => toasts.push(message), modal(options) {
    modal?.close(); const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), head = new Node('div'), body = new Node('div'), close = new Node('button');
    head.className = 'modal-head'; body.className = 'modal-body'; close.textContent = '关闭'; head.append(close); body.append(options.content); element.append(head, body); overlay.append(element); document.body.append(overlay);
    const handle = { element, body, options, closed: false, close() { if (handle.closed) return; handle.closed = true; overlay.remove(); if (modal === handle) modal = null; options.onClose?.(); if (previous.isConnected) previous.focus(); } };
    close.addEventListener('click', () => handle.close()); handles.push(handle); modal = handle;
    // 模拟共享modal下一帧自动聚焦，旧已脱离节点无法偷走新弹窗焦点。
    context.requestAnimationFrame(() => descendants(body).find(node => node.tagName === 'BUTTON' && !node.disabled)?.focus()); return handle;
  } };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/birthday.js'), 'utf8'), context, { filename: 'js/ui/birthday.js' });
  function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
  const node = cls => modal && descendants(modal.element).find(n => n.classList.contains(cls));
  const action = key => modal && descendants(modal.element).find(n => n.dataset.birthdayAction === key);
  const frame = now => { const pending = [...frames.entries()]; pending.forEach(([id, fn]) => { if (frames.delete(id)) fn(now); }); };
  const emitDocument = key => [...(documentEvents.get(key) || [])].forEach(fn => fn());
  return { G, context, document, media, nodes, frames, documentEvents, windowEvents, mediaEvents, busEvents, sounds, portraits, avatars, operations, toasts, storage, emits, handles, mutations, descendants, node, action, frame,
    get modal() { return modal; }, get writes() { return writes; }, open(opts = { fromClaim: true }) { const handle = G.ui.birthday.open(opts); frame(0); return handle; },
    at(date) { const [year, month, day] = date.split('-').map(Number); clock = new Date(year, month - 1, day, 12).getTime(); },
    visibility(hidden) { document.hidden = hidden; emitDocument('visibilitychange'); }, resize() { [...(windowEvents.get('resize') || [])].forEach(fn => fn()); },
    motion(value) { media.matches = value; [...mediaEvents].forEach(fn => fn()); },
    click(key) { const button = action(key); assert.ok(button, key); button.focus({ preventScroll: true }); button.click(); return button; }
  };
}
const plays = e => e.sounds.filter(name => name === 'birthday');
const snapshots = e => [JSON.stringify(e.G.state), e.storage.get(e.G.data.balance.saveKey), e.writes];
const checkClean = e => {
  assert.equal(e.frames.size, 0); assert.ok(e.nodes.filter(n => n.tagName === 'CANVAS').every(n => n.width === 0 && n.height === 0));
  assert.ok(e.nodes.filter(n => n.className === 'birthday-sprites').every(n => !n.isConnected));
  [e.documentEvents.get('visibilitychange'), e.windowEvents.get('resize'), e.busEvents.get('state:replace'), e.busEvents.get('time:change'), e.mediaEvents].forEach(set => assert.equal(set?.size || 0, 0));
};

test('公开open/available/close原合约，无persist与额外接口', () => { const e = harness(); assert.deepEqual(Object.keys(e.G.ui.birthday), ['open','available','close']); const modal = e.open(); assert.equal(e.G.ui.birthday.open(), modal); assert.equal(modal.options.persist, undefined); e.G.ui.birthday.close(); checkClean(e); });
test('真实本机月日与当年凭据共同门禁，未领/往年/空生日均不开', () => {
  for (const mode of ['unclaimed','old','empty','otherDay']) { const e = harness(); if (mode === 'unclaimed') delete e.G.state.calendar.claimed['2026:player_birthday']; if (mode === 'old') e.G.state.calendar.claimed = { '2025:player_birthday': true }; if (mode === 'empty') e.G.state.profile.birthday = ''; if (mode === 'otherDay') e.at('2026-04-17'); const before = snapshots(e); assert.equal(e.G.ui.birthday.available(), false); assert.equal(e.G.ui.birthday.open(), false); assert.equal(e.handles.length, 0); assert.equal(e.nodes.filter(n => n.tagName === 'CANVAS').length, 0); assert.equal(e.toasts.length, 1); assert.deepEqual(snapshots(e), before); }
});
test('timeDebug不能强开非当天或未收礼；日期不是原型10-30常量', () => { const e = harness(); e.G.runtime.timeDebug = { festival:'player_birthday', date:'2026-04-16' }; e.at('2026-10-30'); assert.equal(e.G.ui.birthday.open(), false); e.at('2026-04-16'); assert.ok(e.G.ui.birthday.available()); delete e.G.state.calendar.claimed['2026:player_birthday']; assert.equal(e.G.ui.birthday.open(), false); });
test('跨年份只接受当前年份凭据，闰年2-29真实日可进入', () => { const e = harness(); e.at('2027-04-16'); assert.equal(e.G.ui.birthday.available(), false); e.G.state.calendar.claimed['2027:player_birthday'] = true; assert.ok(e.G.ui.birthday.available()); e.at('2028-02-29'); e.G.state.profile.birthday = '02-29'; e.G.state.calendar.claimed['2028:player_birthday'] = true; assert.ok(e.open()); });
test('0人只糯米与玩家，禁用换祝词，姓名/空屋祝词完整', () => { const e = harness({ count:0 }); e.open(); assert.deepEqual(e.portraits.map(p => p.id), ['nuomi']); assert.equal(e.avatars.length, 1); assert.equal(e.action('next').disabled, true); assert.equal(e.frames.size, 0); assert.equal(e.node('birthday-words').textContent, e.G.data.birthdayParty.nuomi); assert.match(e.node('birthday-scroll').textContent, /今天有糯米和你/); e.action('next').dispatch('click'); assert.match(e.node('birthday-speaker').textContent, /1 \/ 1/); });
test('4位及乱序非连续入住取真实data顺序，不混未入住或未知id', () => {
  for (const ids of [undefined,['rainbow','lily','bobo','orange']]) { const e = harness(ids ? { ids } : {}); e.G.state.residents.unknown = { movedIn:true }; e.G.state.residents.pudding = { movedIn:!ids }; const expected = e.G.data.residents.filter(def => e.G.state.residents[def.id]?.movedIn); e.open(); assert.deepEqual(e.portraits.map(p => p.id), [...expected.map(p => p.id), 'nuomi']); assert.equal(e.avatars[0].avatar, e.G.state.avatar); assert.equal(e.node('birthday-guests').textContent, '今天的朋友：' + expected.map(p => p.name).join('、') + '。'); }
});
test('12真实祝词从糯米逐客循环，当前说话者名牌有标记，不自动奏曲朗读', () => {
  const e = harness({ count:12 }); e.open(); const defs = e.G.data.residents; assert.equal(e.portraits.length, 13); assert.ok(e.node('birthday-theatre').classList.contains('birthday-many'));
  for (let i = 0; i < 13; i++) { const def = i === 0 ? { name:'糯米', id:'nuomi' } : defs[i - 1]; assert.equal(e.node('birthday-speaker').textContent, def.name + '的祝福 · ' + (i + 1) + ' / 13'); assert.equal(e.node('birthday-words').textContent, i === 0 ? e.G.data.birthdayParty.nuomi : e.G.data.birthdayParty.blessings[def.id]); const marked = e.descendants(e.modal.element).filter(n => n.classList.contains('is-speaking')); assert.deepEqual(marked.map(n => n.dataset.birthdayGuest), i === 0 ? [] : [def.id]); e.click('next'); }
  assert.equal(e.node('birthday-words').textContent, e.G.data.birthdayParty.nuomi); assert.equal(plays(e).length, 0);
});
test('长玩家名/长来宾名/长祝词与换行原文安全进入textContent', () => { const e = harness({ count:1 }); const name = '<朋友&名字>完整称呼', words = '愿每一天都能慢慢说完。'.repeat(70) + '\n最后一行也要保留。'; e.G.state.profile.name = '<小云朵&伙伴>'; e.G.data.residents[0].name = name; e.G.data.birthdayParty.blessings.lily = words; e.open(); e.click('next'); assert.equal(e.node('birthday-words').textContent, words); assert.ok(e.node('birthday-speaker').textContent.startsWith(name)); assert.equal(e.node('birthday-player-name').textContent, '<小云朵&伙伴>'); assert.equal(e.node('birthday-name').textContent, name); });
test('开场捕获姓名/入住子集/祝词，普通state更新不冒充换档', () => { const e = harness({ count:1 }); e.open(); const before = e.node('birthday-guests').textContent, words = e.G.data.birthdayParty.blessings.lily; e.G.state = plain(e.G.state); e.G.state.profile.name = '新名字'; e.G.state.residents.rainbow = { movedIn:true }; e.G.data.birthdayParty.blessings.lily = '后改内容'; e.G.bus.emit('state:change', e.G.state); e.click('next'); assert.equal(e.node('birthday-guests').textContent, before); assert.equal(e.node('birthday-words').textContent, words); assert.equal(e.node('birthday-player-name').textContent, '小云朵'); assert.equal(e.avatars.length, 1); });
test('祝词区在舞台前，三个动作在独立滚动容器之外，live只读正文', () => { const e = harness(); e.open(); const scroll = e.node('birthday-scroll'), party = e.node('birthday-party'); assert.deepEqual(party.children.map(n => n.className), ['birthday-scroll','birthday-actions']); assert.ok(scroll.children.indexOf(e.node('birthday-blessing')) < scroll.children.indexOf(e.node('birthday-theatre'))); assert.equal(e.node('birthday-message').getAttribute('aria-live'), 'polite'); assert.equal(e.node('birthday-message').getAttribute('aria-atomic'), 'true'); assert.ok(!e.node('birthday-message').contains(e.action('next'))); });
test('切换13句与重唱不移除/隐藏/禁用焦点按钮，保留各滚动位置', () => { const e = harness({ count:12 }); e.open(); const next = e.action('next'), scroll = e.node('birthday-scroll'), message = e.node('birthday-message'); scroll.scrollTop = 173; e.modal.body.scrollTop = 19; for (let i=0;i<14;i++) { e.click('next'); assert.equal(e.document.activeElement, next); assert.equal(e.action('next'), next); assert.equal(e.node('birthday-message'), message); assert.equal(next.disabled, false); assert.equal(scroll.scrollTop, 173); assert.equal(e.modal.body.scrollTop, 19); } e.click('replay'); assert.equal(e.document.activeElement, e.action('replay')); assert.equal(scroll.scrollTop, 173); });
test('fromClaim无开场曲，重复open复用handle且不叠曲，手动重开各一次', () => { const e = harness(); const first = e.open(); assert.equal(plays(e).length, 0); assert.equal(e.G.ui.birthday.open({ fromClaim:false }), first); assert.equal(plays(e).length, 0); e.click('replay'); assert.equal(plays(e).length, 1); e.click('close'); e.open({}); assert.equal(plays(e).length, 2); e.G.ui.birthday.open({ fromClaim:true }); assert.equal(plays(e).length, 2); });
test('真实save.commit原文含空白逐字保持，所有舞台操作与重开不写状态/发奖/回忆', () => { for (const count of [0,4,12]) { const e = harness({ count }), before = snapshots(e); assert.ok(before[1].startsWith(' \n')); e.open(); for (let i=0;i<14;i++) e.click('next'); e.click('replay'); e.G.ui.birthday.open(); e.visibility(true); e.visibility(false); e.click('close'); e.open({}); e.G.ui.birthday.close(); assert.deepEqual(snapshots(e), before); assert.deepEqual(e.mutations, []); assert.deepEqual(e.emits, []); checkClean(e); } });
test('静音不改变祝词推进或新增奖励，沿原play委托不自建音频', () => { const e = harness(); e.G.state.settings.music = 0; e.G.state.settings.sfx = 0; const before = snapshots(e); e.open({}); e.click('replay'); e.click('next'); assert.equal(plays(e).length, 2); assert.match(e.node('birthday-speaker').textContent, /莉莉/); assert.deepEqual(snapshots(e), before); });
test('动画绘制最多12fps，角色插图只初始化一次，皇冠蛋糕只作道具', () => { const e = harness(); e.open(); const stage = e.node('birthday-stage'), draws = () => e.operations.filter(op => op.canvas === stage && op.key === 'clearRect').length; assert.equal(draws(), 1); [16,32,64].forEach(e.frame); assert.equal(draws(), 1); e.frame(84); assert.equal(draws(), 2); e.frame(100); assert.equal(draws(), 2); assert.equal(e.portraits.length, 5); assert.deepEqual([...new Set(e.operations.filter(op => op.key === 'prop').map(op => op.def.motif))], ['birthday_cake','birthday_crown']); });
test('后台停RAF与生日曲，旧按钮后台不播，恢复只重画不唱', () => { const e = harness(); e.open({}); const count = plays(e).length, stage = e.node('birthday-stage'); e.visibility(true); assert.equal(e.frames.size, 0); assert.equal(e.sounds.at(-1), 'stopBirthday'); const draws = e.operations.filter(op => op.canvas === stage).length; e.click('replay'); e.frame(500); assert.equal(e.operations.filter(op => op.canvas === stage).length, draws); assert.equal(plays(e).length, count); e.visibility(false); assert.equal(e.frames.size, 1); assert.equal(plays(e).length, count); });
test('后台首次打开连角色/说话者/蛋糕均不绘制，前台恢复不自动唱', () => { const e = harness({ hidden:true }); e.open({}); assert.equal(e.frames.size, 0); assert.equal(plays(e).length, 0); assert.equal(e.portraits.length, 0); assert.equal(e.avatars.length, 0); assert.equal(e.operations.length, 0); e.click('next'); assert.equal(e.operations.length, 0); e.visibility(false); assert.equal(e.portraits.length, 5); assert.ok(e.operations.length > 0); assert.equal(plays(e).length, 0); assert.equal(e.frames.size, 1); });
test('0人及减少动态入场静态，换句/重唱仍可用', () => { for (const options of [{ count:0 },{ reduced:true }]) { const e = harness(options); e.open(); assert.equal(e.frames.size, 0); e.click('next'); e.click('replay'); assert.equal(plays(e).length, 1); assert.equal(e.frames.size, 0); } });
test('动态偏好即时切换及旧式媒体监听均释放，取消过的帧不重复排队', () => { for (const legacyMedia of [false,true]) { const e = harness({ legacyMedia }); e.open(); const late = [...e.frames.values()]; e.motion(true); assert.equal(e.frames.size, 0); assert.ok(e.node('birthday-portrait').style.transform === 'none'); e.motion(false); assert.equal(e.frames.size, 1); late.forEach(fn => fn(120)); assert.equal(e.frames.size, 1); e.G.ui.birthday.close(); checkClean(e); } });
test('关闭/收好/换档各释放全部Canvas像素、holder、监听和音频，只清一次', () => { for (const exit of ['api','button','modal','replace']) { const e = harness({ count:12 }); const handle = e.open(); if (exit === 'api') e.G.ui.birthday.close(); if (exit === 'button') e.click('close'); if (exit === 'modal') handle.close(); if (exit === 'replace') e.G.bus.emit('state:replace', {}); assert.equal(handle.closed, true); assert.equal(e.modal, null); checkClean(e); const stopped = e.sounds.filter(n => n === 'stopBirthday').length; handle.options.onClose(); e.G.ui.birthday.close(); assert.equal(e.sounds.filter(n => n === 'stopBirthday').length, stopped); } });
test('跨日time事件/下一帧/resize/恢复/重唱/换祝词/重复open均关闭失效舞台', () => { for (const trigger of ['event','frame','resize','visibility','replay','next','open']) { const e = harness(), handle = e.open(); e.at('2026-04-17'); if (trigger === 'event') e.G.bus.emit('time:change', {}); if (trigger === 'frame') e.frame(100); if (trigger === 'resize') e.resize(); if (trigger === 'visibility') e.visibility(false); if (trigger === 'replay' || trigger === 'next') e.click(trigger); if (trigger === 'open') assert.equal(e.G.ui.birthday.open(), false); assert.equal(handle.closed, true, trigger); assert.equal(plays(e).length, 0); checkClean(e); } });
test('减少动态/0人无轮询，跨日由原time事件关闭；凭据删除同样失效', () => { for (const options of [{ count:0 },{ reduced:true }]) { const e = harness(options), handle = e.open(); e.at('2026-04-17'); e.G.bus.emit('time:change', {}); assert.equal(handle.closed, true); checkClean(e); } const e = harness(), handle = e.open(); delete e.G.state.calendar.claimed['2026:player_birthday']; e.click('next'); assert.equal(handle.closed, true); checkClean(e); });
test('旧按钮/旧onClose/旧resize与visibility/迟到RAF均不干扰新场', () => {
  const e = harness(); const old = e.open(), buttons = ['replay','next','close'].map(e.action), lateFrames = [...e.frames.values()], lateResize = [...e.windowEvents.get('resize')], lateVisibility = [...e.documentEvents.get('visibilitychange')], lateMedia = [...e.mediaEvents];
  e.G.bus.emit('state:replace', {}); const fresh = e.open({}), before = snapshots(e), audio = [...e.sounds], pending = e.frames.size; e.action('next').focus({ preventScroll:true }); const focus = e.document.activeElement;
  buttons.forEach(n => { assert.equal(n.listeners.get('click').size, 0); n.dispatch('click'); }); old.options.onClose(); old.close(); [...lateFrames,...lateResize,...lateVisibility,...lateMedia].forEach(fn => fn(200));
  assert.equal(e.G.ui.birthday.open(), fresh); assert.equal(fresh.closed, false); assert.deepEqual(e.sounds, audio); assert.deepEqual(snapshots(e), before); assert.equal(e.frames.size, pending); assert.equal(e.document.activeElement, focus);
});
test('同场取消过的后台帧返回后无重复RAF，旧头像像素不再绘制', () => { const e = harness(); e.open(); const late = [...e.frames.values()]; e.visibility(true); e.visibility(false); late.forEach(fn => fn(200)); assert.equal(e.frames.size, 1); const stage = e.node('birthday-stage'); e.G.ui.birthday.close(); const operations = e.operations.length; late.forEach(fn => fn(300)); e.resize(); assert.equal(e.operations.length, operations); assert.equal(stage.width, 0); });
test('绘图委托失败保持祝词姓名/三个动作可用，清理依然完整', () => { const e = harness({ drawFails:true }); e.open(); assert.match(e.node('birthday-art-note').textContent, /祝福仍可完整阅读/); e.click('next'); assert.equal(e.node('birthday-words').textContent, e.G.data.birthdayParty.blessings.lily); e.click('close'); checkClean(e); });
test('DPR按上限2分配主图、当前说话者和蛋糕，关闭一律归零', () => { const e = harness({ dpr:3 }); e.open(); assert.equal(e.node('birthday-stage').width, 240); assert.equal(e.node('birthday-speaker-art').width, 144); assert.equal(e.node('birthday-cake').width, 260); e.G.ui.birthday.close(); checkClean(e); });
test('CSS仅birthday作用域，手机三动作48px、长文本换行和内部滚动规则齐全', () => {
  const css = fs.readFileSync(path.join(root,'css/birthday.css'),'utf8'), js = fs.readFileSync(path.join(root,'js/ui/birthday.js'),'utf8');
  assert.match(css, /\.birthday-modal-card \.modal-body\s*\{[^}]*overflow:hidden/); assert.match(css, /\.birthday-scroll\s*\{[^}]*min-height:0[^}]*overflow-y:auto/); assert.match(css, /\.birthday-actions\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)[^}]*flex-shrink:0/); assert.match(css, /\.birthday-actions \.ui-button\s*\{[^}]*min-height:48px/); assert.match(css, /overflow-wrap:anywhere/); assert.match(css, /white-space:pre-wrap/); assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /max-height:540px/); assert.match(css, /:focus-visible/);
  for (const match of css.matchAll(/^\s*([^@/{}\s][^{}\n]*)\{/gm)) assert.ok(match[1].trim().startsWith('.birthday-'), match[1]);
  assert.doesNotMatch(js, /innerHTML\s*=|setInterval\s*\(|setTimeout\s*\(|store\.update\s*\(|persist\s*:|\.claim\s*\(|festival:claimed|\.speak\s*\(/);
});
let passed = 0;
for (const [name, fn] of tests) { fn(); passed++; console.log('✓ ' + name); }
console.log('\n' + passed + ' 组生日UI隔离检查通过（非正式像素/听感/设备验收）。');
