'use strict';
// 可选离屏像素验收：CHARACTER_CANVAS_MODULE 指向验收机已安装的Canvas包；产品不依赖它。
// 不启动浏览器或监听端口，不载入主页面、私人存档、账号或场景。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
if (!process.env.CHARACTER_CANVAS_MODULE) throw new Error('请用 CHARACTER_CANVAS_MODULE 指定已有 @napi-rs/canvas 路径。');
const { createCanvas, GlobalFonts } = require(process.env.CHARACTER_CANVAS_MODULE);
const reviewFont = '/System/Library/Fonts/STHeiti Medium.ttc'; if (fs.existsSync(reviewFont)) GlobalFonts.registerFromPath(reviewFont, 'CharacterReview');
const root = path.resolve(__dirname, '..'), output = process.env.CHARACTER_REVIEW_DIR || '/tmp/marshmallow-character-visual-v2-20261030';
fs.mkdirSync(output, { recursive: true });
const env = vm.createContext({ Game: { data: {}, render: { preserved: true } } }); env.window = env;
for (const name of ['js/data/outfits.js', 'js/render/avatar.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), env, { filename: name });
const G = env.Game, D = G.data, direct = { still: true, direct: true };
Object.defineProperty(G, 'state', { get() { throw new Error('不得读取用户小屋'); } });
const canvas = createCanvas(1248, 856), c = canvas.getContext('2d');
c.fillStyle = '#FFFAEF'; c.fillRect(0, 0, canvas.width, canvas.height);
c.fillStyle = '#4D5144'; c.font = 'bold 27px "CharacterReview", sans-serif'; c.fillText('八套现有人物 · 软陶 Canvas 升级', 38, 49);
c.font = '15px "CharacterReview", sans-serif'; c.fillStyle = '#766455'; c.fillText('真实预设字段 / 原脚底锚点 / 既有起始衣物 / 无存档读取', 38, 78);
const hashes = [], stats = [];
D.avatarPresets.forEach((preset, i) => {
  const x = 30 + i % 4 * 304, y = 102 + Math.floor(i / 4) * 369, art = createCanvas(256, 360), ctx = art.getContext('2d');
  G.draw.avatar(ctx, D.avatarPresetLook(preset.id), 128, 323, 1.65, direct);
  const pixels = ctx.getImageData(0, 0, 256, 360).data, hash = crypto.createHash('sha256').update(pixels).digest('hex'); hashes.push(hash);
  let count = 0, top = 360, left = 256, right = 0, bottom = 0;
  for (let yy = 0; yy < 360; yy++) for (let xx = 0; xx < 256; xx++) if (pixels[(yy * 256 + xx) * 4 + 3] > 12) { count++; top = Math.min(top, yy); left = Math.min(left, xx); right = Math.max(right, xx); bottom = Math.max(bottom, yy); }
  assert.ok(count > 15000 && top > 0 && left > 0 && right < 255 && bottom < 359, preset.id + ' 应完整入画且有人体');
  stats.push({ id: preset.id, name: preset.name, pixels: count, bounds: { top, left, right, bottom }, sha256: hash });
  c.fillStyle = '#F3F0E1'; c.beginPath(); c.roundRect(x, y, 288, 353, 20); c.fill(); c.strokeStyle = '#DED6BF'; c.lineWidth = 1; c.stroke();
  c.drawImage(art, x + 40, y + 7, 208, 292.5);
  c.textAlign = 'center'; c.fillStyle = '#4D5144'; c.font = 'bold 18px "CharacterReview", sans-serif'; c.fillText(preset.name, x + 144, y + 308);
  c.fillStyle = '#766455'; c.font = '12px "CharacterReview", sans-serif'; c.fillText(D.avatarHairStyles.find(h => h.id === preset.hair).name + ' · ' + D.avatarFaces.find(f => f.id === preset.face).name, x + 144, y + 331); c.textAlign = 'left';
});
assert.equal(new Set(hashes).size, 8);
fs.writeFileSync(path.join(output, 'characters-lineup.png'), canvas.toBuffer('image/png'));
// 同一外观缩放、裙装/裤装与全部既有衣物的实际像素合成，检查透明边界与绘图异常。
const catalog = createCanvas(1500, 1050), cc = catalog.getContext('2d'); cc.fillStyle = '#FFFAEF'; cc.fillRect(0, 0, 1500, 1050);
cc.fillStyle = '#4D5144'; cc.font = 'bold 22px "CharacterReview", sans-serif'; cc.fillText('60 件现有衣物 · 同一人物绘制接口', 28, 35);
D.outfits.forEach((item, i) => {
  const avatar = D.defaultAvatar(), x = 75 + i % 12 * 125, y = 218 + Math.floor(i / 12) * 202;
  if (item.category === 'acc') avatar.acc = [item.id]; else if (item.category === 'dress') avatar.dress = item.id;
  else if (item.category === 'top' || item.category === 'bottom') { avatar.dress = null; avatar.top = 'top_cloud'; avatar.bottom = 'bottom_cream'; avatar[item.category] = item.id; } else avatar.shoes = item.id;
  G.draw.avatar(cc, avatar, x, y, .78, direct); cc.font = '10px "CharacterReview", sans-serif'; cc.fillStyle = '#574442'; cc.textAlign = 'center'; cc.fillText(item.name, x, y + 18);
});
fs.writeFileSync(path.join(output, 'characters-catalog.png'), catalog.toBuffer('image/png'));
// 渐变并非仅声明：同一脸颊区域的颜色包含连续明暗，且四肤色实际不同。
const skins = [];
for (let skin = 0; skin < 4; skin++) {
  const art = createCanvas(150, 190), ctx = art.getContext('2d'); G.draw.avatar(ctx, { ...D.defaultAvatar(), skin, acc: [] }, 75, 178, 1, direct);
  const values = new Set(); for (let yy = 79; yy < 85; yy++) for (let xx = 66; xx < 84; xx++) values.add(Array.from(ctx.getImageData(xx, yy, 1, 1).data).join(','));
  assert.ok(values.size >= 6, '肤色应有真实柔光渐变'); skins.push(Array.from(ctx.getImageData(75, 81, 1, 1).data).join(','));
}
assert.equal(new Set(skins).size, 4);
fs.writeFileSync(path.join(output, 'raster-report.json'), JSON.stringify({ presets: stats, outfitsDrawn: D.outfits.length, distinctSkins: skins.length, output }, null, 2));
console.log('3 组实际Canvas像素检查通过（8预设完整入画且不同 / 60衣物合成 / 4肤色渐变）。'); console.log(output);
