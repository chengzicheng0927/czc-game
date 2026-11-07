'use strict';
// 可选图鉴预览像素证据。只调用既有缩略图接口；不初始化场景、不启动页面/服务。
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { harness } = require('./collection-book-visual-ui.cjs');
if (!process.env.COLLECTION_CANVAS_MODULE) throw new Error('请用 COLLECTION_CANVAS_MODULE 指定已有 @napi-rs/canvas 路径。');
const { createCanvas, GlobalFonts } = require(process.env.COLLECTION_CANVAS_MODULE);
const font = '/System/Library/Fonts/STHeiti Medium.ttc'; if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'CollectionReview');
const output = process.env.COLLECTION_REVIEW_DIR || '/tmp/marshmallow-collection-visual-v2-20261030'; fs.mkdirSync(output, { recursive: true });
const env = harness(), { G } = env, proto = Object.getPrototypeOf(env.panel), sizes = { width: 112, height: 100 };
Object.defineProperty(proto, 'width', { configurable: true, get() { return this._width || 180; }, set(value) { this._width = value; if (this.bitmap) this.bitmap.width = value; } });
Object.defineProperty(proto, 'height', { configurable: true, get() { return this._height || 160; }, set(value) { this._height = value; if (this.bitmap) this.bitmap.height = value; } });
proto.getBoundingClientRect = function () { return { width: this.classList.contains('is-large') ? 180 : sizes.width, height: this.classList.contains('is-large') ? 180 : sizes.height }; };
proto.getContext = function () { if (!this.bitmap) this.bitmap = createCanvas(this.width, this.height); return this.bitmap.getContext('2d'); };
['js/render/scene.js', 'js/render/furniture-extra.js', 'js/render/resident-extra.js', 'js/render/crafting.js', 'js/render/avatar.js', 'js/ui/garden.js'].forEach(env.load);
// 合成样本只点亮第一套历史，方便并列查看已知名与剪影；没有读取本机账号或存档。
env.complete('basic'); const before = JSON.stringify(G.state);
const sheets = [], counts = {};
function visibleBitmap(node) {
  const image = createCanvas(node.bitmap.width, node.bitmap.height), ctx = image.getContext('2d'); ctx.drawImage(node.bitmap, 0, 0);
  if (node.classList.contains('is-undiscovered')) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, image.width, image.height); }
  return image;
}
for (const [mode, width, height] of [['desktop-preview', 112, 100], ['narrow-preview', 92, 86]]) {
  sizes.width = width; sizes.height = height;
  const sheet = createCanvas(1120, 910), ctx = sheet.getContext('2d'); ctx.fillStyle = '#fffbed'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#4d5943'; ctx.font = 'bold 25px "CollectionReview"'; ctx.fillText('真实图鉴预览 · ' + mode, 28, 40); ctx.font = '14px "CollectionReview"'; ctx.fillText('离屏Canvas证据 / 非DOM整页截图 / 历史与未知样本均为合成内存', 28, 67);
  let row = 0; const stats = [];
  for (const kind of ['furniture', 'residents', 'crops', 'outfits']) {
    env.focus({ kind, status: 'all', query: '', theme: 'all', category: 'all' }); let count = 0, sample = [];
    while (true) {
      env.frames();
      for (const card of env.cards()) {
        const art = card.querySelector('canvas'); assert.ok(art.bitmap, kind + '实际调用原绘制API');
        const pixels = art.bitmap.getContext('2d').getImageData(0, 0, art.bitmap.width, art.bitmap.height).data; let painted = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 12) painted++;
        assert.ok(painted > 40, card.dataset.uiFocus + '应有非空预览'); count++;
        if (sample.length < 8) sample.push({ art, name: card.querySelector('.collection-entry-name').textContent, missing: card.classList.contains('is-missing') });
      }
      if (env.key('page-next').disabled) break; env.key('page-next').click();
    }
    counts[kind] = count; stats.push({ kind, count });
    ctx.fillStyle = '#4d5943'; ctx.font = 'bold 16px "CollectionReview"'; ctx.fillText(kind + ' · ' + count, 28, 104 + row * 158);
    sample.forEach(({ art, name, missing }, index) => {
      const x = 28 + index * 136, y = 117 + row * 158;
      ctx.fillStyle = missing ? '#efeee4' : '#f7f4e1'; ctx.beginPath(); ctx.roundRect(x, y, 124, 123, 12); ctx.fill();
      ctx.save(); if (missing) ctx.globalAlpha = .23; ctx.drawImage(visibleBitmap(art), x + 6, y + 3, 112, 88); ctx.restore();
      ctx.fillStyle = '#4d5943'; ctx.font = '12px "CollectionReview"'; ctx.textAlign = 'center'; ctx.fillText(name, x + 62, y + 111); ctx.textAlign = 'left';
    }); row++;
  }
  // 五份加工成品的实际图鉴详情预览；已计入上方407，额外展示只为查看原绘图链。
  ctx.fillStyle = '#4d5943'; ctx.font = 'bold 16px "CollectionReview"'; ctx.fillText('五份加工成品 · 原缩略图接口', 28, 755);
  G.data.craftingRecipes.forEach((recipe, index) => {
    G.ui.collectionBook.openDetail('furniture', recipe.itemId, env.api); env.frames(); const art = env.detailBody().querySelector('canvas'); assert.ok(art.bitmap);
    ctx.drawImage(art.bitmap, 32 + index * 210, 773, 128, 100); ctx.font = '13px "CollectionReview"'; ctx.fillStyle = '#4d5943'; ctx.fillText(G.data.furnitureById[recipe.itemId].name, 32 + index * 210, 892); env.dialogs.at(-1).close();
  });
  const target = path.join(output, mode + '.png'); fs.writeFileSync(target, sheet.toBuffer('image/png')); sheets.push(target);
  assert.deepEqual(counts, { furniture: 407, residents: 12, crops: 12, outfits: 60 });
}
assert.equal(JSON.stringify(G.state), before, '所有绘制不得改变合成存档');
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ counts, sizes: [[112, 100], [92, 86]], sheets, unchanged: true }, null, 2));
console.log('2 组图鉴实际Canvas检查通过（491预览 × 2尺寸 / 五份加工详情 / 存档零修改）。'); console.log(output);
