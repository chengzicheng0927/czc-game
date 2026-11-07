'use strict';
// 真实Canvas入口的绘图指令/状态验证；不创建浏览器、服务或动画循环。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
class Context {
  constructor() { this.calls = []; this.depth = 0; this.stack = []; this.globalAlpha = 1; }
  save() { this.depth++; this.stack.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); }
  restore() { this.depth--; assert.ok(this.depth >= 0); Object.assign(this, this.stack.pop()); }
  measureText(text) { return { width: [...String(text)].length * 10 }; }
  createLinearGradient(...args) { args.forEach(value => assert.ok(Number.isFinite(value))); return { addColorStop() {} }; }
  createRadialGradient(...args) { return this.createLinearGradient(...args); }
}
for (const method of ['beginPath', 'ellipse', 'roundRect', 'fill', 'stroke', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'rect', 'clip', 'translate', 'rotate', 'scale', 'setTransform', 'clearRect', 'fillRect', 'fillText', 'strokeText', 'drawImage', 'setLineDash']) Context.prototype[method] = function (...args) { args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), method + ': ' + value); }); this.calls.push([method, args.map(value => typeof value === 'object' ? 'image' : value), this.fillStyle, this.strokeStyle]); };
function canvas(width = 1280, height = 960) { const context = new Context(); return { width, height, context, getContext(type) { assert.equal(type, '2d'); return context; } }; }
function setup() {
  const surfaces = [], document = { hidden: false, addEventListener() {}, createElement(tag) { assert.equal(tag, 'canvas'); const value = canvas(0, 0); surfaces.push(value); return value; } };
  const c = vm.createContext({ console, document, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); c.window = c;
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/photography.js', 'js/data/creative.js', 'js/data/observatory.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/systems/creative.js', 'js/render/creative.js', 'js/render/room-space.js', 'js/render/room-shell.js', 'js/render/photo-decoration.js', 'js/render/observatory.js', 'js/render/scene.js'].forEach(run);
  c.Game.store.init(); return { G: c.Game, surfaces };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('8种本地相框加无框各有绘图结果，保持画布状态且不修改底图/装饰', () => {
  const { G } = setup(), base = canvas(), signatures = new Set(); assert.equal(G.data.photoFrames.length, 9); assert.equal(G.data.photoStickers.length, 20);
  for (const def of G.data.photoFrames) {
    const target = canvas(), decor = { frame: def.id, caption: '今天也住着小小的幸福🌷', stickers: [] }, before = JSON.stringify(decor);
    assert.equal(G.draw.photoDecoration.draw(target, base, decor), target); assert.equal(target.context.depth, 0); assert.equal(base.context.calls.length, 0); assert.equal(JSON.stringify(decor), before); signatures.add(JSON.stringify(target.context.calls));
  }
  assert.equal(signatures.size, 9);
});
test('20贴纸按归一化坐标与缩放绘制，命中边界与预览/导出比例一致', () => {
  const { G } = setup(), target = canvas(), stickers = G.data.photoStickers.map((def, index) => ({ uid: 'sticker_' + index, stickerId: def.id, x: index / 19, y: 1 - index / 19, scale: index % 2 ? .4 : 3 }));
  G.draw.photoDecoration.draw(target, canvas(), { frame: 'none', caption: '', stickers }); assert.equal(target.context.calls.filter(call => call[0] === 'fillText').length, 20); assert.equal(target.context.depth, 0);
  for (const sticker of stickers) { const large = G.draw.photoDecoration.stickerBox(sticker, 1280, 960), small = G.draw.photoDecoration.stickerBox(sticker, 480, 360); assert.ok(Math.abs(large.x * .375 - small.x) < 1e-8); assert.ok(Math.abs(large.w * .375 - small.w) < 1e-8); assert.ok(Math.abs(large.x + large.w / 2 - sticker.x * 1280) < 1e-8); }
});
test('装饰严格边界：30个码点合法，隐藏键/重复uid/非法类型和控制字符全部拒绝', () => {
  const { G } = setup(), valid = { frame: 'cream', caption: '🌷'.repeat(30), stickers: [{ uid: 'one', stickerId: 'heart', x: 0, y: 1, scale: .4 }] };
  const copy = G.data.validatePhotoDecor(valid); copy.stickers[0].x = .9; assert.equal(valid.stickers[0].x, 0);
  for (const mutate of [d => d.frame = 'unknown', d => d.caption += '🌷', d => d.caption = '两\n行', d => d.caption = '\u007f', d => d.extra = true, d => d.stickers.push(JSON.parse(JSON.stringify(d.stickers[0]))), d => d.stickers[0].x = NaN, d => d.stickers[0].y = 1.01, d => d.stickers[0].scale = 3.01, d => d.stickers[0].stickerId = 'missing', d => d.stickers[0].uid = '', d => d.stickers[0].extra = true]) { const value = JSON.parse(JSON.stringify(valid)); mutate(value); assert.throws(() => G.data.validatePhotoDecor(value)); }
});
test('真实离屏整屋1280×960包含场景，不画建造/选择提示，不变更存档和主镜头', () => {
  const { G, surfaces } = setup(), room = G.sys.building.buildRoom(0, 0, 'bedroom'); assert.ok(room.ok); G.runtime.activeRoomId = room.roomId; G.runtime.placing = 'bed_basic'; G.render.camera.x = 31; G.render.camera.y = -97; G.render.camera.scale = .63;
  const before = JSON.stringify(G.state), runtime = JSON.stringify(G.runtime), camera = JSON.stringify(G.render.camera), projected = JSON.stringify(G.render.camera.worldToScreen(100, 80));
  const photo = G.render.captureScene({ scope: 'house' }); assert.equal(photo.width, 1280); assert.equal(photo.height, 960); assert.equal(photo.context.depth, 0); assert.ok(photo.context.calls.length > 100);
  assert.equal(JSON.stringify(G.state), before); assert.equal(JSON.stringify(G.runtime), runtime); assert.equal(JSON.stringify(G.render.camera), camera); assert.equal(JSON.stringify(G.render.camera.worldToScreen(100, 80)), projected);
  assert.ok(!photo.context.calls.some(call => call[0] === 'fillText' && /点击建造|第一间|点击前院|点地面选/.test(call[1][0]))); assert.ok(surfaces.length >= 2);
});
test('房间取景实际绘制本房间居民和玩家，人物位置/主镜头保持，异常也还原', () => {
  const { G } = setup(), room = G.sys.building.buildRoom(0, 0, 'bedroom').roomId, actors = [];
  G.state.residents.lily = { movedIn: true, roomId: room, heartBubbles: 1 };
  G.draw.residentExtra = (c, id, x, y, scale) => { actors.push({ id, x, y, scale }); return true; }; G.draw.avatar = (c, avatar, x, y, scale) => { actors.push({ id: 'player', x, y, scale }); };
  const before = JSON.stringify(G.state), projected = JSON.stringify(G.render.camera.worldToScreen(10, 20));
  const photo = G.render.captureScene({ scope: 'room', roomId: room }); assert.equal(photo.context.depth, 0); assert.deepEqual(actors.map(actor => actor.id).sort(), ['lily', 'player']); const positions = JSON.stringify(actors); actors.length = 0;
  G.render.captureScene({ scope: 'room', roomId: room }); assert.equal(JSON.stringify(actors), positions); assert.equal(JSON.stringify(G.state), before); assert.equal(JSON.stringify(G.render.camera.worldToScreen(10, 20)), projected);
  G.draw.avatar = () => { throw new Error('drawing failed'); }; assert.throws(() => G.render.captureScene({ scope: 'room', roomId: room }), /drawing failed/); assert.equal(JSON.stringify(G.state), before); assert.equal(JSON.stringify(G.render.camera.worldToScreen(10, 20)), projected);
  assert.throws(() => G.render.captureScene({ scope: 'room', roomId: 'missing' })); assert.equal(JSON.stringify(G.render.camera.worldToScreen(10, 20)), projected);
});
test('联机背景只隐藏快照玩家，保留真实居民且正常/异常后恢复普通摄影', () => {
  const { G } = setup(), room = G.sys.building.buildRoom(0, 0, 'bedroom').roomId, actors = [];
  G.state.residents.lily = { movedIn: true, roomId: room, heartBubbles: 1 };
  G.draw.residentExtra = () => { actors.push('lily'); return true; }; G.draw.avatar = () => { actors.push('player'); };
  const before = JSON.stringify(G.state), runtime = JSON.stringify(G.runtime), camera = JSON.stringify(G.render.camera);
  G.render.captureScene({ scope: 'room', roomId: room, hidePlayer: true }); assert.deepEqual(actors, ['lily']); actors.length = 0;
  G.render.captureScene({ scope: 'room', roomId: room }); assert.deepEqual(actors.sort(), ['lily', 'player']); actors.length = 0;
  G.render.captureScene({ hidePlayer: true }); assert.ok(!actors.includes('player'));
  G.draw.residentExtra = () => { throw new Error('live backdrop failed'); }; assert.throws(() => G.render.captureScene({ scope: 'room', roomId: room, hidePlayer: true }), /live backdrop failed/);
  G.draw.residentExtra = () => true; actors.length = 0; G.render.captureScene({ scope: 'room', roomId: room }); assert.deepEqual(actors, ['player']);
  assert.equal(JSON.stringify(G.state), before); assert.equal(JSON.stringify(G.runtime), runtime); assert.equal(JSON.stringify(G.render.camera), camera);
  const empty = setup().G; actors.length = 0; empty.draw.avatar = () => { actors.push('player'); };
  empty.render.captureScene({ hidePlayer: true }); assert.equal(actors.length, 0); empty.render.captureScene(); assert.deepEqual(actors, ['player']);
});
test('离屏天空/天气使用临时缓存，正常与失败后都还原原粒子、星空和夜幕引用', () => {
  const { G } = setup(), particles = [{ x: .25 }], stars = [{ x: .75 }], mask = canvas(), cache = G.runtime.atmosphere = { weatherKey: 'old', skyKey: 'oldsky', particles, stars, lastAt: 123, mask, maskContext: mask.context };
  G.sys.time = { current: () => ({ phase: 'day', nightness: 0, weather: 'rain', date: '2026-10-28' }) };
  G.atmosphere = { sky() { cache.stars.push({ x: .5 }); cache.skyKey = 'new'; }, night() { cache.mask = canvas(); cache.maskContext = cache.mask.context; }, weather() { cache.particles.push({ x: .6 }); cache.weatherKey = 'new'; cache.lastAt = 999; } };
  G.render.captureScene(); assert.equal(cache.particles, particles); assert.equal(cache.stars, stars); assert.equal(cache.mask, mask); assert.equal(particles.length, 1); assert.equal(stars.length, 1); assert.equal(cache.lastAt, 123); assert.equal(cache.weatherKey, 'old');
  G.atmosphere.weather = () => { cache.particles.push({ x: .8 }); throw new Error('weather failed'); }; assert.throws(() => G.render.captureScene(), /weather failed/); assert.equal(cache.particles, particles); assert.equal(cache.stars, stars); assert.equal(cache.mask, mask); assert.equal(particles.length, 1); assert.equal(cache.lastAt, 123);
});
test('自创挂画进入真实房间/摄影渲染且保留翻转，不修改作品或场景状态', () => {
  const { G } = setup(); G.store.update(state => { state.level = 7; state.wallet.coin = 2000; }); const room = G.sys.building.buildRoom(0, 0, 'studio').roomId;
  const art = G.sys.creative.save({ name: '小花', pixels: '1' + '.'.repeat(255) }).art, placed = G.sys.creative.place(art.id, room, 30, 40); assert.ok(placed.ok); G.sys.decorating.flip(room, placed.uid);
  const original = G.draw.creative.drawFrame, calls = []; G.draw.creative.drawFrame = (...args) => { calls.push(args.slice(1)); return original(...args); };
  const before = JSON.stringify(G.state), photo = G.render.captureScene({ scope: 'room', roomId: room }); assert.equal(calls.length, 1); assert.equal(calls[0][0].pixels, art.pixels); assert.equal(JSON.stringify(G.state), before); assert.equal(photo.context.depth, 0); assert.ok(photo.context.calls.some(call => call[0] === 'scale' && call[1][0] === -1));
});
test('自制墙纸平铺共用小缓存；重复取景不重建房壳，改作品后缓存自然失效', () => {
  const { G, surfaces } = setup(); G.store.update(state => { state.level = 7; state.wallet.coin = 2000; }); const room = G.sys.building.buildRoom(0, 0, 'studio').roomId;
  const art = G.sys.creative.save({ name: '自己的墙纸', pixels: '3' + '.'.repeat(255) }).art; assert.ok(G.sys.creative.wallpaper(room, art.id).ok);
  const shells = () => surfaces.filter(canvas => canvas.width === 640 && canvas.height === 440).length;
  G.render.captureScene({ scope: 'room', roomId: room }); const first = shells(); assert.equal(first, 1); G.render.captureScene({ scope: 'room', roomId: room }); assert.equal(shells(), first);
  assert.ok(G.sys.creative.save({ id: art.id, name: art.name, pixels: '4' + '.'.repeat(255) }).ok); G.render.captureScene({ scope: 'room', roomId: room }); assert.equal(shells(), first + 1); assert.equal(G.state.house.rooms[room].wallpaper.artId, art.id);
});
test('整屋离屏照片包含真实阁楼房间、固定望远镜和挂画，不改变观星机会或镜头', () => {
  const { G } = setup(); G.store.update(state => { state.level = 17; state.wallet.coin = 2000; state.house.attic = { type:'observatory', paidPrice:1000, builtAt:0 }; });
  assert.ok(G.sys.building.buildRoom(0, 0, 'studio').ok);
  const saved = G.sys.creative.save({ name: '阁楼里的星星', pixels: '5' + '.'.repeat(255) }); assert.ok(saved.ok);
  const placed = G.sys.creative.place(saved.art.id, G.store.atticRoomId, 30, 40); assert.ok(placed.ok);
  const room = G.render.layout.atticRoom(), fixed = room.observation.rect;
  const original = G.draw.creative.drawFrame, frames = [];
  G.draw.creative.drawFrame = (context, art, ...args) => { frames.push({ context, id: art.id, pixels: art.pixels }); return original(context, art, ...args); };
  const before = JSON.stringify(G.state), camera = JSON.stringify(G.render.camera); const photo = G.render.captureScene({scope:'house',width:1280,height:960});
  const translations = (x, y) => photo.context.calls.filter(call => call[0] === 'translate' && call[1][0] === x && call[1][1] === y);
  assert.equal(translations(room.x, room.y).length, 1, '整屋照片应绘制真实阁楼房间');
  assert.equal(translations(fixed.x + fixed.w / 2, fixed.y + 127).length, 1, '整屋照片应绘制阁楼固定望远镜');
  assert.equal(frames.length, 1); assert.equal(frames[0].context, photo.context); assert.equal(frames[0].id, saved.art.id); assert.equal(frames[0].pixels, saved.art.pixels);
  assert.equal(photo.context.depth,0); assert.equal(JSON.stringify(G.state),before); assert.equal(JSON.stringify(G.render.camera),camera);
});
console.log('\n' + passed + ' 组照片合成与离屏场景检查通过（模拟Canvas，不替代真实照片目视验收）。');
