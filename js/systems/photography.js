/* 纯场景摄影与可恢复相册；存档只存未装饰的小JPEG，装饰独立保存。 */
(function (G) {
  'use strict';
  const MAX_PHOTOS = 12, MAX_IMAGE_LENGTH = 120000;
  let lastCaptureAt = null, draft = null;
  const fail = message => ({ ok: false, message });
  const clone = value => JSON.parse(JSON.stringify(value));
  const allPhotos = () => G.state.album.concat(G.state.albumTrash || []);
  const find = id => allPhotos().find(photo => photo.id === id);
  const decorOf = photo => photo.decor || G.data.defaultPhotoDecor();
  function sourceCanvas() {
    const source = typeof document !== 'undefined' && document.getElementById('scene');
    if (!source || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width < 1 || source.height < 1 || typeof source.toDataURL !== 'function') throw new Error('镜头还没准备好，回到小屋后再试一次吧。');
    return source;
  }
  function newCanvas(width, height) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    if (!canvas.getContext('2d')) throw new Error('这台浏览器暂时不能绘制照片，可以先导出JSON保存小屋。');
    return canvas;
  }
  function copyCanvas(source, maxWidth, maxHeight) {
    const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height), canvas = newCanvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height); return canvas;
  }
  function jpeg(canvas) {
    let image = '';
    for (const quality of [.7, .58, .45, .32]) {
      image = canvas.toDataURL('image/jpeg', quality);
      if (image.length <= MAX_IMAGE_LENGTH) break;
    }
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > MAX_IMAGE_LENGTH) throw new Error('照片暂时没能装进小相册，换一个简单些的镜头再试试吧。');
    return { image, width: canvas.width, height: canvas.height };
  }
  function framing(options) {
    options = options || {};
    const scope = options.scope || 'house';
    if (!['house', 'room', 'view'].includes(scope)) throw new Error('请先选择整屋或一个已建好的房间。');
    const value = { scope };
    if (scope === 'room') { if (typeof options.roomId !== 'string' || !G.contentSpaces.get(options.roomId, G.state)) throw new Error('这间房还没有建好，先选一间温暖的小屋吧。'); value.roomId = options.roomId; }
    return value;
  }
  function prepare(options) {
    try {
      const settings = framing(options), key = JSON.stringify(settings);
      if (!draft || draft.key !== key || options?.fresh) {
        const canvas = G.render?.captureScene ? G.render.captureScene(settings) : copyCanvas(sourceCanvas(), 2560, 2560);
        if (!canvas || !canvas.width || !canvas.height) throw new Error('镜头还没准备好，再试一次吧。');
        draft = { key, canvas };
      }
      return { ok: true, canvas: draft.canvas, width: draft.canvas.width, height: draft.canvas.height };
    } catch (error) { return fail(error.message || '镜头还没准备好，再试一次吧。'); }
  }
  function clearDraft() { draft = null; }
  function prepared(options) {
    if (options && (options.scope || options.roomId || options.fresh)) return prepare(options);
    return draft ? { ok: true, canvas: draft.canvas, width: draft.canvas.width, height: draft.canvas.height } : prepare({ scope: 'view' });
  }
  function paint(target, decor, source) {
    const base = source || draft?.canvas;
    if (!base) throw new Error('先选择一处想拍下的风景吧。');
    return G.draw.photoDecoration.draw(target, base, decor || G.data.defaultPhotoDecor());
  }
  function preview(options) {
    try {
      const preparedPhoto = prepared(options); if (!preparedPhoto.ok) return preparedPhoto;
      const canvas = copyCanvas(preparedPhoto.canvas, 480, 600), base = preparedPhoto.canvas;
      paint(canvas, options?.decor, base); return Object.assign({ ok: true }, jpeg(canvas));
    } catch (error) { return fail(error.message || '镜头还没准备好，再试一次吧。'); }
  }
  function list() { return clone(G.state.album); }
  function trash() { return clone(G.state.albumTrash || []); }
  function uniqueId() {
    for (let attempt = 0; attempt < 8; attempt++) { const id = G.utils.uid('photo'); if (!find(id)) return id; }
    throw new Error('照片编号还没准备好，请稍后再试。');
  }
  function capture(options) {
    if (document.hidden) return fail('先回到小屋，再拍一张喜欢的照片吧。');
    if (G.state.album.length >= MAX_PHOTOS) return fail('12张小相片都收好啦。把暂时不用的相片移到回收夹，就能拍下新的时光。');
    const now = Date.now();
    if (lastCaptureAt !== null && now - lastCaptureAt < 1000) return fail('上一张刚拍好，等一小会儿再按快门吧。');
    let photo, source;
    try {
      const decor = G.data.validatePhotoDecor(options?.decor || G.data.defaultPhotoDecor()), preparedPhoto = prepared(options);
      if (!preparedPhoto.ok) return preparedPhoto;
      source = preparedPhoto.canvas;
      const picture = jpeg(copyCanvas(source, 480, 600));
      photo = Object.assign({ id: uniqueId(), at: now, name: [...G.state.house.name].slice(0, 20).join('') + '的小屋时光' }, picture, { decor });
      G.store.update(state => {
        if (state.album.length >= MAX_PHOTOS || state.album.concat(state.albumTrash || []).some(value => value.id === photo.id)) throw new Error('相册刚刚有了变化，请重新打开后再拍。');
        state.album.push(photo); state.quests.stats.photos = Math.min(1000000000, (state.quests.stats.photos || 0) + 1);
        state.quests.daily.list.forEach(entry => { const definition = G.data.dailyQuests.find(item => item.id === entry.id); if (definition?.metric === 'photos') { entry.progress++; entry.done = entry.progress >= definition.target; } });
        state.memories.push({ at: now, text: '拍下「' + photo.name + '」，把小屋今天的模样收进相册。' });
        if (state.memories.length > G.data.balance.maxMemories) state.memories.splice(0, state.memories.length - G.data.balance.maxMemories);
      });
    } catch (error) { return fail('照片没有保存，原相册保持原样。' + (error.message || '请先下载JSON存档，再试一次。')); }
    lastCaptureAt = now;
    // 大图仅缓存最新一张；取景草稿与它共用画布，旧照片随时可从轻量JPEG重建。
    G.runtime.latestPhoto = { id: photo.id, canvas: source };
    G.bus.emit('photo:captured', { id: photo.id, at: photo.at });
    return { ok: true, photo: clone(photo), message: '咔嚓！小屋的这一刻，已经收进相册啦。' };
  }
  async function base(id) {
    const photo = find(id); if (!photo) return fail('这张相片暂时找不到啦，重新打开相册看看吧。');
    try {
      if (G.runtime.latestPhoto?.id === id && G.runtime.latestPhoto.canvas) {
        const canvas = G.runtime.latestPhoto.canvas; return { ok: true, canvas, width: canvas.width, height: canvas.height };
      }
      const image = await new Promise((resolve, reject) => { const source = new Image(); source.onload = () => resolve(source); source.onerror = () => reject(new Error('相片没能打开，请导出JSON保留它后再试。')); source.src = photo.image; });
      const canvas = newCanvas(photo.width, photo.height); canvas.getContext('2d').drawImage(image, 0, 0, photo.width, photo.height);
      return { ok: true, canvas, width: canvas.width, height: canvas.height };
    } catch (error) { return fail(error.message || '相片暂时没能打开，请再试一次。'); }
  }
  async function image(idOrPhoto, options) {
    const photo = typeof idOrPhoto === 'string' ? find(idOrPhoto) : idOrPhoto;
    if (!photo) return fail('这张相片暂时找不到啦，重新打开相册看看吧。');
    try {
      const source = await base(photo.id); if (!source.ok) return source;
      const canvas = newCanvas(photo.width, photo.height); paint(canvas, options?.decor || decorOf(photo), source.canvas);
      return Object.assign({ ok: true }, jpeg(canvas));
    } catch (error) { return fail(error.message || '相片暂时没能打开，请再试一次。'); }
  }
  function edit(id, change, message) {
    if (!G.state.album.some(photo => photo.id === id)) return fail('先把这张相片从回收夹恢复，再来整理它吧。');
    try { G.store.update(state => { const photo = state.album.find(value => value.id === id); if (!photo) throw new Error('这张相片暂时找不到啦。'); change(photo); }); }
    catch (error) { return fail('整理没有保存，原相片保持原样。' + (error.message || '请稍后再试。')); }
    return { ok: true, photo: clone(find(id)), message };
  }
  function updateDecor(id, decor) {
    try { const value = G.data.validatePhotoDecor(decor); return edit(id, photo => { photo.decor = value; }, '新的装饰已经收进相片啦。'); }
    catch (error) { return fail(error.message || '请重新选择相片装饰。'); }
  }
  function rename(id, name) {
    if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > 30 || /[\u0000-\u001f\u007f\r\n]/.test(name)) return fail('给相片起一个1到30字的名字吧，放在同一行就好。');
    return edit(id, photo => { photo.name = name.trim(); }, '相片的新名字已经记好啦。');
  }
  function remove(id) {
    if (!G.state.album.some(photo => photo.id === id)) return fail('这张相片暂时找不到啦。');
    if ((G.state.albumTrash || []).length >= MAX_PHOTOS) return fail('回收夹也放满12张啦。先恢复或永久清除其中一张，再整理相册吧。');
    try { G.store.update(state => { const index = state.album.findIndex(photo => photo.id === id); if (index < 0 || state.albumTrash.length >= MAX_PHOTOS) throw new Error('相册刚刚有了变化，请重新打开看看。'); state.albumTrash.push(state.album.splice(index, 1)[0]); }); }
    catch (error) { return fail('相片没有移动，原相册保持原样。' + (error.message || '请稍后再试。')); }
    return { ok: true, message: '相片已放进回收夹，随时可以恢复。' };
  }
  function restore(id) {
    if (!(G.state.albumTrash || []).some(photo => photo.id === id)) return fail('回收夹里没有找到这张相片。');
    if (G.state.album.length >= MAX_PHOTOS) return fail('相册已放满12张啦，先为这张时光腾一个位置吧。');
    try { G.store.update(state => { const index = state.albumTrash.findIndex(photo => photo.id === id); if (index < 0 || state.album.length >= MAX_PHOTOS) throw new Error('相册刚刚有了变化，请重新打开看看。'); state.album.push(state.albumTrash.splice(index, 1)[0]); }); }
    catch (error) { return fail('相片没有恢复，回收夹保持原样。' + (error.message || '请稍后再试。')); }
    return { ok: true, photo: clone(find(id)), message: '珍藏的时光已经回到相册啦。' };
  }
  // 产品界面必须先确认；底层只永久删除回收夹中的指定一张。
  function purge(id) {
    if (!(G.state.albumTrash || []).some(photo => photo.id === id)) return fail('回收夹里没有找到这张相片。');
    try { G.store.update(state => { const index = state.albumTrash.findIndex(photo => photo.id === id); if (index < 0) throw new Error('这张相片暂时找不到啦。'); state.albumTrash.splice(index, 1); }); }
    catch (error) { return fail('相片没有清除，回收夹保持原样。' + (error.message || '请稍后再试。')); }
    if (G.runtime.latestPhoto?.id === id) delete G.runtime.latestPhoto;
    return { ok: true, message: '这张相片已永久清除。' };
  }
  function downloadImage(dataUrl, photo) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) return fail('照片还没有准备好，请稍后再下载。');
    // 与JSON共用Blob下载，避免内置浏览器忽略data:图片下载。
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const filename = '棉花糖小屋照片-' + G.utils.dateKey(photo.at) + '-' + photo.id.slice(-6) + '.png';
    if (!G.utils.download(filename, bytes, 'image/png')) return fail('下载没有准备好，可以先导出JSON保留相册。');
    return { ok: true, message: '照片已准备下载。' };
  }
  async function download(id) {
    const photo = find(id); if (!photo) return fail('这张相片暂时找不到啦，重新打开相册看看吧。');
    try {
      const source = await base(id); if (!source.ok) return source;
      const canvas = newCanvas(source.width, source.height); paint(canvas, decorOf(photo), source.canvas);
      return downloadImage(canvas.toDataURL('image/png'), photo);
    } catch (error) { return fail(error.message || '下载没有准备好，请再试一次。'); }
  }
  G.sys.photography = { prepare, clearDraft, paint, capture, preview, base, image, list, trash, download, updateDecor, rename, remove, restore, purge, maxPhotos: MAX_PHOTOS };
  G.bus.on('state:replace', () => { lastCaptureAt = null; clearDraft(); delete G.runtime.latestPhoto; });
})(window.Game);
