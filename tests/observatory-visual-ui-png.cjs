'use strict';
// 人工Canvas + 真实data/draw，仅插图与六星群内容预览；不载scene/UI/存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createCanvas, loadImage, GlobalFonts } = require(process.env.OBSERVATORY_CANVAS_MODULE || '@napi-rs/canvas');
const font = process.env.OBSERVATORY_FONT || '/System/Library/Fonts/Hiragino Sans GB.ttc'; if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'Observatory QA');
const root = path.resolve(__dirname, '..'), context = vm.createContext({ Game: { data: {} } }); context.window = context;
for (const file of ['js/data/observatory.js', 'js/render/observatory.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const G = context.Game, before = JSON.stringify(G.data.constellations), canvas = createCanvas(1200, 1080), c = canvas.getContext('2d');
c.fillStyle = '#fff9ed'; c.fillRect(0, 0, canvas.width, canvas.height);
function text(value, x, y, size = 20, ink = '#41445c') { c.font = size + 'px "Observatory QA", sans-serif'; c.fillStyle = ink; c.fillText(value, x, y); }
text('阁楼天文台 · 隔离绘图证据', 36, 42, 28);
text('人工Canvas调用真实data/draw；非正式面板截图，未读取私人记录或主场景', 36, 75, 17);
const night = createCanvas(520, 300), day = createCanvas(520, 300);
for (const [target, isNight] of [[night, true], [day, false]]) { const ctx = target.getContext('2d'); ctx.fillStyle = '#26334f'; ctx.fillRect(0, 0, 520, 300); G.draw.observatory.draw(ctx, 0, 0, 520, 300, isNight); }
c.drawImage(night, 36, 100); c.drawImage(day, 644, 100);
text('夜晚穹顶 · 原静态望远镜', 36, 430, 19); text('白天穹顶 · 仍等待夜晚观星', 644, 430, 19);
text('六星群内容预览 · 非已发现图鉴，不承诺逐一发现', 36, 481, 22);
for (const [i, def] of G.data.constellations.entries()) {
  const x = 36 + (i % 3) * 390, y = 506 + Math.floor(i / 3) * 278;
  G.draw.observatory.drawConstellation(c, def, x, y, 350, 200); text(def.name, x, y + 230, 20);
  const pixels = c.getImageData(x + 60, y + 30, 230, 140).data; let stars = 0;
  for (let n = 0; n < pixels.length; n += 4) if (pixels[n] > 175 && pixels[n + 1] > 175) stars++;
  assert.ok(stars > 200, def.id + '应有真实星点与连线像素');
}
(async () => {
  assert.notDeepEqual(Buffer.from(night.getContext('2d').getImageData(130, 50, 240, 120).data), Buffer.from(day.getContext('2d').getImageData(130, 50, 240, 120).data));
  assert.equal(JSON.stringify(G.data.constellations), before); assert.equal(G.data.constellations.length, 6);
  const output = path.join(__dirname, 'observatory-visual-ui-art.png'), bytes = canvas.toBuffer('image/png'); fs.writeFileSync(output, bytes);
  const decoded = await loadImage(bytes); assert.equal(decoded.width, 1200); assert.equal(decoded.height, 1080);
  console.log('✓ 原draw日夜穹顶真实PNG编码/解码，夜窗像素有区别');
  console.log('✓ 六真实data星群逐幅非空像素核对，数据保持且明确内容预览');
  console.log('2 组隔离绘图检查通过：' + output + '（人工Canvas，非正式UI或主场景截图）。');
})().catch(error => { console.error(error); process.exitCode = 1; });
