'use strict';
// 第二批人物隔离检查：不监听HTTP、不启动浏览器、不读取用户小屋或私人存档。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const lookKeys = ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'];
const plain = value => JSON.parse(JSON.stringify(value));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(context, files) { for (const file of files) vm.runInContext(read(file), context, { filename: file }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function finite(value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), '绘图坐标必须有限'); else if (Array.isArray(value)) value.forEach(finite); }
class Context {
  constructor(gradients = true) { this.calls = []; this.gradients = []; this.depth = 0; if (!gradients) this.createRadialGradient = undefined; }
  save() { this.depth++; this.calls.push(['save', []]); }
  restore() { assert.ok(this.depth > 0, 'restore必须配对save'); this.depth--; this.calls.push(['restore', []]); }
  createRadialGradient(...args) {
    args.forEach(finite); const gradient = { args, stops: [], addColorStop(offset, color) { assert.ok(offset >= 0 && offset <= 1); assert.equal(typeof color, 'string'); this.stops.push([offset, color]); } };
    this.gradients.push(gradient); return gradient;
  }
}
for (const method of ['beginPath', 'ellipse', 'arc', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'closePath', 'translate', 'scale', 'rotate', 'setTransform', 'clearRect', 'drawImage']) {
  Context.prototype[method] = function (...args) { args.forEach(finite); this.calls.push([method, args, this.fillStyle, this.strokeStyle]); };
}
function renderer(options = {}) {
  const context = vm.createContext({ console }); context.window = context;
  load(context, ['js/core/namespace.js', 'js/data/outfits.js']);
  const G = context.Game, created = [];
  G.render = { preservedMarker: true }; G.draw = { preservedMarker: true };
  if (options.offscreen) context.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; this.context = new Context(options.gradients !== false); created.push(this); }
    getContext(type) { assert.equal(type, '2d'); return options.noContext ? null : this.context; }
  };
  const forbidden = name => () => { throw new Error('人物绘制不得访问' + name); };
  Object.defineProperty(G, 'state', { get: forbidden('G.state') });
  Object.defineProperty(G, 'store', { get: forbidden('G.store') });
  Object.defineProperty(context, 'localStorage', { get: forbidden('localStorage') });
  load(context, ['js/render/avatar.js']);
  return { G, context, created, api: G.render.characterVisual };
}
function system() {
  const context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context;
  load(context, ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/avatar.js', 'js/render/avatar.js']);
  const G = context.Game; G.store.init(); G.sys.init();
  return { G, context, parse(value) { return vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); } };
}
const calls = (c, name) => c.calls.filter(entry => entry[0] === name);
let groups = 0;
function test(name, fn) { fn(); groups++; console.log('✓ ' + name); }

