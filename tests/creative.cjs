'use strict';
// 画作规则与引用恢复检查；Canvas替身仅核对绘制/下载，不替代真实画板手感验收。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), blank = '.'.repeat(256), PNG = 'data:image/png;base64,iVBORw0KGgo=';
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/creative.js', 'js/render/creative.js'];
function sandbox() {
  const draws = [], downloads = [], canvases = [];
  function canvas() {
    const c = { imageSmoothingEnabled: true, save() {}, restore() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, translate() {}, fillRect(...args) { draws.push({ type: 'fill', args, color: this.fillStyle }); }, drawImage(...args) { draws.push({ type: 'image', args, smoothing: this.imageSmoothingEnabled }); } };
    const value = { width: 0, height: 0, getContext: () => c, toDataURL: () => PNG }; canvases.push(value); return value;
  }
  const context = vm.createContext({ console, Blob, URL, atob, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {}, createElement: tag => { assert.equal(tag, 'canvas'); return canvas(); } } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); G.store.init(); G.sys.init();
  G.utils.download = (name, bytes, mime) => { downloads.push({ name, bytes, mime }); return true; };
  return { G, parse, canvas, draws, downloads, canvases, context };
}
function unlocked(env) { const { G } = env; G.store.update(state => { state.level = 7; state.wallet.coin = 10000; }); const result = G.sys.building.buildRoom(0, 0, 'studio'); assert.ok(result.ok, result.message); return result.roomId; }
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
const art = (G, name = '我的小花', pixels = '0' + blank.slice(1)) => { const result = G.sys.creative.save({ name, pixels }); assert.ok(result.ok, result.message); return result.art; };
function test(name, fn) { tests.push({ name, fn }); }
test('16格24色固定编码，内部挂件不加入402家具目录或普通库存', () => {
  const { G } = sandbox(), C = G.data.creativeConfig; assert.equal(C.size, 16); assert.equal(C.symbols.length, 24); assert.equal(C.palette.length, 24); assert.equal(C.paletteNames.length, 24); assert.equal(new Set(C.symbols).size, 24); assert.equal(G.data.furniture.length, 402); assert.ok(G.data.furnitureById.custom_art_frame.customArt); assert.equal(G.data.furniture.some(item => item.id === C.frameId), false); assert.equal(G.state.inventory[C.frameId], undefined); assert.equal(G.state.collection[C.frameId], undefined);
});
test('Lv7与画室同时解锁；旧作品可查看下载，拆画室后不能新增或重新应用', async () => {
  const env = sandbox(), { G } = env, sys = G.sys.creative; assert.equal(sys.status().unlocked, false); assert.equal(sys.save({ name: '小画', pixels: blank }).ok, false); const roomId = unlocked(env); assert.equal(sys.status().unlocked, true); const item = art(G); assert.ok(G.sys.building.demolishRoom(roomId).ok); assert.equal(sys.status().unlocked, false); assert.equal(sys.get(item.id).name, item.name); assert.equal((await sys.download(item.id)).ok, true); assert.equal(sys.save({ id: item.id, name: item.name, pixels: '1'.repeat(256) }).ok, false); assert.equal(sys.place(item.id, roomId).ok, false);
});
test('保存/编辑深拷贝，不重复新增或假造家具收集；最多20幅，已满仍可改旧画', () => {
  const env = sandbox(), { G } = env; unlocked(env); const first = art(G), list = G.sys.creative.list(); list[0].name = '不直接改原画'; assert.equal(G.sys.creative.get(first.id).name, first.name);
  for (let i = 1; i < 20; i++) art(G, '第' + i + '幅'); const full = JSON.stringify(G.state); assert.equal(G.sys.creative.save({ name: '第21幅', pixels: blank }).ok, false); assert.equal(JSON.stringify(G.state), full); assert.ok(G.sys.creative.save({ id: first.id, name: '更新的小花', pixels: 'n'.repeat(256) }).ok); assert.equal(G.state.customArts.length, 20); assert.equal(G.sys.creative.get(first.id).pixels, 'n'.repeat(256)); assert.equal(G.state.collection.custom_art_frame, undefined);
});
test('无效像素/名字/旧ID均拒绝，emoji按码点计数，ID碰撞不覆盖旧画', () => {
  const env = sandbox(), { G } = env; unlocked(env); const sys = G.sys.creative, initial = JSON.stringify(G.state);
  for (const input of [{ name: '', pixels: blank }, { name: '跨\n行', pixels: blank }, { name: '🌷'.repeat(21), pixels: blank }, { name: '坏像素', pixels: '.'.repeat(255) }, { name: '坏像素', pixels: 'o'.repeat(256) }, { name: '坏像素', pixels: [] }, { id: 'missing', name: '小画', pixels: blank }]) { assert.equal(sys.save(input).ok, false); assert.equal(JSON.stringify(G.state), initial); }
  assert.ok(sys.save({ name: '🌷'.repeat(20), pixels: blank }).ok); const fixed = art(G), before = JSON.stringify(G.state); G.utils.uid = () => fixed.id; assert.equal(sys.save({ name: '同编号', pixels: blank }).ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('挂墙只生成一个带作品引用的挂件，夹紧墙面位置并更新真实摆放进度', () => {
  const env = sandbox(), { G } = env, roomId = unlocked(env), item = art(G); G.store.update(state => { state.quests.daily.list = [{ id: 'daily_place', progress: 0, done: false, claimed: false }]; });
  const previous = G.state.quests.stats.itemsPlaced, placed = G.sys.creative.place(item.id, roomId, 999, -40); assert.ok(placed.ok, placed.message); const piece = G.state.house.rooms[roomId].items.find(value => value.uid === placed.uid); assert.equal(piece.defId, 'custom_art_frame'); assert.equal(piece.artId, item.id); assert.equal(piece.x, 254); assert.equal(piece.y, 14); assert.equal(G.state.quests.stats.itemsPlaced, previous + 1); assert.equal(G.state.quests.daily.list[0].progress, 1); assert.equal(G.state.inventory.custom_art_frame, undefined);
  const snapshot = JSON.stringify(G.state), duplicate = G.sys.creative.place(item.id, roomId); assert.equal(duplicate.ok, false); assert.equal(duplicate.uid, placed.uid); assert.equal(JSON.stringify(G.state), snapshot); assert.equal(G.sys.creative.place(item.id, roomId, NaN, 0).ok, false);
});
test('现有拖动/收起/拆房保留作品，挂件不变成通用库存', () => {
  const env = sandbox(), { G } = env, roomId = unlocked(env), item = art(G), placed = G.sys.creative.place(item.id, roomId); assert.ok(placed.ok);
  assert.ok(G.sys.decorating.move(roomId, placed.uid, roomId, 30, 40).ok); assert.equal(G.state.house.rooms[roomId].items[0].artId, item.id); assert.ok(G.sys.decorating.remove(roomId, placed.uid).ok); assert.equal(G.state.inventory.custom_art_frame, undefined); assert.equal(G.state.customArts.length, 1);
  assert.ok(G.sys.creative.place(item.id, roomId).ok); assert.equal(G.sys.decorating.undo().ok, false); assert.ok(G.sys.building.demolishRoom(roomId).ok); assert.equal(G.state.inventory.custom_art_frame, undefined); assert.equal(G.state.customArts.length, 1);
});
test('自制墙纸保留底色并指向真作品，重复应用不刷次数，编辑原画复用引用', () => {
  const env = sandbox(), { G } = env, roomId = unlocked(env), item = art(G), old = plain(G.state.house.rooms[roomId].wallpaper), changes = G.state.quests.stats.wallpaperChanges;
  assert.ok(G.sys.creative.wallpaper(roomId, item.id).ok); assert.deepEqual(plain(G.state.house.rooms[roomId].wallpaper), { pattern: 'custom', color: old.color, color2: old.color2, artId: item.id }); assert.equal(G.state.quests.stats.wallpaperChanges, changes + 1); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.creative.wallpaper(roomId, item.id).unchanged, true); assert.equal(JSON.stringify(G.state), snapshot);
  assert.ok(G.sys.creative.save({ id: item.id, name: item.name, pixels: '3'.repeat(256) }).ok); assert.equal(G.state.house.rooms[roomId].wallpaper.artId, item.id); assert.equal(G.sys.creative.get(item.id).pixels, '3'.repeat(256));
});
test('删除作品清理所有挂画/墙纸引用且清旧撤销，不产生孤立家具或库存', () => {
  const env = sandbox(), { G } = env, roomId = unlocked(env), item = art(G), placed = G.sys.creative.place(item.id, roomId); assert.ok(placed.ok); assert.ok(G.sys.creative.wallpaper(roomId, item.id).ok); G.sys.decorating.move(roomId, placed.uid, roomId, 20, 30);
  const color = G.state.house.rooms[roomId].wallpaper.color; assert.ok(G.sys.creative.remove(item.id).ok); assert.equal(G.state.customArts.length, 0); assert.equal(G.state.house.rooms[roomId].items.length, 0); assert.equal(G.state.house.rooms[roomId].wallpaper.pattern, 'solid'); assert.equal(G.state.house.rooms[roomId].wallpaper.color, color); assert.equal('artId' in G.state.house.rooms[roomId].wallpaper, false); assert.equal(G.state.inventory.custom_art_frame, undefined); assert.equal(G.sys.decorating.undo().ok, false);
});
test('存档容量或写入失败整体回滚，不留画作/挂件/统计/墙纸修改', () => {
  const env = sandbox(), { G } = env, roomId = unlocked(env), item = art(G), before = JSON.stringify(G.state), maxBytes = G.data.balance.maxSaveBytes; G.data.balance.maxSaveBytes = 1;
  for (const action of [() => G.sys.creative.save({ name: '新画', pixels: blank }), () => G.sys.creative.save({ id: item.id, name: item.name, pixels: '1'.repeat(256) }), () => G.sys.creative.place(item.id, roomId), () => G.sys.creative.wallpaper(roomId, item.id), () => G.sys.creative.remove(item.id)]) { assert.equal(action().ok, false); assert.equal(JSON.stringify(G.state), before); } G.data.balance.maxSaveBytes = maxBytes;
});
test('严格存档拒绝坏作品、重复作品与孤立/重复挂件或墙纸引用', () => {
  const env = sandbox(), { G, parse } = env, roomId = unlocked(env), item = art(G); const placed = G.sys.creative.place(item.id, roomId); assert.ok(placed.ok); G.sys.creative.wallpaper(roomId, item.id);
  for (const change of [s => { s.customArts[0].pixels = '0'; }, s => { s.customArts[0].extra = true; }, s => { s.customArts.push({ ...s.customArts[0] }); }, s => { s.house.rooms[roomId].items[0].artId = 'missing'; }, s => { s.house.rooms[roomId].items.push({ ...s.house.rooms[roomId].items[0], uid: 'duplicate_frame' }); }, s => { s.house.rooms[roomId].wallpaper.artId = 'missing'; }, s => { s.inventory.custom_art_frame = 1; }, s => { s.collection.custom_art_frame = true; }]) { const raw = parse(G.state); change(raw); assert.throws(() => G.store.validate(raw)); }
});
test('JSON完整往返保留像素、挂墙位置和墙纸引用，换档不串作品', () => {
  const env = sandbox(), { G, parse } = env, roomId = unlocked(env), item = art(G, '🌷小花', 'n'.repeat(256)); G.sys.creative.place(item.id, roomId, 40, 50); G.sys.creative.wallpaper(roomId, item.id);
  const saved = parse(G.state); G.store.replace(parse(G.store.defaultState())); assert.equal(G.sys.creative.list().length, 0); G.store.replace(saved); assert.equal(G.sys.creative.get(item.id).pixels, 'n'.repeat(256)); assert.equal(G.state.house.rooms[roomId].items[0].x, 40); assert.equal(G.state.house.rooms[roomId].wallpaper.artId, item.id);
});
test('像素渲染保留透明格和最近20份小缓存，不把图片数据塞进JSON', () => {
  const env = sandbox(), { G, canvas, draws, canvases } = env, target = canvas(), c = target.getContext('2d'), pixels = 'n' + blank.slice(1); G.draw.creative.drawPixels(c, pixels, 0, 0, 256, 256); const fill = draws.filter(call => call.type === 'fill'); assert.equal(fill.length, 1); assert.equal(fill[0].color, G.data.creativeConfig.palette[23]); assert.equal(draws.find(call => call.type === 'image').smoothing, false);
  const count = canvases.length; G.draw.creative.drawPixels(c, pixels, 0, 0, 100, 100); assert.equal(canvases.length, count);
  for (let i = 0; i < 21; i++) G.draw.creative.tile('0'.repeat(i + 1) + blank.slice(i + 1)); const after = canvases.length; G.draw.creative.tile(pixels); assert.equal(canvases.length, after + 1); assert.equal(JSON.stringify(G.state).includes('data:image'), false);
});
test('已保存作品导出512透明PNG，未知画作失败且下载不改变存档', async () => {
  const env = sandbox(), { G, downloads, canvases } = env; unlocked(env); const item = art(G), snapshot = JSON.stringify(G.state), result = await G.sys.creative.download(item.id); assert.ok(result.ok, result.message); assert.equal(downloads.length, 1); assert.equal(downloads[0].mime, 'image/png'); assert.match(downloads[0].name, /\.png$/); assert.deepEqual(Buffer.from(downloads[0].bytes), Buffer.from(PNG.split(',')[1], 'base64')); assert.ok(canvases.some(c => c.width === 512 && c.height === 512)); assert.equal(JSON.stringify(G.state), snapshot); assert.equal((await G.sys.creative.download('missing')).ok, false);
});
test('真实本机存储拒写时作品、引用与内存保持不变，恢复写入后可再保存', () => {
  const env = sandbox(), { G } = env, room = unlocked(env), item = art(G), before = JSON.stringify(G.state); let writes = 0;
  env.context.localStorage.setItem = () => { writes++; throw new Error('QuotaExceededError'); };
  for (const action of [() => G.sys.creative.save({ name: '未写入', pixels: blank }), () => G.sys.creative.save({ id: item.id, name: '改名', pixels: blank }), () => G.sys.creative.place(item.id, room), () => G.sys.creative.wallpaper(room, item.id), () => G.sys.creative.remove(item.id)]) { assert.equal(action().ok, false); assert.equal(JSON.stringify(G.state), before); }
  assert.equal(writes, 5); env.context.localStorage.setItem = () => {}; assert.ok(G.sys.creative.save({ name: '可以写入', pixels: blank }).ok);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组创意画板规则、引用与绘图检查通过（未执行浏览器验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
