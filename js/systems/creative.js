/* 保存像素与作品引用同一次提交；画作不占普通家具库存，也不冒充收集品。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.creativeConfig, B = D.balance;
  const clone = value => G.utils.clone(value), fail = message => ({ ok: false, message });
  const rawArt = id => G.state.customArts.find(art => art.id === id);
  const domain = () => window.CottageBuilding;
  const rooms = state => Object.values(G.contentSpaces.rooms(state));
  function status() {
    const hasStudio = rooms().some(room => G.contentSpaces.isType(room, C.roomType)), unlocked = G.state.level >= C.unlockLv && hasStudio;
    return { unlocked, reason: unlocked ? C.texts.ready : G.state.level < C.unlockLv ? C.texts.needLevel : C.texts.needStudio, count: G.state.customArts.length, maxArts: C.maxArts, hasStudio, unlockLv: C.unlockLv };
  }
  function list() { return clone(G.state.customArts); }
  function get(id) { const art = rawArt(id); return art ? clone(art) : null; }
  function memory(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories); }
  function statistic(state, name) {
    state.quests.stats[name] = (state.quests.stats[name] || 0) + 1;
    state.quests.daily.list.forEach(entry => { const definition = D.dailyQuests.find(item => item.id === entry.id); if (definition?.metric === name) { entry.progress++; entry.done = entry.progress >= definition.target; } });
  }
  function changed(id, type, details) { G.bus.emit('creative:changed', Object.assign({ id, type }, details || {})); }
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
        let building = state.building;
        const wallIds = building.walls.filter(wall => wall.artId === id).map(wall => wall.id);
        if (wallIds.length) building = domain().executeCommand(building, { type: 'wall.decorate', wallIds, artId: null }, D.furnitureById);
        for (const item of building.furniture.filter(item => item.artId === id)) building = domain().executeCommand(building, { type: 'entity.remove', id: item.id }, D.furnitureById);
        state.building = building; state.customArts.splice(index, 1);
        memory(state, '整理画册，移走「' + art.name + '」及它的挂画和墙纸引用。');
      }, { persist: true });
    } catch (_) { return fail(C.texts.unavailable); }
    // 新建筑宿主收到removed后清理历史，不能让撤销恢复不存在的作品引用。
    if (G.runtime.selected?.uid && !G.state.building.furniture.some(item => item.id === G.runtime.selected.uid)) G.runtime.selected = null;
    changed(id, 'removed'); return { ok: true, message: '画作已移走，相关挂画与墙纸也整理好了。' };
  }
  function placement(id) {
    const item = G.state.building.furniture.find(value => value.defId === C.frameId && value.artId === id);
    if (!item) return null;
    const room = rooms().find(value => value.floorId === item.floorId && value.items.some(entry => entry.uid === item.id));
    return { roomId: room?.id || null, floorId: item.floorId, uid: item.id, artId: id };
  }
  function wallLength(wall) { return Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z); }
  function surfaces(state, targetId) {
    const direct = state.building.walls.find(wall => wall.id === targetId);
    if (direct) return { room: null, floorId: direct.floorId, segments: [{ wall: direct, from: 0, to: wallLength(direct), side: 1 }] };
    const room = G.contentSpaces.get(targetId, state) || rooms(state).find(value => value.spaceId === targetId);
    if (!room) return null;
    const segments = [];
    for (const polygon of [room.polygon].concat(room.holes || [])) for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index], b = polygon[(index + 1) % polygon.length], ex = b.x - a.x, ez = b.z - a.z;
      for (const wall of state.building.walls.filter(value => value.floorId === room.floorId)) {
        const dx = wall.end.x - wall.start.x, dz = wall.end.z - wall.start.z, length = wallLength(wall);
        if (Math.abs(dx * (a.z - wall.start.z) - dz * (a.x - wall.start.x)) > .00001 * length || Math.abs(dx * ez - dz * ex) > .00001 * length) continue;
        const offset = point => ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / length;
        const first = offset(a), last = offset(b), from = Math.max(0, Math.min(first, last)), to = Math.min(length, Math.max(first, last));
        if (to - from > .00001) segments.push({ wall, from, to, side: dx * ex + dz * ez >= 0 ? 1 : -1 });
      }
    }
    return { room, floorId: room.floorId, segments };
  }
  function mountingPosition(state, target, dimensions, options) {
    const candidates = target.segments.filter(segment => !options.wallId || segment.wall.id === options.wallId).sort((a, b) => (b.to - b.from) - (a.to - a.from));
    for (const segment of candidates) {
      const wall = segment.wall, length = wallLength(wall), half = dimensions.width / 2;
      if (segment.to - segment.from < dimensions.width + .04 || wall.height < dimensions.height + .1) continue;
      const bottom = options.bottom === undefined ? Math.min(1.2, wall.height - dimensions.height - .05) : options.bottom;
      if (!Number.isFinite(bottom) || bottom < 0 || bottom + dimensions.height > wall.height) continue;
      const openings = state.building.openings.filter(opening => opening.wallId === wall.id);
      const centers = options.offset === undefined ? [(segment.from + segment.to) / 2, segment.from + half + .03, segment.to - half - .03].concat(openings.flatMap(opening => [opening.offset - half - .03, opening.offset + opening.width + half + .03])) : [options.offset];
      for (const center of centers) {
        if (!Number.isFinite(center) || center - half < segment.from + .01 || center + half > segment.to - .01) continue;
        if (openings.some(opening => center - half < opening.offset + opening.width && center + half > opening.offset && bottom < opening.sill + opening.height && bottom + dimensions.height > opening.sill)) continue;
        const dx = (wall.end.x - wall.start.x) / length, dz = (wall.end.z - wall.start.z) / length, offset = wall.thickness / 2 + dimensions.depth / 2 + .015;
        return { wallId: wall.id, position: { x: wall.start.x + dx * center - dz * offset * segment.side, y: bottom, z: wall.start.z + dz * center + dx * offset * segment.side }, rotation: Math.atan2(dz, dx) + (segment.side < 0 ? Math.PI : 0) };
      }
    }
    return null;
  }
  function place(id, targetId, options) {
    const available = status(); if (!available.unlocked) return fail(available.reason);
    const art = rawArt(id), target = surfaces(G.state, targetId);
    if (!art || !target?.segments.length) return fail('先选一幅画和实际围合的空间，或指定一面墙吧。');
    const existing = placement(id); if (existing) return Object.assign(fail('这幅画已经挂在小屋里啦，可以直接拖动它换个位置。'), existing, { artId: id });
    if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['wallId', 'offset', 'bottom'].includes(key)))) return fail('请选择真实墙面位置；偏移与高度使用米。');
    options = options || {};
    const dimensions = domain().furnitureDimensions(D.furnitureById[C.frameId]), mount = mountingPosition(G.state, target, dimensions, options);
    if (!mount) return fail('这面墙没有足够的完整位置挂画，请换一面墙或避开门窗。');
    const uid = G.utils.uid('painting'), roomId = target.room?.id || null, entity = { id: uid, defId: C.frameId, artId: id, floorId: target.floorId, position: mount.position, rotation: mount.rotation, dimensions }, buildingBefore = clone(G.state.building);
    try {
      G.store.update(state => {
        if (!state.customArts.some(value => value.id === id) || !state.building.walls.some(wall => wall.id === mount.wallId) || state.building.furniture.some(item => item.artId === id && item.defId === C.frameId)) throw new Error('小屋刚刚有了变化，请重新打开画册。');
        state.building = domain().executeCommand(state.building, { type: 'furniture.add', furniture: entity }, D.furnitureById);
        statistic(state, 'itemsPlaced'); memory(state, '把「' + art.name + '」装进小相框，挂在温暖的墙上。');
      }, { persist: true });
    } catch (_) { return fail(C.texts.unavailable); }
    const buildingAfter = clone(G.state.building);
    G.bus.emit('item:placed', { roomId, floorId: target.floorId, uid, defId: C.frameId, artId: id });
    changed(id, 'placed', { buildingBefore, buildingAfter, label: '挂上「' + art.name + '」' });
    return { ok: true, message: '画作挂在真实墙面上啦，可以继续调整位置。', roomId, floorId: target.floorId, wallId: mount.wallId, uid, artId: id };
  }
  function wallpaper(targetId, id) {
    const available = status(); if (!available.unlocked) return fail(available.reason);
    const art = rawArt(id), target = surfaces(G.state, targetId); if (!art || !target?.segments.length) return fail('先选一幅画和真实围合空间，或明确选择一面墙吧。');
    const wallIds = [...new Set(target.segments.map(segment => segment.wall.id))], roomId = target.room?.id || null;
    if (wallIds.every(wallId => G.state.building.walls.find(wall => wall.id === wallId)?.artId === id)) return { ok: true, unchanged: true, roomId, wallIds, floorId: target.floorId, artId: id, message: '所选墙面已经使用这幅画的墙纸啦。' };
    const buildingBefore = clone(G.state.building);
    try {
      G.store.update(state => {
        if (!state.customArts.some(value => value.id === id)) throw new Error('作品刚刚有了变化，请重新打开画册。');
        state.building = domain().executeCommand(state.building, { type: 'wall.decorate', wallIds, artId: id }, D.furnitureById);
        statistic(state, 'wallpaperChanges'); memory(state, '用「' + art.name + '」设计墙纸，让自己的颜色住进真实墙面。');
      }, { persist: true });
    } catch (_) { return fail(C.texts.unavailable); }
    const buildingAfter = clone(G.state.building);
    G.bus.emit('room:decorated', { roomId, floorId: target.floorId, wallIds, artId: id });
    changed(id, 'wallpaper', { buildingBefore, buildingAfter, label: '铺上「' + art.name + '」墙纸' });
    return { ok: true, roomId, floorId: target.floorId, wallIds, artId: id, message: '自己的墙纸已应用到真实墙面，修改画作时也会一起更新。' };
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