test('八套ID/名称及九个外观字段与交付原型defaults逐项一致，只用初始五件衣物', () => {
  const { G } = renderer(), prototype = vm.createContext({}); prototype.window = prototype;
  load(prototype, ['prototype/characters.js']);
  const expected = [['preset_sunny', '阳光糖糖'], ['preset_pony', '元气小马'], ['preset_bun', '云朵团子'], ['preset_curl', '卷卷小熊'], ['preset_braid', '麦穗公主'], ['preset_bob', '薄荷波波'], ['preset_short', '清爽小橘'], ['preset_taro', '香芋刘海']];
  assert.deepEqual(plain(G.data.avatarPresets.map(p => [p.id, p.name])), expected);
  assert.deepEqual(plain(prototype.CottageCharacters.presets.map(p => [p.id, p.name])), expected);
  const fingerprints = new Set();
  for (const preset of G.data.avatarPresets) {
    const delivered = prototype.CottageCharacters.get(preset.id), look = G.data.avatarPresetLook(preset.id);
    assert.deepEqual(plain(look), plain(delivered.defaults), preset.id);
    assert.deepEqual(Object.keys(look).sort(), lookKeys.slice().sort());
    // 用户要求正式人物使用黄白浅肤色，原型旧色值不再是正式palette真值；skin ID和默认外观字段仍兼容。
    assert.equal(G.data.avatarSkins[look.skin].id, delivered.skinIndex);
    assert.match(G.data.avatarSkins[look.skin].color, /^#[A-F\d]{6}$/);
    assert.equal(look.shoes, 'shoes_mary');
    for (const id of [look.top, look.bottom, look.dress, look.shoes, ...look.acc].filter(Boolean)) assert.ok(G.data.avatarConfig.starterIds.includes(id), preset.id + ' 不得新增赠衣');
    assert.doesNotThrow(() => G.data.validateAvatar(Object.assign(G.data.defaultAvatar(), look)));
    fingerprints.add(G.data.avatarFingerprint(look));
  }
  assert.equal(fingerprints.size, 8); assert.equal(G.data.outfits.length, 60);
});

test('八套预设轮换保留全部已购衣物、三套搭配、钱包与小屋，JSON往返仍合法', () => {
  const { G, parse } = system(), sys = G.sys.avatar;
  G.store.update(state => { state.level = 12; state.wallet.coin = 2000; });
  for (const id of ['dress_daisy', 'top_berry', 'acc_glasses']) assert.equal(sys.buy(id).ok, true);
  assert.equal(sys.saveOutfit(0, '最初的草莓').ok, true);
  assert.equal(sys.equip('top_berry').ok, true); assert.equal(sys.equip('acc_glasses').ok, true); assert.equal(sys.saveOutfit(1, '出门的小衫').ok, true);
  assert.equal(sys.setHair('bob').ok, true); assert.equal(sys.saveOutfit(2, '圆圆波波').ok, true);
  const before = plain(G.state), owned = plain(G.state.avatar.owned), saved = plain(G.state.avatar.outfits);
  assert.equal(saved.length, 3); assert.ok(saved.every(Boolean));
  for (const preset of G.data.avatarPresets) {
    assert.equal(sys.applyPreset(preset.id).ok, true);
    assert.deepEqual(plain(G.state.avatar.owned), owned); assert.deepEqual(plain(G.state.avatar.outfits), saved);
    assert.deepEqual(plain(G.state.wallet), before.wallet); assert.deepEqual(plain(G.state.house), before.house); assert.deepEqual(plain(G.state.inventory), before.inventory);
    for (const key of lookKeys) assert.deepEqual(plain(G.state.avatar[key]), plain(preset[key]), preset.id + ':' + key);
    const roundTrip = G.data.validateAvatar(parse(G.state.avatar)); assert.deepEqual(plain(roundTrip), plain(G.state.avatar));
  }
  assert.equal(G.state.tutorial.seenTips.avatar_preset, true); assert.equal(sys.needsPreset(), false);
});

test('旧空衣橱和字符串配饰只补固定起始衣物，绘图不改旧对象或三格数据', () => {
  const { G, parse } = system(), old = parse(G.data.defaultAvatar()); old.owned = {}; old.acc = 'bow_red'; delete old.outfits;
  const before = JSON.stringify(old), coin = G.state.wallet.coin, migrated = G.data.validateAvatar(old);
  assert.deepEqual(Object.keys(migrated.owned).sort(), plain(G.data.avatarConfig.starterIds).sort());
  assert.deepEqual(plain(migrated.acc), ['bow_red']); assert.deepEqual(plain(migrated.outfits), []);
  const c = new Context(); G.draw.avatar(c, freeze(old), 20, 30, .55, { direct: true, still: true });
  assert.equal(c.depth, 0); assert.equal(JSON.stringify(old), before); assert.equal(G.state.wallet.coin, coin);
  assert.deepEqual(plain(G.data.validateAvatar(migrated)), plain(migrated));
});

test('原接口与独立adapter一致，冻结公开外观及avatar包装无需G.state/store/localStorage', () => {
  const { G, api } = renderer();
  assert.equal(api.version, 2); assert.equal(api.draw, G.draw.avatar); assert.equal(api.thumbnail, G.render.drawAvatar);
  assert.equal(G.render.preservedMarker, true); assert.equal(G.draw.preservedMarker, true);
  for (const preset of G.data.avatarPresets) {
    const publicLook = freeze(plain(G.data.avatarPresetLook(preset.id))), wrapped = freeze({ avatar: publicLook }), before = JSON.stringify(wrapped);
    for (const source of [publicLook, wrapped]) {
      const c = new Context(); api.draw(c, source, 71, 132, .55, { still: true, direct: true }); assert.equal(c.depth, 0); assert.ok(calls(c, 'fill').length > 10);
    }
    assert.equal(JSON.stringify(wrapped), before);
  }
});

test('十种发型/四肤色/六表情、裙装和短裤均产生有限且可区分的直接绘图', () => {
  const { G } = renderer(), base = G.data.avatarPresetLook('preset_sunny');
  for (const [list, field] of [[G.data.avatarHairStyles, 'hair'], [G.data.avatarSkins, 'skin'], [G.data.avatarFaces, 'face']]) {
    const signatures = new Set();
    for (const entry of list) {
      const c = new Context(); G.draw.avatar(c, freeze(Object.assign({}, base, { [field]: entry.id })), 0, 0, 1, { still: true, direct: true });
      assert.equal(c.depth, 0); assert.ok(c.gradients.length > 0); assert.ok(c.gradients.every(g => g.stops.length >= 2)); signatures.add(JSON.stringify(c.calls));
    }
    assert.equal(signatures.size, list.length, field + ' 不得共用同一绘制分支');
  }
  const dress = new Context(), shorts = new Context();
  G.draw.avatar(dress, base, 0, 0, 1, { still: true, direct: true });
  G.draw.avatar(shorts, Object.assign({}, base, { dress: null, top: 'top_cloud', bottom: 'bottom_cream' }), 0, 0, 1, { still: true, direct: true });
  assert.notEqual(JSON.stringify(dress.calls), JSON.stringify(shorts.calls));
  const overalls = new Context(); G.draw.avatar(overalls, Object.assign({}, base, { dress: null, top: 'top_cloud', bottom: 'bottom_pants' }), 0, 0, 1, { still: true, direct: true });
  const cloud = overalls.calls.findIndex(call => call[0] === 'ellipse' && call[1][0] === 0 && call[1][1] === -67);
  const bib = overalls.calls.findIndex(call => call[0] === 'roundRect' && call[1][0] === -13 && call[1][1] === -74);
  assert.ok(cloud >= 0 && bib > cloud, '森林背带裤围兜与肩带应在小衫前层，不能退化为普通长裤');
});

test('脚底定位、四档缩放、左右镜像与呼吸只通过外层变换，静止时不偏移', () => {
  const { G } = renderer(), look = G.data.avatarPresetLook('preset_pony');
  for (const size of [.25, .55, 1, 1.4]) for (const facing of [-1, 1, 'left']) {
    const c = new Context(); G.draw.avatar(c, look, 57, 98, size, { still: true, time: 123, facing, direct: true });
    assert.deepEqual(calls(c, 'translate')[0][1], [57, 98]);
    assert.deepEqual(calls(c, 'scale')[0][1], [size * (facing === -1 || facing === 'left' ? -1 : 1), size]); assert.equal(c.depth, 0);
  }
  const c = new Context(); G.draw.avatar(c, look, 57, 98, .55, { time: .7, direct: true });
  const translated = calls(c, 'translate')[0][1]; assert.equal(translated[0], 57); assert.ok(Math.abs(translated[1] - (98 + Math.sin(.7 * 2.2) * 1.3)) < 1e-10);
});

test('无OffscreenCanvas/无渐变/无drawImage仍可降级直接绘图，不留下缓存', () => {
  const { G, api } = renderer(), c = new Context(false); c.drawImage = undefined;
  G.draw.avatar(c, G.data.avatarPresetLook('preset_braid'), 1, 2, .55, { still: true });
  assert.equal(c.depth, 0); assert.ok(calls(c, 'fill').length > 10); assert.equal(c.gradients.length, 0); assert.equal(api.cacheInfo().size, 0);
  const missing = renderer({ offscreen: true, noContext: true }), other = new Context();
  missing.G.draw.avatar(other, missing.G.data.avatarPresetLook('preset_bob'), 0, 0, 1, { still: true });
  assert.equal(other.depth, 0); assert.ok(calls(other, 'fill').length > 10); assert.equal(missing.api.cacheInfo().size, 0);
});

test('缓存只按外观复用；移动/镜像/owned/三格改变不重烘焙，direct明确绕过缓存', () => {
  const { G, api, created } = renderer({ offscreen: true }), c = new Context(), look = G.data.avatarPresetLook('preset_curl');
  G.draw.avatar(c, look, 0, 0, .55, { still: true }); const first = calls(c, 'drawImage')[0][1][0];
  const full = Object.assign({}, look, { owned: { top_berry: true }, outfits: [{ name: '不影响外观' }] });
  G.draw.avatar(c, full, 140, 170, 1.4, { facing: 'left', time: 1 });
  assert.equal(calls(c, 'drawImage')[1][1][0], first); assert.equal(created.length, 1); assert.equal(api.cacheInfo().size, 1);
  assert.equal(created[0].context.depth, 0); assert.ok(created[0].context.gradients.length > 0);
  const direct = new Context(); G.draw.avatar(direct, look, 0, 0, 1, { direct: true, still: true });
  assert.equal(calls(direct, 'drawImage').length, 0); assert.ok(calls(direct, 'fill').length > 10); assert.equal(created.length, 1);
});

test('最多24份人物缓存，访问续用且淘汰最旧外观；clearCache可重复调用', () => {
  const { G, api } = renderer({ offscreen: true }), c = new Context(), base = G.data.avatarPresetLook('preset_sunny');
  const looks = Array.from({ length: 25 }, (_, i) => Object.assign({}, base, { skin: Math.floor(i / G.data.avatarHairStyles.length), hair: G.data.avatarHairStyles[i % G.data.avatarHairStyles.length].id }));
  const draw = look => { G.draw.avatar(c, look, 0, 0, 1, { still: true }); return calls(c, 'drawImage').at(-1)[1][0]; };
  const images = looks.slice(0, 24).map(draw); assert.equal(api.cacheInfo().size, 24); assert.equal(api.cacheInfo().max, 24);
  assert.equal(draw(looks[0]), images[0]); draw(looks[24]); assert.equal(api.cacheInfo().size, 24);
  assert.equal(draw(looks[0]), images[0], '最近使用的形象应保留'); assert.notEqual(draw(looks[1]), images[1], '最旧形象应重新烘焙');
  api.clearCache(); api.clearCache(); assert.equal(api.cacheInfo().size, 0);
});

test('缩略图使用CSS尺寸和DPR上限，脱离DOM用显式尺寸，空画布安全返回', () => {
  const { G, context } = renderer(), look = G.data.avatarPresetLook('preset_bun'); context.devicePixelRatio = 1.5;
  const c = new Context(), canvas = { getBoundingClientRect: () => ({ width: 120, height: 180 }), getContext: () => c };
  G.render.drawAvatar(canvas, look, { width: 500, height: 600 }); assert.equal(canvas.width, 180); assert.equal(canvas.height, 270); assert.equal(c.depth, 0);
  assert.deepEqual(calls(c, 'setTransform')[0][1], [1.5, 0, 0, 1.5, 0, 0]); assert.deepEqual(calls(c, 'clearRect')[0][1], [0, 0, 120, 180]);
  context.devicePixelRatio = 3; const fallback = { getBoundingClientRect: () => ({ width: 0, height: 0 }), getContext: () => new Context() };
  G.render.drawAvatar(fallback, look, { width: 100, height: 160 }); assert.equal(fallback.width, 200); assert.equal(fallback.height, 320);
  assert.doesNotThrow(() => G.render.drawAvatar(null, look)); assert.doesNotThrow(() => G.render.drawAvatar({ getContext: () => null }, look));
});

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.connected = false; }
  get classList() {
    const node = this, values = () => new Set(node.className.split(/\s+/).filter(Boolean));
    return { add(...names) { const list = values(); names.forEach(name => list.add(name)); node.className = [...list].join(' '); }, contains(name) { return values().has(name); }, toggle(name, enabled) { const list = values(), on = enabled === undefined ? !list.has(name) : !!enabled; if (on) list.add(name); else list.delete(name); node.className = [...list].join(' '); return on; } };
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({ target: this }); }
  get isConnected() { return this.connected || !!this.parentNode?.isConnected; }
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function picker() {
  const frames = [], drawn = [], applied = [], modals = [], notifications = [], context = vm.createContext({ console }); context.window = context;
  context.document = { createElement: tag => new Element(tag), getElementById: () => null }; context.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  load(context, ['js/core/namespace.js', 'js/data/outfits.js']); const G = context.Game; let randomCalls = 0, refreshes = 0;
  G.sys.avatar = { randomPresetId() { randomCalls++; return 'preset_bob'; }, current: () => G.data.defaultAvatar(), applyPreset(id) { applied.push(id); return { ok: true, message: id }; }, needsPreset: () => true };
  G.render = { drawAvatar(canvas, avatar, options) { drawn.push({ canvas, avatar: plain(avatar), options: plain(options) }); } };
  G.ui = { toast: message => notifications.push(message), audio: { play() {} }, refresh() { refreshes++; }, modal(options) { const element = new Element('dialog'); element.connected = true; element.append(options.content); const modal = { element, options, close() { options.onClose(); element.connected = false; } }; modals.push(modal); return modal; } };
  load(context, ['js/ui/avatar.js']);
  return { G, applied, modals, drawn, notifications, randomCalls: () => randomCalls, refreshes: () => refreshes, flush() { while (frames.length) frames.shift()(); } };
}
test('首次选择只随机一次；八卡名称/描述/选择状态可读，预览不应用或改变初始衣橱', () => {
  const env = picker(), modal = env.G.ui.avatar.pickPreset({ first: true }), all = descendants(modal.element), cards = all.filter(node => node.classList.contains('preset-card'));
  assert.equal(env.randomCalls(), 1); assert.equal(cards.length, 8); assert.equal(modal.element.classList.contains('character-picker-modal'), true);
  assert.equal(cards.filter(card => card.children.find(child => child.classList.contains('preset-check')).hidden === false).length, 1, '专用CSS未加载时也只显示一个勾选');
  assert.deepEqual(cards.filter(card => card.getAttribute('aria-pressed') === 'true').map(card => card.dataset.presetId), ['preset_bob']);
  for (const card of cards) { const p = env.G.data.avatarPresetById[card.dataset.presetId]; assert.ok(card.getAttribute('aria-label').includes(p.name)); assert.ok(card.getAttribute('aria-label').includes(env.G.data.avatarHairStyles.find(h => h.id === p.hair).name)); }
  const summary = all.find(node => node.getAttribute('role') === 'status'); assert.ok(summary); assert.equal(summary.getAttribute('aria-live'), 'polite'); assert.ok(summary.textContent.includes('薄荷波波'));
  env.flush(); assert.equal(env.drawn.length, 8); assert.equal(env.applied.length, 0);
  for (const picture of env.drawn) assert.deepEqual(picture.avatar.owned, plain(env.G.data.defaultAvatar().owned));
  cards.find(card => card.dataset.presetId === 'preset_braid').click();
  assert.equal(env.randomCalls(), 1); assert.equal(env.applied.length, 0); assert.ok(summary.textContent.includes('麦穗公主'));
  assert.deepEqual(cards.filter(card => card.getAttribute('aria-pressed') === 'true').map(card => card.dataset.presetId), ['preset_braid']);
});

