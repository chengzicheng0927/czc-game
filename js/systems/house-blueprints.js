/* 整栋建造先准备完整迁居清单，确认后一次保存；不改旧房间归档或朋友的生活记录。 */
(function (G) {
  'use strict';
  const D = G.data, own = (value, key) => Object.prototype.hasOwnProperty.call(value, key), clone = value => G.utils.clone(value);
  const fail = message => ({ ok: false, message });
  let applying = false, archiveEpoch = 0;
  G.bus.on('state:replace', () => { archiveEpoch++; });
  function exteriorParts(exterior) { const result = clone(exterior); delete result.owned; return result; }
  function readOnly() { return G.runtime.mode === 'visit' || !!G.render?.visit?.active?.() || G.store.canWrite && !G.store.canWrite(); }
  // 纯识别接口供编辑器与显示层共用；既有庭院ID继续有效，不从旧house归档补发物件。
  function isYardFloor(value) { const id = typeof value === 'string' ? value : value?.id; return typeof id === 'string' && id.includes('yard'); }
  function isYardFurniture(item, catalog = D.furnitureById) { return isYardFloor(item.floorId) || item.legacyRoomId === 'yard' || catalog[item.defId]?.place === 'yard'; }
  function yardFor(document) {
    const floors = document.floors.filter(isYardFloor).map(floor => Object.assign(clone(floor), { elevation: 0 }));
    // 新房也带稳定的空院地面；打开庭院面板不必另写一份建筑、打断刚建房的撤销。
    if (!floors.length) floors.push({ id: 'legacy_yard', name: '前院', elevation: 0 });
    const floorIds = new Set(floors.map(floor => floor.id));
    const furniture = document.furniture.filter(item => isYardFurniture(item)).map(item => {
      const kept = clone(item);
      // 上版把前院物件放到当前室内层；只修楼层归属，UID、坐标和所有装饰字段保留。
      if (!floorIds.has(kept.floorId)) {
        if (!floorIds.has('legacy_yard')) { floors.push({ id: 'legacy_yard', name: '前院', elevation: 0 }); floorIds.add('legacy_yard'); }
        kept.floorId = 'legacy_yard';
      }
      return kept;
    });
    const walls = document.walls.filter(wall => floorIds.has(wall.floorId)).map(clone), wallIds = new Set(walls.map(wall => wall.id));
    const openings = document.openings.filter(opening => wallIds.has(opening.wallId)).map(clone);
    return { floors, walls, openings, furniture };
  }
  function buildingFor(definition, state) {
    const document = { schema: 2, revision: state.building.revision + 1, floors: [], walls: [], openings: [], furniture: [] };
    definition.floors.forEach((plan, index) => {
      const prefix = 'bp_' + definition.id + '_' + index, floorId = prefix + '_floor';
      document.floors.push({ id: floorId, name: plan.name, elevation: plan.elevation });
      plan.walls.forEach((wall, wallIndex) => document.walls.push({ id: prefix + '_wall_' + wallIndex, floorId, start: clone(wall.start), end: clone(wall.end), height: 2.35, thickness: .14, color: definition.wallColor }));
      plan.openings.forEach((opening, openingIndex) => document.openings.push({ id: prefix + '_opening_' + openingIndex, wallId: prefix + '_wall_' + opening.wall, kind: opening.kind, offset: opening.offset, width: opening.width, height: opening.height, sill: opening.sill }));
    });
    const yard = yardFor(state.building);
    for (const key of ['floors', 'walls', 'openings', 'furniture']) document[key].push(...yard[key]);
    return window.CottageBuilding.validateDocument(document, D.furnitureById);
  }
  // 房型比较只看真实空间结构；家具、画作、墙纸和实体编号不应让同一房型变成可误清空的“新房”。
  function geometry(document) {
    const floors = document.floors.filter(floor => !isYardFloor(floor)), elevations = new Map(floors.map(floor => [floor.id, floor.elevation])), walls = new Map();
    const wallRows = document.walls.filter(wall => elevations.has(wall.floorId)).map(wall => {
      const reverse = wall.start.x > wall.end.x || wall.start.x === wall.end.x && wall.start.z > wall.end.z;
      const start = reverse ? wall.end : wall.start, end = reverse ? wall.start : wall.end;
      const row = [elevations.get(wall.floorId), start.x, start.z, end.x, end.z, wall.height, wall.thickness];
      walls.set(wall.id, { row, reverse, length: Math.hypot(end.x - start.x, end.z - start.z) }); return row;
    });
    const openings = document.openings.filter(opening => walls.has(opening.wallId)).map(opening => { const wall = walls.get(opening.wallId); return [wall.row, opening.kind, wall.reverse ? wall.length - opening.offset - opening.width : opening.offset, opening.width, opening.height, opening.sill]; });
    const sort = rows => rows.map(row => JSON.stringify(row)).sort();
    return JSON.stringify([floors.map(floor => floor.elevation).sort((a, b) => a - b), sort(wallRows), sort(openings)]);
  }
  function inspect(state, id) {
    if (typeof id !== 'string' || !own(D.houseBlueprintById, id)) return fail('先选一栋喜欢的小屋吧。');
    const definition = D.houseBlueprintById[id], roof = D.exteriorById[definition.roofId];
    const building = buildingFor(definition, state), exterior = clone(state.house.exterior), owned = exterior.owned[roof.id] === true;
    exterior.roof = roof.id; exterior.roofColor = definition.roofColor; exterior.wallColor = definition.wallColor;
    // 只替换免费的默认木墙；孩子已经选择的付费墙面继续保留。
    if (exterior.wall === 'wall_wood' || exterior.wall === 'wall_toy') exterior.wall = 'wall_toy';
    const cost = { coin: 0, heart: 0 }; if (!owned) cost[roof.currency] = roof.price;
    const houseFloors = building.floors.filter(floor => !isYardFloor(floor));
    const rooms = houseFloors.flatMap(floor => window.CottageBuilding.deriveSpaces(building, floor.id).sort((a, b) => {
      const min = (space, key) => Math.min(...space.polygon.map(point => point[key]));
      return min(a, 'z') - min(b, 'z') || min(a, 'x') - min(b, 'x') || a.id.localeCompare(b.id);
    })).map(space => ({ id: space.id, floorId: space.floorId, area: space.area }));
    if (rooms.length !== definition.roomCount) throw new Error('房型的真实围合空间与图纸不一致。');
    const returnedInventory = {}, removedPaintings = [], overflow = [];
    state.building.furniture.forEach(item => {
      const furniture = D.furnitureById[item.defId];
      if (!furniture) throw new Error('原小屋里有尚未识别的家具，请先保留JSON备份。');
      if (isYardFurniture(item)) return;
      if (furniture.customArt) { removedPaintings.push({ id: item.id, artId: item.artId || null }); return; }
      returnedInventory[item.defId] = (returnedInventory[item.defId] || 0) + 1;
    });
    Object.keys(returnedInventory).forEach(defId => { if ((state.inventory[defId] || 0) + returnedInventory[defId] > 9999) overflow.push(defId); });
    const residentIds = Object.keys(state.residents).filter(residentId => state.residents[residentId].movedIn).sort();
    const capacity = rooms.length * D.balance.maxResidentsPerRoom, roomAssignments = residentIds.map((residentId, index) => ({ residentId, previousRoomId: state.residents[residentId].roomId, roomId: rooms[Math.floor(index / D.balance.maxResidentsPerRoom)]?.id || null }));
    const locked = state.level < roof.unlockLv, canAfford = state.wallet.coin >= cost.coin && state.wallet.heart >= cost.heart;
    const selected = geometry(state.building) === geometry(building) && ['roof', 'wall', 'roofColor', 'wallColor'].every(key => String(state.house.exterior[key]).toUpperCase() === String(exterior[key]).toUpperCase());
    const readonly = readOnly();
    const reason = readonly ? '现在只能看看小屋，请回到自己的小屋再建造。' : locked ? '小屋到 Lv.' + roof.unlockLv + '，就能建这栋房子啦。' : overflow.length ? '背包里有家具超过9999件，先整理一些，再为小屋搬家吧。' : residentIds.length > capacity ? '这栋小屋最多住' + capacity + '位朋友，已经入住的' + residentIds.length + '位朋友需要更大的房子。' : !canAfford ? '还差' + [state.wallet.coin < cost.coin ? (cost.coin - state.wallet.coin) + '颗糖果' : '', state.wallet.heart < cost.heart ? (cost.heart - state.wallet.heart) + '颗爱心' : ''].filter(Boolean).join('和') + '，可以先看看房型。' : selected ? '小屋已经是这个房型啦，家具和装饰可以继续自己搭配。' : '确认后建好整栋房子，屋内家具回到背包，庭院、花园、画作和朋友都会保留。';
    // 只绑定会影响本次迁居和费用的事实；玩耍计时、好感或泡泡变化不会打断确认。
    const quote = JSON.stringify([archiveEpoch, id, definition, state.building, state.house.exterior, state.level, state.wallet, state.inventory,
      Object.keys(state.residents).sort().map(residentId => [residentId, state.residents[residentId].movedIn, state.residents[residentId].roomId || null]), state.customArts.map(art => art.id).sort()]);
    return { ok: true, id, name: definition.name, description: definition.description, roofId: roof.id, building, document: clone(building), exterior, rooms, roomCount: rooms.length, floorCount: houseFloors.length, roomAssignments, returnedInventory, removedPaintings,
      cost, price: roof.price, currency: roof.currency, level: roof.unlockLv, unlockLv: roof.unlockLv, owned, locked, selected, canAfford, capacity, residentCount: residentIds.length, canApply: !readonly && !locked && !overflow.length && residentIds.length <= capacity && canAfford && !selected, quote, reason, message: reason };
  }
  function preview(id) {
    try { return inspect(G.state, id); }
    catch (_) { return fail('房型图纸暂时没有准备好，原小屋和物品都保留着，请先下载JSON备份。'); }
  }
  function apply(id, expectedQuote) {
    if (applying) return fail('正在把小屋和朋友安顿好，稍等一下吧。');
    const status = preview(id); if (!status.ok) return status;
    if (typeof expectedQuote !== 'string' || expectedQuote !== status.quote) return fail('小屋或背包刚刚有了变化，请重新预览房型再确认。');
    if (status.selected) return { ok: true, unchanged: true, id, message: status.reason };
    if (!status.canApply) return fail(status.reason);
    const buildingBefore = clone(G.state.building), exteriorBefore = exteriorParts(G.state.house.exterior), roomMaps = { before: {}, after: {} };
    status.roomAssignments.forEach(assignment => { roomMaps.before[assignment.residentId] = assignment.previousRoomId; roomMaps.after[assignment.residentId] = assignment.roomId; });
    applying = true;
    try {
      G.store.update(state => {
        const next = inspect(state, id);
        if (!next.ok || next.quote !== expectedQuote || !next.canApply) throw new Error('小屋的迁居清单刚刚有了变化，请重新预览。');
        state.wallet.coin -= next.cost.coin; state.wallet.heart -= next.cost.heart;
        Object.keys(next.returnedInventory).forEach(defId => { state.inventory[defId] = (state.inventory[defId] || 0) + next.returnedInventory[defId]; });
        state.house.exterior.owned[next.roofId] = true;
        ['roof', 'wall', 'roofColor', 'wallColor'].forEach(key => { state.house.exterior[key] = next.exterior[key]; });
        state.building = clone(next.building);
        next.roomAssignments.forEach(assignment => { state.residents[assignment.residentId].roomId = assignment.roomId; });
        state.memories.push({ at: Date.now(), text: '一砖一瓦建好「' + next.name + '」，屋内家具收回背包，庭院和花园保持原样，朋友带着原来的友谊一起搬进新家。' });
        if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
      }, { persist: true });
      const result = { ok: true, id, name: status.name, message: status.name + '建好啦！屋内家具在背包里，院子和花园也还在，快来布置新家吧。', cost: clone(status.cost), roomCount: status.roomCount, floorCount: status.floorCount,
        buildingBefore, buildingAfter: clone(G.state.building), exteriorBefore, exteriorAfter: exteriorParts(G.state.house.exterior), roomMaps, roomAssignments: clone(status.roomAssignments), returnedInventory: clone(status.returnedInventory), inventoryDelta: clone(status.returnedInventory), removedPaintings: clone(status.removedPaintings) };
      if (!status.owned) G.bus.emit('exterior:bought', { id: status.roofId, category: 'roof', blueprintId: id });
      G.bus.emit('exterior:changed', { category: 'roof', id: status.roofId, blueprintId: id });
      G.bus.emit('house:rebuilt', result); return result;
    } catch (error) { return fail(error.message || '这次小屋还没有保存，原来的房子、朋友和糖果都保持原样。'); }
    finally { applying = false; }
  }
  G.sys.houseBlueprints = { list() { return D.houseBlueprints.map(definition => preview(definition.id)); }, preview, apply, isYardFloor, isYardFurniture };
})(window.Game);
