'use strict';
// Canvas编码使用替身，只检查拍照成功/失败的事务、容量与下载边界，不替代真实照片目视验收。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..');
const JPEG = 'data:image/jpeg;base64,/9j/AA==', PNG = 'data:image/png;base64,iVBORw0KGgo=';
function setup() {
  let clock = 100000, encodeError = false;
  const calls = [], downloads = [], blobs = new Map(), RealDate = Date;
  class TestDate extends RealDate { static now() { return clock; } }
  function canvas(width = 0, height = 0) {
    const context = { drawImage(...args) { calls.push(args); }, measureText(text) { return { width: [...text].length * 10 }; } };
    for (const method of ['save', 'restore', 'setTransform', 'clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'translate', 'rotate', 'scale', 'bezierCurveTo', 'quadraticCurveTo', 'fillText']) context[method] = () => {};
    return { width, height, getContext() { return context; }, toDataURL(type) { if (encodeError) throw new Error('encode failed'); return type === 'image/png' ? PNG : JPEG; } };
  }
  const source = canvas(1400, 900);
  const document = { hidden: false, addEventListener() {}, getElementById(id) { return id === 'scene' ? source : null; }, body: { append() {}, appendChild() {} }, createElement(tag) { if (tag === 'canvas') return canvas(); if (tag === 'a') return { style: {}, remove() {}, click() { downloads.push({ href: this.href, filename: this.download }); } }; throw new Error('unexpected element ' + tag); } };
  class Image { set src(value) { this.value = value; Promise.resolve().then(() => this.onload()); } }
  const c = vm.createContext({ console, Date: TestDate, document, Image, Blob, atob, URL: { createObjectURL(blob) { const id = 'blob:photo-' + blobs.size; blobs.set(id, blob); return id; }, revokeObjectURL() {} }, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); c.window = c;
  for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/photography.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/render/photo-decoration.js', 'js/systems/photography.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  spaces.register(c.Game, c.CottageBuilding); c.Game.store.init();
  return { G: c.Game, source, document, canvas, calls, downloads, blobs, at: value => { clock = value; }, encodingFails: value => { encodeError = value; } };
}
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
test('取景预览不记录照片，轻量JPEG宽480且保持画布宽高比', () => {
  const { G, calls } = setup(), before = JSON.stringify(G.state), preview = G.sys.photography.preview();
  assert.ok(preview.ok); assert.equal(preview.width, 480); assert.equal(preview.height, 309); assert.equal(preview.image, JPEG); assert.equal(JSON.stringify(G.state), before); assert.ok(calls.length > 0);
});
test('快门成功才写相册、真实拍摄累计、回忆与事件，大PNG只保留运行时一份', () => {
  const { G } = setup(), events = []; G.bus.on('photo:captured', event => events.push(event));
  const result = G.sys.photography.capture(); assert.ok(result.ok); assert.equal(G.state.album.length, 1); assert.equal(G.state.quests.stats.photos, 1); assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(result.photo).sort(), ['at', 'decor', 'height', 'id', 'image', 'name', 'width']);
  assert.equal(G.runtime.latestPhoto.id, result.photo.id); assert.equal(G.runtime.latestPhoto.canvas.width, 1400); assert.equal(G.runtime.latestPhoto.png, undefined); assert.ok(!JSON.stringify(G.state).includes('image/png')); assert.ok(G.state.memories.at(-1).text.includes('拍下'));
});
test('一秒内重复点击、后台和未准备好的镜头均不增加计数或改变原相册', () => {
  const { G, at, source, document } = setup(); assert.ok(G.sys.photography.capture().ok); let before = JSON.stringify(G.state);
  assert.equal(G.sys.photography.capture().ok, false); assert.equal(JSON.stringify(G.state), before);
  at(102000); document.hidden = true; assert.equal(G.sys.photography.capture().ok, false); assert.equal(JSON.stringify(G.state), before);
  document.hidden = false; G.sys.photography.clearDraft(); source.width = 0; assert.equal(G.sys.photography.capture().ok, false); assert.equal(JSON.stringify(G.state), before);
  source.width = 1400; assert.ok(G.sys.photography.capture().ok); assert.equal(G.state.quests.stats.photos, 2);
});
test('相册12张后明确拒绝新拍，原12张和累计计数保留且没有自动覆盖', () => {
  const { G, at } = setup(); for (let i = 0; i < 12; i++) { at(100000 + i * 1000); assert.ok(G.sys.photography.capture().ok); }
  const before = JSON.stringify(G.state); at(120000); assert.equal(G.sys.photography.capture().ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(G.state.quests.stats.photos, 12);
  const list = G.sys.photography.list(); list[0].name = '不能直接修改原相册'; assert.notEqual(G.state.album[0].name, list[0].name);
});
test('编码失败或存档事务失败不会留下照片、虚增拍摄或占用节流时间', () => {
  const { G, encodingFails } = setup(), before = JSON.stringify(G.state);
  encodingFails(true); assert.equal(G.sys.photography.capture().ok, false); assert.equal(JSON.stringify(G.state), before); encodingFails(false);
  const original = G.store.update; G.store.update = () => { throw new Error('storage validation failed'); };
  assert.equal(G.sys.photography.capture().ok, false); assert.equal(JSON.stringify(G.state), before); G.store.update = original; assert.ok(G.sys.photography.capture().ok);
});
test('换档清掉运行时大图与快门节流，持久相片仍保留', () => {
  const { G } = setup(); assert.ok(G.sys.photography.capture().ok); G.bus.emit('state:replace', G.state);
  assert.equal(G.runtime.latestPhoto, undefined); assert.ok(G.sys.photography.capture().ok); assert.equal(G.state.album.length, 2);
});
test('最新照片下载PNG，旧相册小图可重编码PNG；下载不增加拍照统计', async () => {
  const { G, downloads, blobs, at } = setup(), first = G.sys.photography.capture().photo;
  assert.ok((await G.sys.photography.download(first.id)).ok); assert.match(downloads[0].href, /^blob:/); assert.match(downloads[0].filename, /\.png$/);
  const exported = blobs.get(downloads[0].href); assert.equal(exported.type, 'image/png'); assert.deepEqual(Buffer.from(await exported.arrayBuffer()), Buffer.from(PNG.split(',')[1], 'base64'));
  at(102000); assert.ok(G.sys.photography.capture().ok); assert.ok((await G.sys.photography.download(first.id)).ok); assert.equal(downloads.length, 2);
  const before = JSON.stringify(G.state); assert.equal((await G.sys.photography.download('not_a_photo')).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(G.state.quests.stats.photos, 2);
});
test('整屋/指定房间离屏取景，相同草稿及贴纸编辑不重画世界，主动刷新才更新', () => {
  const { G, canvas } = setup(), frames = [];
  const room = spaces.buildSpace(G, 0, 0, 'bedroom'); assert.ok(room.ok);
  G.render = { captureScene(options) { frames.push(JSON.parse(JSON.stringify(options))); return canvas(1280, 960); } };
  const before = JSON.stringify(G.state), first = G.sys.photography.prepare({ scope: 'house' });
  assert.ok(first.ok); assert.equal(first.width, 1280); assert.equal(frames.length, 1); assert.equal(G.sys.photography.prepare({ scope: 'house' }).canvas, first.canvas);
  const decor = { frame: 'strawberry', caption: '把今天装进小屋', stickers: [{ uid: 'heart_1', stickerId: 'heart', x: .4, y: .6, scale: 1.2 }] };
  assert.ok(G.sys.photography.preview({ decor }).ok); assert.equal(frames.length, 1); assert.equal(JSON.stringify(G.state), before);
  assert.ok(G.sys.photography.prepare({ scope: 'room', roomId: room.roomId }).ok); assert.equal(frames.length, 2); assert.equal(frames[1].roomId, room.roomId);
  assert.ok(G.sys.photography.prepare({ scope: 'room', roomId: room.roomId, fresh: true }).ok); assert.equal(frames.length, 3);
  assert.equal(G.sys.photography.prepare({ scope: 'room', roomId: 'missing' }).ok, false); assert.ok(G.sys.photography.capture({ decor }).ok); assert.equal(frames.length, 3); assert.equal(G.state.album[0].width, 480); assert.equal(G.state.album[0].height, 360);
  G.sys.photography.clearDraft(); assert.ok(G.sys.photography.prepare({ scope: 'house' }).ok); assert.equal(frames.length, 4);
});
test('反复改名与编辑只更新装饰，不压缩基础JPEG或增加拍照数，返回值深复制', async () => {
  const { G } = setup(), first = G.sys.photography.capture().photo, rawImage = first.image;
  const decor = { frame: 'starry', caption: '晚安，小屋🌙', stickers: [{ uid: 'one', stickerId: 'moon', x: .9, y: .1, scale: 3 }] };
  assert.ok(G.sys.photography.updateDecor(first.id, decor).ok); decor.stickers[0].x = 0;
  assert.equal(G.state.album[0].decor.stickers[0].x, .9); assert.ok(G.sys.photography.rename(first.id, '  新的珍藏名字🌷  ').ok); assert.equal(G.state.album[0].name, '新的珍藏名字🌷');
  assert.equal(G.state.album[0].image, rawImage); assert.equal(G.state.quests.stats.photos, 1); assert.ok((await G.sys.photography.image(first.id)).ok);
  const snapshot = G.sys.photography.list(); snapshot[0].decor.stickers[0].scale = .4; assert.equal(G.state.album[0].decor.stickers[0].scale, 3);
  const before = JSON.stringify(G.state);
  for (const invalid of [{ frame: 'none', caption: '两\n行', stickers: [] }, { frame: 'missing', caption: '', stickers: [] }, { frame: 'none', caption: '', stickers: [{ uid: 'one', stickerId: 'moon', x: 1.01, y: 0, scale: 1 }] }]) assert.equal(G.sys.photography.updateDecor(first.id, invalid).ok, false);
  for (const invalid of ['', '多\n行', '花'.repeat(31)]) assert.equal(G.sys.photography.rename(first.id, invalid).ok, false);
  assert.equal(JSON.stringify(G.state), before);
});
test('回收/恢复保留照片原数据且不加次数；永久清除只作用回收夹，查询与下载支持回收照片', async () => {
  const { G } = setup(), photo = G.sys.photography.capture().photo, serialized = JSON.stringify(photo);
  assert.equal(G.sys.photography.purge(photo.id).ok, false); assert.ok(G.sys.photography.remove(photo.id).ok); assert.equal(G.state.album.length, 0); assert.equal(JSON.stringify(G.state.albumTrash[0]), serialized);
  assert.ok((await G.sys.photography.base(photo.id)).ok); assert.ok((await G.sys.photography.image(photo.id)).ok); assert.ok((await G.sys.photography.download(photo.id)).ok);
  assert.equal(G.sys.photography.updateDecor(photo.id, G.data.defaultPhotoDecor()).ok, false);
  const trash = G.sys.photography.trash(); trash[0].decor.frame = 'cream'; assert.equal(G.state.albumTrash[0].decor.frame, 'none');
  assert.ok(G.sys.photography.restore(photo.id).ok); assert.equal(JSON.stringify(G.state.album[0]), serialized);
  assert.ok(G.sys.photography.remove(photo.id).ok); assert.ok(G.sys.photography.purge(photo.id).ok); assert.equal(G.state.albumTrash.length, 0); assert.equal(G.runtime.latestPhoto, undefined); assert.equal(G.state.quests.stats.photos, 1);
});
test('回收夹满拒绝移动，相册满拒绝恢复，二十四张原图都不被覆盖', () => {
  const { G, at } = setup();
  for (let i = 0; i < 12; i++) { at(100000 + i * 1000); const result = G.sys.photography.capture(); assert.ok(result.ok); assert.ok(G.sys.photography.remove(result.photo.id).ok); }
  for (let i = 0; i < 12; i++) { at(120000 + i * 1000); assert.ok(G.sys.photography.capture().ok); }
  const before = JSON.stringify(G.state); assert.equal(G.sys.photography.remove(G.state.album[0].id).ok, false); assert.equal(G.sys.photography.restore(G.state.albumTrash[0].id).ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(G.state.quests.stats.photos, 24);
});
test('编辑、回收、恢复和清除事务失败保留原图及累计历史', () => {
  const { G } = setup(), photo = G.sys.photography.capture().photo, update = G.store.update;
  const rejected = fn => { const before = JSON.stringify(G.state); G.store.update = () => { throw new Error('3MB save limit'); }; assert.equal(fn().ok, false); assert.equal(JSON.stringify(G.state), before); G.store.update = update; };
  rejected(() => G.sys.photography.rename(photo.id, '不会被保存')); rejected(() => G.sys.photography.updateDecor(photo.id, { frame: 'cream', caption: '家', stickers: [] })); rejected(() => G.sys.photography.remove(photo.id));
  assert.ok(G.sys.photography.remove(photo.id).ok); rejected(() => G.sys.photography.restore(photo.id)); rejected(() => G.sys.photography.purge(photo.id)); assert.equal(G.state.quests.stats.photos, 1);
});
test('旧六键照片保持兼容；添加装饰后独立存储，刷新后从旧JPEG合成PNG', async () => {
  const { G } = setup(), photo = G.sys.photography.capture().photo;
  G.store.update(state => { delete state.album[0].decor; state.album[0].width = 414; state.album[0].height = 600; });
  G.bus.emit('state:replace', G.state); const old = await G.sys.photography.base(photo.id); assert.ok(old.ok); assert.equal(old.width, 414); assert.equal(old.height, 600);
  assert.ok((await G.sys.photography.download(photo.id)).ok); assert.equal(Object.keys(G.state.album[0]).length, 6);
  assert.ok(G.sys.photography.updateDecor(photo.id, { frame: 'forest', caption: '旧时光也有新心意', stickers: [] }).ok); assert.equal(Object.keys(G.state.album[0]).length, 7); assert.equal(G.state.album[0].image, JPEG); assert.equal(G.state.quests.stats.photos, 1);
});
(async () => { let passed = 0; for (const entry of tests) { await entry.fn(); passed++; console.log('✓ ' + entry.name); } console.log('\n' + passed + ' 组基础摄影事务检查通过（模拟编码，不代表真实照片验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
