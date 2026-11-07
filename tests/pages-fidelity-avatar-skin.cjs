'use strict';
// 黄白浅肤色映射：真实data/2D/3D/公开人物绘制与内存旧档，不打开服务、不接触私人档案。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function load(context, files) { for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
function sandbox() {
  const context = vm.createContext({ console, document: { hidden: false, addEventListener() {}, removeEventListener() {} } }); context.window = context;
  const forbidden = () => { throw new Error('人物颜色验证不得读取私人档案或联网'); };
  Object.defineProperty(context, 'localStorage', { get: forbidden }); context.fetch = forbidden;
  load(context, ['js/core/namespace.js', 'js/data/outfits.js', 'js/render/avatar.js', 'js/render/world3d-models.js', 'js/render/live-avatars.js', 'js/render/live-peers.js']);
  Object.defineProperty(context.Game, 'state', { get: forbidden }); Object.defineProperty(context.Game, 'store', { get: forbidden });
  return context.Game;
}
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function look(G, skin) { return Object.assign(G.data.defaultAvatar(), { skin }); }
function warm(color) {
  assert.match(color, /^#[\da-f]{6}$/i);
  const [r, g, b] = color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255), high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  const hue = ((g - b) / delta) * 60, lightness = (high + low) / 2;
  assert.ok(r > g && g > b, '浅肤色保留轻微暖调的通道次序');
  assert.ok(hue >= 20 && hue <= 35, '浅肤色保留自然暖调，避免偏绿黄');
  assert.ok(lightness >= .89 && lightness <= .97, '四个旧ID均应呈黄白浅肤色');
  assert.ok(delta >= .07 && delta <= .15, '通道跨度保持轻微暖调，避免浓黄或土黄色');
}
class Paint {
  constructor() { this.fills = []; this.shapes = []; }
  beginPath() { this.shapes = []; }
  ellipse(...args) { this.shapes.push({ type: 'ellipse', args }); }
  fill() { this.fills.push({ shapes: this.shapes.slice(), color: this.fillStyle }); }
  measureText(value) { return { width: [...String(value)].length * 8 }; }
}
for (const name of ['save', 'restore', 'roundRect', 'moveTo', 'lineTo', 'closePath', 'stroke', 'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo', 'translate', 'scale', 'rotate', 'setTransform', 'clearRect', 'drawImage', 'fillText', 'rect']) Paint.prototype[name] = function () {};
function headColors(context) {
  return context.fills.filter(fill => fill.shapes.some(shape => shape.type === 'ellipse' && shape.args[0] === 0 && shape.args[1] === -120 && shape.args[2] === 29.5)).map(fill => fill.color);
}
function geometry() {
  const calls = [], mesh = {};
  for (const name of ['sphere', 'box', 'cylinder', 'cone', 'torus', 'triangle']) mesh[name] = (...args) => calls.push({ name, args });
  return { mesh, calls };
}

