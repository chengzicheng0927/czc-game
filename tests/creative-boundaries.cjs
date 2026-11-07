'use strict';
// 画作规则与引用恢复检查；Canvas替身仅核对绘制/下载，不替代真实画板手感验收。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..'), blank = '.'.repeat(256), PNG = 'data:image/png;base64,iVBORw0KGgo=';
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/data/creative.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/creative.js', 'js/render/creative.js'];
function sandbox() {
  const draws = [], downloads = [], canvases = [];
  function canvas() {
    const c = { imageSmoothingEnabled: true, save() {}, restore() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, translate() {}, fillRect(...args) { draws.push({ type: 'fill', args, color: this.fillStyle }); }, drawImage(...args) { draws.push({ type: 'image', args, smoothing: this.imageSmoothingEnabled }); } };
    const value = { width: 0, height: 0, getContext: () => c, toDataURL: () => PNG }; canvases.push(value); return value;
  }
  const context = vm.createContext({ console, Blob, URL, atob, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {}, createElement: tag => { assert.equal(tag, 'canvas'); return canvas(); } } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); spaces.register(G, context.CottageBuilding); G.store.init(); G.sys.init();
  G.utils.download = (name, bytes, mime) => { downloads.push({ name, bytes, mime }); return true; };
  return { G, parse, canvas, draws, downloads, canvases, context };
}
function unlocked(env) { const { G } = env; G.store.update(state => { state.level = 7; state.wallet.coin = 10000; }); const result = spaces.buildSpace(G, 0, 0, 'studio'); assert.ok(result.ok, result.message); return result.roomId; }
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
const art = (G, name = '我的小花', pixels = '0' + blank.slice(1)) => { const result = G.sys.creative.save({ name, pixels }); assert.ok(result.ok, result.message); return result.art; };
function test(name, fn) { tests.push({ name, fn }); }
test('保存/编辑深拷贝，不重复新增或假造家具收集；最多20幅，已满仍可改旧画', () => {
  const env = sandbox(), { G } = env; unlocked(env); const first = art(G), list = G.sys.creative.list(); list[0].name = '不直接改原画'; assert.equal(G.sys.creative.get(first.id).name, first.name);
  for (let i = 1; i < 20; i++) art(G, '第' + i + '幅'); const full = JSON.stringify(G.state); assert.equal(G.sys.creative.save({ name: '第21幅', pixels: blank }).ok, false); assert.equal(JSON.stringify(G.state), full); assert.ok(G.sys.creative.save({ id: first.id, name: '更新的小花', pixels: 'n'.repeat(256) }).ok); assert.equal(G.state.customArts.length, 20); assert.equal(G.sys.creative.get(first.id).pixels, 'n'.repeat(256)); assert.equal(G.state.collection.custom_art_frame, undefined);
});
test('无效像素/名字/旧ID均拒绝，emoji按码点计数，ID碰撞不覆盖旧画', () => {
  const env = sandbox(), { G } = env; unlocked(env); const sys = G.sys.creative, initial = JSON.stringify(G.state);
  for (const input of [{ name: '', pixels: blank }, { name: '跨\n行', pixels: blank }, { name: '🌷'.repeat(21), pixels: blank }, { name: '坏像素', pixels: '.'.repeat(255) }, { name: '坏像素', pixels: 'o'.repeat(256) }, { name: '坏像素', pixels: [] }, { id: 'missing', name: '小画', pixels: blank }]) { assert.equal(sys.save(input).ok, false); assert.equal(JSON.stringify(G.state), initial); }
  assert.ok(sys.save({ name: '🌷'.repeat(20), pixels: blank }).ok); const fixed = art(G), before = JSON.stringify(G.state); G.utils.uid = () => fixed.id; assert.equal(sys.save({ name: '同编号', pixels: blank }).ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('像素渲染保留透明格和最近20份小缓存，不把图片数据塞进JSON', () => {
  const env = sandbox(), { G, canvas, draws, canvases } = env, target = canvas(), c = target.getContext('2d'), pixels = 'n' + blank.slice(1); G.draw.creative.drawPixels(c, pixels, 0, 0, 256, 256); const fill = draws.filter(call => call.type === 'fill'); assert.equal(fill.length, 1); assert.equal(fill[0].color, G.data.creativeConfig.palette[23]); assert.equal(draws.find(call => call.type === 'image').smoothing, false);
  const count = canvases.length; G.draw.creative.drawPixels(c, pixels, 0, 0, 100, 100); assert.equal(canvases.length, count);
  for (let i = 0; i < 21; i++) G.draw.creative.tile('0'.repeat(i + 1) + blank.slice(i + 1)); const after = canvases.length; G.draw.creative.tile(pixels); assert.equal(canvases.length, after + 1); assert.equal(JSON.stringify(G.state).includes('data:image'), false);
});
test('已保存作品导出512透明PNG，未知画作失败且下载不改变存档', async () => {
  const env = sandbox(), { G, downloads, canvases } = env; unlocked(env); const item = art(G), snapshot = JSON.stringify(G.state), result = await G.sys.creative.download(item.id); assert.ok(result.ok, result.message); assert.equal(downloads.length, 1); assert.equal(downloads[0].mime, 'image/png'); assert.match(downloads[0].name, /\.png$/); assert.deepEqual(Buffer.from(downloads[0].bytes), Buffer.from(PNG.split(',')[1], 'base64')); assert.ok(canvases.some(c => c.width === 512 && c.height === 512)); assert.equal(JSON.stringify(G.state), snapshot); assert.equal((await G.sys.creative.download('missing')).ok, false);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log(tests.length + ' 组保留画作容量、编码与导出边界检查通过；不验证3D引擎。'); })().catch(error => { console.error(error); process.exitCode = 1; });
