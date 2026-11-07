'use strict';
// 可选离屏像素验收：仅使用合成花圃，不启动浏览器、服务或读取任何真实存档。
// GARDEN_CANVAS_MODULE 指向验收机已有的 @napi-rs/canvas；产品不依赖此包。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
if (!process.env.GARDEN_CANVAS_MODULE) throw new Error('请用 GARDEN_CANVAS_MODULE 指定已有 @napi-rs/canvas 路径。');
const { createCanvas, GlobalFonts } = require(process.env.GARDEN_CANVAS_MODULE);
const font = '/System/Library/Fonts/STHeiti Medium.ttc';
if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'GardenReview');
const root = path.resolve(__dirname, '..');
const output = process.env.GARDEN_REVIEW_DIR || '/tmp/marshmallow-garden-visual-v2-20261030';
fs.mkdirSync(output, { recursive: true });
const reviewNow = new Date(2026, 9, 30, 12, 0, 0).getTime(), RealDate = Date;
class ReviewDate extends RealDate { constructor(...args) { super(...(args.length ? args : [reviewNow])); } static now() { return reviewNow; } }
const forbidden = name => () => { throw new Error('离屏绘制不得访问 ' + name); };
const env = vm.createContext({ console, Date: ReviewDate, document: { addEventListener() {}, createElement: forbidden('DOM面板') }, setInterval: forbidden('计时器'), setTimeout: forbidden('计时器') });
env.window = env;
for (const name of ['js/core/namespace.js', 'js/core/bus.js', 'js/data/garden.js', 'js/systems/garden.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), env, { filename: name });
const G = env.Game;
G.render = {}; G.store = { update: forbidden('存档更新') };
const ids = ['daisy', 'tulip', null, 'strawberry', 'carrot', 'blueberry', null, 'pumpkin', 'lavender'];
const wanted = [3, 2, 0, 3, 1, 2, 0, 0, 3];
G.state = { level: 18, house: { rooms: {} }, garden: { seeds: {}, harvest: {}, plots: ids.map((id, i) => id ? { crop: id, plantedAt: reviewNow - G.data.cropById[id].growMs * (wanted[i] + .1) / 3, durationMs: G.data.cropById[id].growMs, watered: [null, null, null] } : null) } };
Object.defineProperty(env, 'localStorage', { get: forbidden('本机存档') });
for (const name of ['js/ui/garden.js', 'js/render/garden-visual.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), env, { filename: name });
const stateBefore = JSON.stringify(G.state), stats = [], hashes = [];
let operations = 0, passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function checkedContext(ctx) {
  let depth = 0;
  return { ctx: new Proxy(ctx, {
    get(object, key) {
      const value = object[key];
      if (typeof value !== 'function') return value;
      return (...args) => {
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), String(key) + ' 坐标必须有限');
        if (key === 'save') depth++;
        if (key === 'restore') assert.ok(--depth >= 0, 'Canvas restore 不得越界');
        operations++; return value.apply(object, args);
      };
    },
    set(object, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), String(key) + ' 必须有限'); object[key] = value; return true; }
  }), assertBalanced() { assert.equal(depth, 0, '绘制后应恢复所有 Canvas 状态'); } };
}
function pixels(canvas) {
  const values = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0, left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (values[(y * canvas.width + x) * 4 + 3] > 12) {
    count++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return { pixels: count, bounds: { left, top, right, bottom }, sha256: crypto.createHash('sha256').update(values).digest('hex') };
}
function title(ctx, text, subtitle, width, height) {
  ctx.fillStyle = '#FFFAEF'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#415447'; ctx.font = 'bold 25px "GardenReview", sans-serif'; ctx.fillText(text, 28, 40);
  ctx.fillStyle = '#725E4E'; ctx.font = '14px "GardenReview", sans-serif'; ctx.fillText(subtitle, 28, 68);
}
function label(ctx, text, x, y, size = 15, color = '#415447') {
  ctx.fillStyle = color; ctx.font = size + 'px "GardenReview", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, x, y); ctx.textAlign = 'left';
}
function card(ctx, x, y, w, h) {
  ctx.fillStyle = '#F1F1E2'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 15); ctx.fill();
  ctx.strokeStyle = '#D8DDC9'; ctx.lineWidth = 1; ctx.stroke();
}
function plotImage(status, selected = false, scale = 2) {
  const art = createCanvas(180 * scale, 130 * scale), native = art.getContext('2d'), checked = checkedContext(native);
  native.scale(scale, scale); native.fillStyle = '#123456'; native.lineWidth = 7;
  const before = native.getTransform();
  G.render.gardenVisual.drawPlot(checked.ctx, status, { width: 180, height: 130, selected, drawCrop: G.ui.garden.drawCrop });
  checked.assertBalanced(); assert.equal(native.lineWidth, 7);
  // 此Canvas包的fillStyle读取缓存不随restore更新；用真正落下的像素验证画笔恢复。
  native.fillRect(0, 0, 1, 1); assert.deepEqual(Array.from(native.getImageData(0, 0, 1, 1).data), [18, 52, 86, 255]); native.clearRect(0, 0, 1, 1);
  const after = native.getTransform(); for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) assert.equal(after[key], before[key]);
  return art;
}
test('12种真实作物实际像素不同、有限且完整入画', () => {
  const sheet = createCanvas(1024, 900), ctx = sheet.getContext('2d');
  title(ctx, '十二种现有花果 · 成熟形态', '真实 crop ID / data 价格与时长 / 仅合成离屏素材，不读取用户小屋', 1024, 900);
  G.data.crops.forEach((crop, i) => {
    const art = createCanvas(320, 280), native = art.getContext('2d'), checked = checkedContext(native); native.scale(2, 2);
    G.ui.garden.drawCrop(checked.ctx, crop.id, 3, 80, 116, 125); checked.assertBalanced();
    const result = pixels(art); assert.ok(result.pixels > 300 && result.bounds.left > 0 && result.bounds.top > 0 && result.bounds.right < 319 && result.bounds.bottom < 279, crop.id + ' 应完整入画');
    stats.push({ cropId: crop.id, ...result }); hashes.push(result.sha256);
    const x = 24 + i % 4 * 250, y = 94 + Math.floor(i / 4) * 262; card(ctx, x, y, 232, 244); ctx.drawImage(art, x + 36, y + 4, 160, 140);
    label(ctx, crop.name, x + 116, y + 163, 18); label(ctx, crop.id, x + 116, y + 186, 12, '#725E4E');
    label(ctx, '种价 ' + crop.seedPrice + ' / ' + crop.growMinutes + '分钟 / 售价 ' + crop.sellPrice, x + 116, y + 215, 13, '#725E4E');
  });
  assert.equal(new Set(hashes).size, 12); fs.writeFileSync(path.join(output, 'garden-crops.png'), sheet.toBuffer('image/png'));
});
test('空地和四阶段像素可辨识，Canvas状态与边界保持', () => {
  const sheet = createCanvas(1080, 320), ctx = sheet.getContext('2d'); title(ctx, '一块花圃 · 空地与四阶段', '绘制使用正式 drawPlot / drawCrop；此表为明确标记的合成阶段示例', 1080, 320);
  const variants = [{ empty: true, crop: null, stage: 0, mature: false, needsWater: false }, ...[0, 1, 2, 3].map(stage => ({ empty: false, crop: 'tulip', stage, mature: stage === 3, needsWater: stage < 3 }))];
  const names = ['空地', ...G.data.gardenConfig.stageNames], values = [];
  variants.forEach((status, i) => {
    const art = plotImage(status, i === 2), result = pixels(art); values.push(result.sha256);
    assert.ok(result.pixels > 3000 && result.bounds.left > 0 && result.bounds.top > 0 && result.bounds.right < art.width - 1 && result.bounds.bottom < art.height - 1, names[i] + ' 应在画布内');
    ctx.drawImage(art, 14 + i * 212, 98, 200, 145); label(ctx, names[i], 114 + i * 212, 273, 17);
  });
  assert.equal(new Set(values).size, 5); fs.writeFileSync(path.join(output, 'garden-stages.png'), sheet.toBuffer('image/png'));
});
test('真实status驱动九格合成示例，adapter与基础crop fallback分别出图且不写状态', () => {
  const statuses = G.sys.garden.plots(reviewNow); assert.equal(statuses.length, 9);
  statuses.forEach((status, i) => { assert.equal(status.empty, ids[i] === null); if (!status.empty) assert.equal(status.stage, wanted[i]); });
  const sheet = createCanvas(1260, 730), ctx = sheet.getContext('2d'); title(ctx, '九块真实规则花圃 · 合成 Lv.18 示例', '左：可选软陶 adapter ｜ 右：基础 drawCrop 素材示例（非完整UI截图）', 1260, 730);
  label(ctx, '可选 adapter', 322, 112, 20); label(ctx, '基础作物 fallback 素材', 938, 112, 20);
  const adapterHashes = [], fallbackHashes = [];
  statuses.forEach((status, i) => {
    const x = 28 + i % 3 * 198, y = 132 + Math.floor(i / 3) * 184;
    card(ctx, x, y, 184, 170); const art = plotImage(status, i === 0); adapterHashes.push(pixels(art).sha256); ctx.drawImage(art, x + 2, y + 2, 180, 130);
    const basic = createCanvas(180, 130), b = basic.getContext('2d');
    b.fillStyle = '#E9CEB1'; b.beginPath(); b.ellipse(90, 101, 67, 14, 0, 0, Math.PI * 2); b.fill();
    if (status.crop) G.ui.garden.drawCrop(b, status.crop, status.stage, 90, 98, 106);
    fallbackHashes.push(pixels(basic).sha256); card(ctx, x + 616, y, 184, 170); ctx.drawImage(basic, x + 618, y + 2);
    const caption = (i + 1) + ' · ' + (status.empty ? '空地' : G.data.cropById[status.crop].name + ' · ' + status.stageName);
    label(ctx, caption, x + 92, y + 151, 13); label(ctx, caption, x + 708, y + 151, 13);
  });
  assert.ok(adapterHashes.every((hash, i) => hash !== fallbackHashes[i]), 'adapter应确实改变实际像素');
  assert.equal(JSON.stringify(G.state), stateBefore, '绘制不得改变真实规则合成状态');
  fs.writeFileSync(path.join(output, 'garden-nine-plots.png'), sheet.toBuffer('image/png'));
});
fs.writeFileSync(path.join(output, 'garden-raster-report.json'), JSON.stringify({ synthetic: true, now: reviewNow, crops: stats, finiteDrawingOperations: operations, checks: passed, output, note: '离屏绘图证据；不是浏览器UI或真实用户小屋截图。fallback列仅演示正式drawCrop素材。' }, null, 2));
console.log('\n' + passed + ' 组实际Canvas像素检查通过。'); console.log(output);