test('0–3旧ID保持四个相近的黄白浅肤色选项', () => {
  const G = sandbox(); assert.deepEqual(plain(G.data.avatarSkins.map(row => row.id)), [0, 1, 2, 3]);
  G.data.avatarSkins.forEach(row => warm(row.color));
  assert.equal(new Set(G.data.avatarSkins.map(row => row.color)).size, 4, '仍保留四个可选的细微色调');
});
test('四个旧skin ID及三套搭配JSON往返不迁移、不改写拥有记录或输入对象', () => {
  const G = sandbox(), D = G.data;
  for (let skin = 0; skin < 4; skin++) {
    const source = look(G, skin); source.owned.dress_daisy = true;
    source.outfits = Array.from({ length: 3 }, (_, slot) => Object.assign({ name: '旧搭配' + slot }, D.avatarPresetLook(D.avatarPresets[slot].id), { skin: (skin + slot) % 4 }));
    const json = JSON.stringify(source), validated = D.validateAvatar(JSON.parse(json));
    assert.equal(validated.skin, skin); assert.deepEqual(plain(validated.owned), plain(source.owned)); assert.deepEqual(plain(validated.outfits), plain(source.outfits)); assert.equal(JSON.stringify(source), json);
    assert.deepEqual(plain(D.validateAvatar(JSON.parse(JSON.stringify(validated)))), plain(validated));
  }
  for (const skin of [-1, 4, '3', null]) assert.throws(() => D.validateAvatar(Object.assign(D.defaultAvatar(), { skin })), '非法ID继续拒绝');
});
test('8预设外观和指纹保留，正式2D与3D均使用各自旧ID对应的新色表', () => {
  const G = sandbox(), D = G.data, fingerprints = new Set(); assert.equal(D.avatarPresets.length, 8);
  for (const preset of D.avatarPresets) {
    const avatar = freeze(Object.assign(D.defaultAvatar(), D.avatarPresetLook(preset.id))), before = JSON.stringify(avatar), c = new Paint(), mesh = geometry();
    G.draw.avatar(c, avatar, 0, 0, 1, { direct: true, still: true });
    assert.deepEqual(headColors(c), [D.avatarSkins[preset.skin].color]);
    const model = G.world3dModels.character(mesh.mesh, avatar, [0, 0, 0], 1);
    assert.equal(model.skin, D.avatarSkins[preset.skin].color); warm(model.skin);
    const head = mesh.calls.find(call => call.name === 'sphere' && call.args[0][0] === 0 && call.args[0][1] === 1.19 && call.args[1][0] === .31);
    assert.ok(head, '3D真实头部几何存在'); assert.equal(head.args[2], model.skin, '3D实际面部几何使用新色值');
    assert.equal(JSON.stringify(avatar), before); fingerprints.add(D.avatarFingerprint(avatar));
  }
  assert.equal(fingerprints.size, 8);
});
test('2D主场景/衣橱全身缩略图对四个旧ID取色一致且不读取Game.state', () => {
  const G = sandbox();
  for (let skin = 0; skin < 4; skin++) {
    const avatar = freeze(look(G, skin)), main = new Paint(), thumbnail = new Paint();
    G.draw.avatar(main, avatar, 35, 70, .55, { direct: true, still: true });
    const canvas = { getContext: () => thumbnail, getBoundingClientRect: () => ({ width: 112, height: 150 }) };
    G.render.drawAvatar(canvas, avatar, { direct: true });
    assert.deepEqual(headColors(main), [G.data.avatarSkins[skin].color]); assert.deepEqual(headColors(thumbnail), headColors(main));
  }
});
test('主页面公开同屋人物沿用公开avatar旧ID、黄白浅肤色与原名牌，不改peer对象', () => {
  const G = sandbox(), house = freeze({ floors: [{ slots: [] }], rooms: {} }), peers = freeze(Array.from({ length: 4 }, (_, skin) => ({ id: 'public_' + skin, displayName: '公开小伙伴' + skin, zone: 'yard', x: .2 + skin * .15, y: .5, avatar: look(G, skin) }))), before = JSON.stringify(peers), c = new Paint();
  G.livePeers.set(peers, peers[0].id); assert.equal(G.livePeers.count(), 4); G.livePeers.draw(c, { house, time: 0, delta: 0, reducedMotion: true, scale: 1 });
  assert.deepEqual(headColors(c).sort(), plain(G.data.avatarSkins.map(row => row.color)).sort()); assert.equal(JSON.stringify(peers), before); G.livePeers.clear(); assert.equal(G.livePeers.count(), 0);
});
test('独立参观页公开人物也默认委托同一2D色表，销毁后停止绘制', () => {
  const G = sandbox(), c = new Paint(), canvas = { width: 960, height: 720, clientWidth: 960, getContext: () => c }, house = freeze({ floors: [{ slots: [] }], rooms: {} });
  const peers = freeze(Array.from({ length: 4 }, (_, skin) => ({ id: 'visitor_' + skin, displayName: '参观伙伴' + skin, zone: 'yard', x: .2 + skin * .15, y: .5, avatar: look(G, skin) }))), before = JSON.stringify(peers);
  const view = G.liveAvatars.view(house, null, 960, 720), renderer = G.liveAvatars.create({ canvas, background: {}, house, view, reducedMotion: true, now: () => 1000 });
  renderer.update(peers, peers[0].id); assert.deepEqual(headColors(c).sort(), plain(G.data.avatarSkins.map(row => row.color)).sort()); assert.equal(JSON.stringify(peers), before);
  const count = c.fills.length; renderer.destroy(); renderer.update(peers, peers[0].id); renderer.redraw(); assert.equal(c.fills.length, count);
});
console.log(passed + ' 组黄白浅肤色兼容与真实绘制检查通过（内存/绘图参数，不替代正式像素与设备验收）。');