test('首次关闭应用随机预选；选卡后关闭应用所选；确认再关闭只应用并通知一次', () => {
  const first = picker(); let firstDone = 0; const firstModal = first.G.ui.avatar.pickPreset({ first: true, onDone() { firstDone++; } });
  firstModal.close(); firstModal.close(); assert.deepEqual(first.applied, ['preset_bob']); assert.equal(firstDone, 1); assert.equal(first.refreshes(), 1);
  const selected = picker(), selectedModal = selected.G.ui.avatar.pickPreset({ first: true });
  descendants(selectedModal.element).find(node => node.dataset.presetId === 'preset_short').click(); selectedModal.close(); assert.deepEqual(selected.applied, ['preset_short']);
  const initial = picker(); let done = 0; const modal = initial.G.ui.avatar.pickPreset({ initial: 'preset_sunny', onDone() { done++; } });
  assert.equal(initial.randomCalls(), 0); const confirm = descendants(modal.element).find(node => node.tagName === 'button' && node.textContent === '换上这个形象'); assert.ok(confirm);
  confirm.click(); modal.close(); assert.deepEqual(initial.applied, ['preset_sunny']); assert.equal(done, 1); assert.equal(initial.notifications.length, 1); assert.equal(initial.refreshes(), 1);
});

console.log('\n' + groups + ' 组第二批人物映射、兼容、缓存与选择器检查通过（不替代浏览器视觉验收）。');
