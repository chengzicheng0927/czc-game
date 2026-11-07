'use strict';
// 可选的真实PNG证据：人工底图与内存相册，不加载scene、不读取账号/私人照片。
// 产品不依赖Canvas包；PHOTO_EDITOR_CANVAS_MODULE必须指向验收机已有安装。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
if (!process.env.PHOTO_EDITOR_CANVAS_MODULE) throw new Error('请用 PHOTO_EDITOR_CANVAS_MODULE 指定已有 @napi-rs/canvas 路径。');
const { createCanvas, Image, loadImage, GlobalFonts } = require(process.env.PHOTO_EDITOR_CANVAS_MODULE);
const root = path.resolve(__dirname, '..');
const output = process.env.PHOTO_EDITOR_REVIEW_DIR || '/tmp/marshmallow-photo-editor-visual-v2-20261030';
fs.mkdirSync(output, { recursive: true });
const fonts = [];
for (const [file, families] of [
  ['/System/Library/Fonts/STHeiti Medium.ttc', ['PhotoReview', 'PingFang SC']],
  ['/System/Library/Fonts/Apple Color Emoji.ttc', ['Apple Color Emoji']]
]) if (fs.existsSync(file)) for (const family of families) {
  GlobalFonts.registerFromPath(file, family); fonts.push({ file, family });
}
let now = 1793325600000, sequence = 0, jpegEncodes = 0, worldCaptures = 0;
const downloads = [], writes = [], events = new Map(), files = [];
function canvas(width = 1, height = 1) {
  const value = createCanvas(width, height), encode = value.toDataURL.bind(value);
  value.toDataURL = (type, quality) => { if (type === 'image/jpeg') jpegEncodes++; return encode(type, quality); };
  return value;
}
// 只用几何色块构造人工相纸底图；不是主游戏场景渲染结果。
function syntheticBase(width, height) {
  const image = canvas(width, height), c = image.getContext('2d');
  c.fillStyle = '#dcece9'; c.fillRect(0, 0, width, height);
  c.fillStyle = '#f8f1d8'; c.beginPath(); c.ellipse(width * .51, height * .59, width * .38, height * .30, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c7d8b6'; c.beginPath(); c.ellipse(width * .51, height * .73, width * .40, height * .12, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e6b7a0'; c.fillRect(width * .30, height * .35, width * .40, height * .31);
  c.fillStyle = '#ce998f'; c.beginPath(); c.moveTo(width * .25, height * .36); c.lineTo(width * .50, height * .15); c.lineTo(width * .75, height * .36); c.closePath(); c.fill();
  c.fillStyle = '#fff7df'; c.fillRect(width * .35, height * .42, width * .10, height * .10); c.fillRect(width * .56, height * .42, width * .10, height * .10);
  c.fillStyle = '#8caca3'; c.fillRect(width * .47, height * .51, width * .08, height * .15);
  c.fillStyle = '#56776e'; c.font = Math.max(16, Math.min(width, height) * .024) + 'px "PhotoReview", sans-serif'; c.textAlign = 'center';
  c.fillText('人工合成底图 · 非主场景截图', width / 2, height * .82);
  return image;
}
const landscape = syntheticBase(1280, 960), portrait = syntheticBase(960, 1280);
let currentSource = landscape;
const memory = {
  house: { name: '合成验收小屋', rooms: { sample_room: { type: 'bedroom' } } },
  album: [], albumTrash: [], quests: { stats: { photos: 0 }, daily: { list: [] } }, memories: []
};
const G = {
  data: { balance: { maxMemories: 100 }, dailyQuests: [] }, state: memory, runtime: {}, sys: {},
  render: { captureScene() { worldCaptures++; return currentSource; } },
  bus: { on(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); }, emit(type, payload) { (events.get(type) || []).forEach(fn => fn(payload)); } },
  store: { update(change) { assert.equal(arguments.length, 1, '保持普通store.update调用'); change(memory); writes.push(JSON.stringify(memory)); } },
  utils: {
    uid(prefix) { return prefix + '_raster_' + (++sequence); },
    dateKey() { return '2026-10-30'; },
    download(filename, bytes, type) { downloads.push({ filename, bytes: Buffer.from(bytes), type }); return true; }
  }
};
class ReviewDate extends Date { static now() { return now; } }
const document = { hidden: false, createElement(tag) { assert.equal(tag, 'canvas'); return canvas(); } };
const context = vm.createContext({ Game: G, document, Image, Date: ReviewDate, atob, console }); context.window = context;
const loaded = ['js/data/photography.js', 'js/render/photo-decoration.js', 'js/systems/photography.js'];
for (const file of loaded) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const caption = [...'今天的小屋有暖暖阳光和朋友笑声把这份快乐轻轻收进照片里呀'].slice(0, 28).join('') + '🌷✨';
const readableCaption = '阳光洒满小屋朋友围坐一起把今天这份快乐收进相片留作温暖的纪念';
assert.equal([...caption].length, 30);
assert.equal([...readableCaption].length, 30);
assert.equal(JSON.stringify(G.data.photoFrames.map(frame => frame.id)), JSON.stringify(['none', 'cream', 'strawberry', 'forest', 'ocean', 'starry', 'cloud', 'rainbow', 'polaroid']));
assert.equal(G.data.photoStickers.length, 20);
function decor(frame) {
  return G.data.validatePhotoDecor({ frame, caption, stickers: G.data.photoStickers.map((definition, index) => ({
    uid: 'raster_sticker_' + index, stickerId: definition.id,
    x: .12 + index % 5 * .19, y: .12 + Math.floor(index / 5) * .19, scale: .8
  })) });
}
function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
async function exportPng(name, image, expectedWidth, expectedHeight) {
  const bytes = image.toBuffer('image/png'), target = path.join(output, name);
  fs.writeFileSync(target, bytes); const decoded = await loadImage(bytes);
  assert.equal(decoded.width, expectedWidth); assert.equal(decoded.height, expectedHeight);
  files.push({ name, path: target, width: decoded.width, height: decoded.height, sha256: hash(bytes), bytes: bytes.length });
  return bytes;
}
function samePixels(actual, expected, message) {
  const a = actual.getContext('2d').getImageData(0, 0, actual.width, actual.height).data;
  const b = expected.getContext('2d').getImageData(0, 0, expected.width, expected.height).data;
  assert.equal(hash(a), hash(b), message);
}
async function downloadedCanvas(entry) {
  assert.equal(entry.type, 'image/png'); const image = await loadImage(entry.bytes), result = canvas(image.width, image.height);
  result.getContext('2d').drawImage(image, 0, 0); return result;
}
(async () => {
  const before = JSON.stringify(memory), encodesBefore = jpegEncodes;
  const sheet = canvas(1656, 1430), c = sheet.getContext('2d');
  c.fillStyle = '#fff8e9'; c.fillRect(0, 0, sheet.width, sheet.height);
  c.fillStyle = '#5f6652'; c.font = 'bold 28px "PhotoReview", sans-serif'; c.fillText('真实九框 · 20种贴纸 · 30码点配文', 28, 40);
  c.font = '16px "PhotoReview", sans-serif'; c.fillText('人工1280×960底图 / 原photoDecoration.draw / 合成内存 / 非DOM整页截图', 28, 70);
  const frameHashes = [];
  for (const [index, definition] of G.data.photoFrames.entries()) {
    const image = canvas(1280, 960); G.draw.photoDecoration.draw(image, landscape, decor(definition.id));
    const bytes = await exportPng('frame-' + definition.id + '.png', image, 1280, 960); frameHashes.push(hash(bytes));
    const x = 28 + index % 3 * 548, y = 102 + Math.floor(index / 3) * 440;
    c.fillStyle = '#5f6652'; c.font = 'bold 18px "PhotoReview", sans-serif'; c.fillText(definition.name + ' · ' + definition.id, x, y + 19);
    c.drawImage(image, x, y + 32, 504, 378);
  }
  assert.equal(new Set(frameHashes).size, 9, '九框实际像素应不同');
  await exportPng('nine-frames-sheet.png', sheet, 1656, 1430);
  const tall = canvas(960, 1280); G.draw.photoDecoration.draw(tall, portrait, decor('polaroid'));
  await exportPng('portrait-20-stickers.png', tall, 960, 1280);
  // 保留原混合中文+emoji证据。NAPI不等同浏览器字体回退，另补可读的30中文码点对照。
  const readableSheet = canvas(1656, 1430), rc = readableSheet.getContext('2d');
  rc.fillStyle = '#fff8e9'; rc.fillRect(0, 0, readableSheet.width, readableSheet.height);
  rc.fillStyle = '#5f6652'; rc.font = 'bold 28px "PhotoReview", sans-serif'; rc.fillText('真实九框 · 20种贴纸 · 30个中文码点配文', 28, 40);
  rc.font = '16px "PhotoReview", sans-serif'; rc.fillText('可读配文对照 / 原混合emoji图保留 / 原photoDecoration.draw未改动', 28, 70);
  for (const [index, definition] of G.data.photoFrames.entries()) {
    const image = canvas(1280, 960), value = decor(definition.id); value.caption = readableCaption;
    G.draw.photoDecoration.draw(image, landscape, value);
    const x = 28 + index % 3 * 548, y = 102 + Math.floor(index / 3) * 440;
    rc.fillStyle = '#5f6652'; rc.font = 'bold 18px "PhotoReview", sans-serif'; rc.fillText(definition.name + ' · ' + definition.id, x, y + 19);
    rc.drawImage(image, x, y + 32, 504, 378);
    if (definition.id === 'strawberry') await exportPng('readable-caption-landscape.png', image, 1280, 960);
  }
  await exportPng('nine-frames-readable-caption-sheet.png', readableSheet, 1656, 1430);
  const readableTall = canvas(960, 1280), readableTallDecor = decor('polaroid'); readableTallDecor.caption = readableCaption;
  G.draw.photoDecoration.draw(readableTall, portrait, readableTallDecor);
  await exportPng('readable-caption-portrait.png', readableTall, 960, 1280);
  assert.equal(JSON.stringify(memory), before, '纯绘制不写内存相册');
  assert.equal(jpegEncodes, encodesBefore, '换框/贴纸/配文只合成，不编码JPEG');
  console.log('✓ 九框、20真实贴纸、30码点配文和横竖比例PNG可解码；绘制零存档/零JPEG编码');

  assert.ok(G.sys.photography.prepare({ scope: 'house' }).ok); assert.equal(worldCaptures, 1);
  const draft = decor('strawberry'), captured = G.sys.photography.capture({ scope: 'house', decor: draft });
  assert.ok(captured.ok); assert.equal(worldCaptures, 1); assert.equal(memory.quests.stats.photos, 1);
  const rawJpeg = captured.photo.image, originalName = captured.photo.name, afterCaptureEncodes = jpegEncodes;
  draft.frame = 'ocean'; draft.caption = '未保存的新草稿'; draft.stickers[0].x = 0;
  assert.equal(memory.album[0].decor.frame, 'strawberry', '临时decor独立于已保存照片');
  assert.ok((await G.sys.photography.download(captured.photo.id)).ok);
  const savedDownload = await downloadedCanvas(downloads.at(-1)), expected = canvas(1280, 960);
  G.draw.photoDecoration.draw(expected, landscape, captured.photo.decor);
  samePixels(savedDownload, expected, 'download(id)使用已保存的底图与decor，不混后来草稿');
  await exportPng('download-saved-landscape.png', savedDownload, 1280, 960);
  const updatedDecor = decor('forest'); assert.ok(G.sys.photography.updateDecor(captured.photo.id, updatedDecor).ok);
  updatedDecor.caption = '还未保存的又一次更改';
  assert.equal(memory.album[0].image, rawJpeg); assert.equal(memory.album[0].name, originalName);
  assert.equal(memory.quests.stats.photos, 1); assert.equal(jpegEncodes, afterCaptureEncodes);
  assert.equal(worldCaptures, 1, '保存装饰不重画世界');
  console.log('✓ 真实capture/updateDecor/download链保持已保存decor、名字/底图/累计与JPEG编码次数');

  G.bus.emit('state:replace', memory); assert.equal(G.runtime.latestPhoto, undefined);
  const refreshedBase = await G.sys.photography.base(captured.photo.id); assert.ok(refreshedBase.ok);
  assert.equal(refreshedBase.width, 480); assert.equal(refreshedBase.height, 360);
  assert.ok((await G.sys.photography.download(captured.photo.id)).ok);
  const refreshed = await downloadedCanvas(downloads.at(-1)), refreshedExpected = canvas(480, 360);
  G.draw.photoDecoration.draw(refreshedExpected, refreshedBase.canvas, memory.album[0].decor);
  samePixels(refreshed, refreshedExpected, '刷新后从持久小JPEG重建并合成已保存装饰');
  await exportPng('download-refreshed-small-jpeg.png', refreshed, 480, 360);
  currentSource = portrait; now += 2000;
  const tallCapture = G.sys.photography.capture({ scope: 'house', fresh: true, decor: decor('polaroid') }); assert.ok(tallCapture.ok);
  assert.equal(tallCapture.photo.width, 450); assert.equal(tallCapture.photo.height, 600);
  assert.ok((await G.sys.photography.download(tallCapture.photo.id)).ok);
  const tallDownloaded = await downloadedCanvas(downloads.at(-1)); await exportPng('download-saved-portrait.png', tallDownloaded, 960, 1280);
  const retained = JSON.stringify(memory); document.hidden = true;
  assert.equal(G.sys.photography.capture({ scope: 'house' }).ok, false); assert.equal(JSON.stringify(memory), retained);
  console.log('✓ 刷新后小JPEG重建与竖幅真实PNG；后台拒拍不改相册');
  // 仅测试机字体别名探针：原配文链包含Microsoft YaHei，追加系统emoji族以调查缺字。
  // 不改产品font或draw，不覆盖上方原混合图；像素是否恢复仍须目视，PNG解码不证明字形正确。
  const emojiFont = '/System/Library/Fonts/Apple Color Emoji.ttc';
  const fallbackProbe = { baseline: 'frame-strawberry.png', aliasFamily: 'Microsoft YaHei', registered: false, requiresVisualReview: true };
  if (fs.existsSync(emojiFont)) {
    fallbackProbe.registered = !!GlobalFonts.registerFromPath(emojiFont, fallbackProbe.aliasFamily);
    if (fallbackProbe.registered) {
      const probe = canvas(1280, 960); G.draw.photoDecoration.draw(probe, landscape, decor('strawberry'));
      fallbackProbe.probe = 'mixed-caption-fallback-probe.png'; await exportPng(fallbackProbe.probe, probe, 1280, 960);
    }
  }
  fs.writeFileSync(path.join(output, 'raster-report.json'), JSON.stringify({
    loaded, syntheticOnly: true, initializedScene: false, sourceSizes: [[1280, 960], [960, 1280]],
    frameIds: G.data.photoFrames.map(frame => frame.id), stickerIds: G.data.photoStickers.map(sticker => sticker.id),
    caption, captionCodePoints: [...caption].length, readableCaption, readableCaptionCodePoints: [...readableCaption].length,
    fallbackProbe, fonts, worldCaptures, jpegEncodes, memoryWrites: writes.length,
    downloadCount: downloads.length, files,
    limitations: ['合成人工底图，不代表主场景摄影', '离屏Canvas证据，不代表DOM桌面/390px布局、真实键盘/触屏或HUD验收', 'NAPI原混合配文末尾emoji曾目视为缺字框；原图保留，另补30中文码点可读对照；显式字体别名探针需另行目视，不视为产品修复', '系统emoji字形由验收机字体决定', '使用普通内存store.update替身，不证明同步落盘或拒写原子保证']
  }, null, 2));
  console.log('3组真实Canvas/摄影PNG检查通过；证据：' + output);
})().catch(error => { console.error(error); process.exitCode = 1; });
