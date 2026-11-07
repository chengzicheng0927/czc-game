/* 保存像素与作品引用同一次提交；画作不占普通家具库存，也不冒充收集品。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.creativeConfig, B = D.balance;
  const clone = value => G.utils.clone(value), fail = message => ({ ok: false, message });
  const rawArt = id => G.state.customArts.find(art => art.id === id);
  function status() {
    const hasStudio = Object.values(G.state.house.rooms).some(room => room.type === C.roomType), unlocked = G.state.level >= C.unlockLv && hasStudio;
    return { unlocked, reason: unlocked ? C.texts.ready : G.state.level < C.unlockLv ? C.texts.needLevel : C.texts.needStudio, count: G.state.customArts.length, maxArts: C.maxArts, hasStudio, unlockLv: C.unlockLv };
  }
  function list() { return clone(G.state.customArts); }
  function get(id) { const art = rawArt(id); return art ? clone(art) : null; }
  function memory(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories); }
  function statistic(state, name) {
    state.quests.stats[name] = (state.quests.stats[name] || 0) + 1;
    state.quests.daily.list.forEach(entry => { const definition = D.dailyQuests.find(item => item.id === entry.id); if (definition?.metric === name) { entry.progress++; entry.done = entry.progress >= definition.target; } });
  }
  function changed(id, type) { G.bus.emit('creative:changed', { id, type }); }
  function newId() {
    for (let attempt = 0; attempt < 8; attempt++) { const id = G.utils.uid('art'); if (!rawArt(id)) return id; }
    throw new Error('这幅画的名字牌还没准备好，稍后再试一次吧。');
  }
  function save(options) {
    const available = status(); if (!available.unlocked) return fail(available.reason);
    if (!options || typeof options !== 'object' || Array.isArray(options)) return fail(C.texts.invalidPixels);
    if (options.id !== undefined && !rawArt(options.id)) return fail('这幅画暂时找不到啦，原作品没有改变。');
    if (options.id === undefined && G.state.customArts.length >= C.maxArts) return fail(C.texts.full);
    let art;
    try {
      art = D.validateCreativeArt({ id: options.id === undefined ? newId() : options.id, name: typeof options.name === 'string' ? options.name.trim() : options.name, pixels: options.pixels });
      G.store.update(state => {
        const existing = state.customArts.findIndex(value => value.id === art.id);
        if (options.id !== undefined && existing < 0) throw new Error('画作刚刚有了变化，请重新打开。');
        if (existing >= 0) state.customArts[existing] = clone(art);
        else { if (state.customArts.length >= C.maxArts) throw new Error(C.texts.full); state.customArts.push(clone(art)); }
        memory(state, (existing >= 0 ? '为「' : '画下「') + art.name + (existing >= 0 ? '」添上新的颜色。' : '」，把小小灵感收进画册。'));
      }, { persist: true });
    } catch (error) { return fail(error.message === C.texts.invalidName || error.message === C.texts.invalidPixels ? error.message : C.texts.unavailable); }
    changed(art.id, options.id === undefined ? 'created' : 'updated');
    return { ok: true, art: clone(art), message: options.id === undefined ? '画作收好啦！可以装框挂墙，也可以设计自己的墙纸。' : '新的颜色已经保存，挂画和墙纸也会一起更新。' };
  }
  function rename(id, name) {
    const art = rawArt(id); if (!art) return fail('这幅画暂时找不到啦。');
    return save({ id, name, pixels: art.pixels });
  }
  function remove(id) {
    const art = rawArt(id); if (!art) return fail('这幅画已经收好或移走啦。');
    try {
      G.store.update(state => {
        const index = state.customArts.findIndex(value => value.id === id); if (index < 0) throw new Error('这幅画暂时找不到啦。');
        state.customArts.splice(index, 1);
        G.store.decorRooms(state).forEach(([, room]) => {
          room.items = room.items.filter(item => !(item.defId === C.frameId && item.artId === id));
          if (room.wallpaper.artId === id) room.wallpaper = { pattern: 'solid', color: room.wallpaper.color, color2: room.wallpaper.color2 };
        });
        memory(state, '整理画册，移走「' + art.name + '」及它的挂画和墙纸引用。');
      }, { persist: true });
    } catch (_) { return fail(C.texts.unavailable); }
    // 旧装饰撤销中可能还有已删作品引用，不能把它恢复成孤立挂件。
    if (G.sys.decorating.clearUndo) G.sys.decorating.clearUndo();
    if (G.runtime.selected?.roomId && !G.store.decorRoom(G.state, G.runtime.selected.roomId)?.items.some(item => item.uid === G.runtime.selected.uid)) G.runtime.selected = null;
    changed(id, 'removed'); return { ok: true, message: '画作已移走，相关挂画与墙纸也整理好了。' };
  }
  function placement(id) {
    for (const [roomId, room] of G.store.decorRooms(G.state)) { const item = room.items.find(value => value.defId === C.frameId && value.artId === id); if (item) return { roomId, uid: item.uid }; }
    return null;
  }
  function place(id, roomId, x, y) {
    const available = status(); if (!available.unlocked) return fail(available.reason);
    const art = rawArt(id), room = G.store.decorRoom(G.state, roomId);
    if (!art || !room) return fail('先选一幅画和一间已经建好的房间吧。');
    const existing = placement(id); if (existing) return Object.assign(fail('这幅画已经挂在小屋里啦，可以直接拖动它换个位置。'), existing, { artId: id });
    if (x !== undefined && (typeof x !== 'number' || !Number.isFinite(x)) || y !== undefined && (typeof y !== 'number' || !Number.isFinite(y))) return fail('请选择墙面上的位置。');
    const count = G.store.decorRooms(G.state).reduce((total, [, value]) => total + value.items.length, G.state.house.yard.items.length);
    if (count >= B.maxItems) return fail('小屋已经很热闹啦，先收起一件家具再挂画吧。');
    const uid = G.utils.uid('painting'), position = { x: G.utils.clamp(x === undefined ? (B.roomWidth - C.frameWidth) / 2 : x, 0, B.roomWidth - C.frameWidth), y: G.utils.clamp(y === undefined ? (B.ceilingLine + B.wallBottom - C.frameHeight) / 2 : y, B.ceilingLine, B.wallBottom - C.frameHeight) };
    try {
      G.store.update(state => {
        const target = G.store.decorRoom(state, roomId);
        if (!state.customArts.some(value => value.id === id) || !target || G.store.decorRooms(state).some(([, value]) => value.items.some(item => item.defId === C.frameId && item.artId === id))) throw new Error('小屋刚刚有了变化，请重新打开画册。');
        target.items.push({ uid, defId: C.frameId, artId: id, x: position.x, y: position.y, z: Math.max(0, ...target.items.map(item => item.z)) + 1, flip: false, color: null, parent: null });
        statistic(state, 'itemsPlaced'); memory(state, '把「' + art.name + '」装进小相框，挂在温暖的墙上。');
      }, { persist: true });
    } catch (_) { return fail(C.texts.unavailable); }
    if (G.sys.decorating.clearUndo) G.sys.decorating.clearUndo();
    G.bus.emit('item:placed', { roomId, uid, defId: C.frameId, artId: id }); changed(id, 'placed');
    return { ok: true, message: '画作挂好啦！可以在房间里拖动，找到最喜欢的位置。', roomId, uid, artId: id };
  }
  function wallpaper(roomId, id) {
    const available = status(); if (!available.unlocked) return fail(available.reason);
    const art = rawArt(id), room = G.store.decorRoom(G.state, roomId); if (!art || !room) return fail('先选一幅画和一间已经建好的房间吧。');
    if (room.wallpaper.pattern === 'custom' && room.wallpaper.artId === id) return { ok: true, unchanged: true, roomId, artId: id, message: '这间房已经穿着这幅画的墙纸啦。' };
    try {
      G.store.update(state => {
        const target = G.store.decorRoom(state, roomId);
        if (!state.customArts.some(value => value.id === id) || !target) throw new Error('房间刚刚有了变化，请重新打开画册。');
        target.wallpaper = { pattern: 'custom', color: target.wallpaper.color, color2: target.wallpaper.color2, artId: id };
        statistic(state, 'wallpaperChanges'); memory(state, '用「' + art.name + '」设计墙纸，让自己的颜色铺满一间小屋。');
      }, { persist: true });
    } catch (_) { return fail(C.texts.unavailable); }
    if (G.sys.decorating.clearUndo) G.sys.decorating.clearUndo();
    G.bus.emit('room:decorated', { roomId, artId: id }); changed(id, 'wallpaper');
    return { ok: true, roomId, artId: id, message: '自己的墙纸铺好啦！画板更新时，这份颜色也会一起长大。' };
  }
  async function download(id) {
    const art = rawArt(id); if (!art) return fail('这幅画暂时找不到啦。');
    try {
      if (typeof document === 'undefined' || !G.draw?.creative) throw new Error('画板暂时没能展开，可以先导出JSON保存作品。');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = C.exportSize;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器暂时无法绘制画作，请先导出JSON备份。');
      G.draw.creative.drawPixels(ctx, art.pixels, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png'); if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('画作暂时没能下载，请再试一次。');
      const binary = atob(data.slice(data.indexOf(',') + 1)), bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0)), name = art.name.replace(/[\\/:*?"<>|]/g, '_');
      if (!G.utils.download('棉花糖小屋画作-' + name + '-' + id.slice(-6) + '.png', bytes, 'image/png')) throw new Error('下载没有准备好，可以先导出JSON保留作品。');
      return { ok: true, message: '512×512的像素画已准备下载，透明背景也会保留。' };
    } catch (error) { return fail(error.message || '画作暂时没能下载，请再试一次。'); }
  }
  G.sys.creative = { status, list, get, save, rename, remove, place, wallpaper, placement, download };
})(window.Game);
