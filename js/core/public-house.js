(function (G) {
  'use strict';
  // 新公开快照直接携带建筑视觉文档；完整状态合成仅保留给旧快照兼容读取。
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var copy = function (value) { return JSON.parse(JSON.stringify(value)); };
  var lookKeys = ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'];
  var exteriorKeys = ['roof', 'wall', 'window', 'door', 'chimney', 'roofColor', 'wallColor'];
  var itemKeys = ['uid', 'defId', 'x', 'y', 'z', 'flip', 'color', 'parent', 'depth', 'artId'];
  function need(value) { if (!value) throw new Error('这座公开小屋的内容没有通过检查，请返回邻居列表重新打开。'); }
  function record(value) { return !!value && Object.prototype.toString.call(value) === '[object Object]'; }
  function shape(value, keys, optional) {
    need(record(value)); optional = optional || [];
    Object.keys(value).forEach(function (key) { need(key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && keys.indexOf(key) >= 0); });
    keys.forEach(function (key) { if (optional.indexOf(key) < 0) need(own(value, key)); });
  }
  function pick(value, keys) { var out = {}; keys.forEach(function (key) { if (own(value, key)) out[key] = copy(value[key]); }); return out; }
  function publicBuilding(value) {
    need(window.CottageBuilding && typeof window.CottageBuilding.validateDocument === 'function');
    var checked = window.CottageBuilding.validateDocument(value, G.data.furnitureById);
    // 只发布可见建筑，不把旧档来源摘要、房间映射或私人扩展一起透传。
    var building = {
      schema: checked.schema, revision: checked.revision,
      floors: checked.floors.map(function (floor) { return pick(floor, ['id', 'name', 'elevation']); }),
      walls: checked.walls.map(function (wall) { return pick(wall, ['id', 'floorId', 'start', 'end', 'height', 'thickness', 'color', 'artId', 'pattern']); }),
      openings: checked.openings.map(function (opening) { return pick(opening, ['id', 'wallId', 'kind', 'offset', 'width', 'height', 'sill']); }),
      furniture: checked.furniture.map(function (item) { return pick(item, ['id', 'defId', 'floorId', 'position', 'rotation', 'dimensions', 'color', 'artId']); })
    };
    return window.CottageBuilding.validateDocument(building, G.data.furnitureById);
  }
  function title(value) {
    need(typeof value === 'string' && [...value].length >= 1 && [...value].length <= 24 && !/[\x00-\x1f\x7f]/.test(value));
    var result = ''; [...value].forEach(function (character) { if (result.length + character.length <= 32) result += character; }); return result;
  }
  function visualRoomShape(room, ordinary) {
    shape(room, ordinary ? ['type', 'wallpaper', 'floor', 'light', 'items'] : ['wallpaper', 'floor', 'light', 'items']);
    shape(room.wallpaper, ['pattern', 'color', 'color2', 'artId'], ['artId']);
    shape(room.floor, ['pattern', 'color']); need(Array.isArray(room.items));
    room.items.forEach(function (item) { shape(item, itemKeys, ['depth', 'artId']); });
  }
  function project(validatedSave, options) {
    var state = G.store.validate(validatedSave), referenced = new Set();
    // house仅保留外壳元信息兼容旧接口；历史布局和历史挂画不是当前公开模样。
    var house = { name: title(options && options.title), exterior: pick(state.house.exterior, exteriorKeys), floors: [{ slots: [null, null, null] }], rooms: {}, yard: { items: [] }, attic: false };
    var building = publicBuilding(state.building);
    building.walls.forEach(function (wall) { if (wall.artId) referenced.add(wall.artId); });
    building.furniture.forEach(function (item) { if (item.artId) referenced.add(item.artId); });
    var publicRoomIds = Object.create(null);
    state.building.floors.forEach(function (floor) {
      window.CottageBuilding.deriveSpaces(state.building, floor.id).forEach(function (space) {
        publicRoomIds[space.id] = space.id;
        if (space.legacyRoomId) publicRoomIds[space.legacyRoomId] = space.id;
      });
    });
    return {
      version: 1,
      house: house,
      building: building,
      avatar: pick(state.avatar, lookKeys),
      // 公开文档没有迁移映射，人物使用可从当前几何重新推导的空间ID；私人历史引用不透传。
      residents: Object.keys(state.residents).filter(function (id) { return state.residents[id].movedIn && own(publicRoomIds, state.residents[id].roomId); }).sort().map(function (id) { return { id: id, roomId: publicRoomIds[state.residents[id].roomId] }; }),
      customArts: state.customArts.filter(function (art) { return referenced.has(art.id); }).map(function (art) { return { id: art.id, pixels: art.pixels }; })
    };
  }
  function materialize(snapshot) {
    need(typeof snapshot === 'object' && snapshot !== null && JSON.stringify(snapshot).length <= 2500000);
    shape(snapshot, ['version', 'house', 'avatar', 'residents', 'customArts', 'building'], ['building']); need(snapshot.version === 1);
    shape(snapshot.house, ['name', 'exterior', 'floors', 'rooms', 'yard', 'attic', 'atticRoom'], ['atticRoom']);
    need(typeof snapshot.house.name === 'string' && snapshot.house.name.length <= 32 && snapshot.house.name.trim() && !/[\x00-\x1f\x7f]/.test(snapshot.house.name));
    shape(snapshot.house.exterior, exteriorKeys); shape(snapshot.avatar, lookKeys);
    need(Array.isArray(snapshot.house.floors) && snapshot.house.floors.length >= 1 && snapshot.house.floors.length <= 4);
    snapshot.house.floors.forEach(function (floor) { shape(floor, ['slots']); need(Array.isArray(floor.slots) && floor.slots.length === 3); });
    need(record(snapshot.house.rooms) && Object.keys(snapshot.house.rooms).length <= 12);
    Object.keys(snapshot.house.rooms).forEach(function (id) {
      need(/^[A-Za-z0-9_-]{1,100}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id));
      visualRoomShape(snapshot.house.rooms[id], true);
    });
    shape(snapshot.house.yard, ['items']); need(Array.isArray(snapshot.house.yard.items));
    snapshot.house.yard.items.forEach(function (item) { shape(item, ['uid', 'defId', 'x', 'y', 'z', 'flip', 'color']); });
    need(typeof snapshot.house.attic === 'boolean' && Array.isArray(snapshot.residents) && snapshot.residents.length <= G.data.residents.length && Array.isArray(snapshot.customArts) && snapshot.customArts.length <= 20);
    if (own(snapshot.house, 'atticRoom')) { need(snapshot.house.attic === true); visualRoomShape(snapshot.house.atticRoom, false); }
    snapshot.residents.forEach(function (resident) { shape(resident, ['id', 'roomId']); });
    snapshot.customArts.forEach(function (art) { shape(art, ['id', 'pixels']); });
    var state = G.store.defaultState(); state.level = G.data.balance.maxLevel;
    state.house = copy(snapshot.house); state.house.exterior.owned = G.data.defaultExterior().owned;
    ['roof', 'wall', 'window', 'door', 'chimney'].forEach(function (key) { state.house.exterior.owned[state.house.exterior[key]] = true; });
    Object.keys(state.house.rooms).forEach(function (id) { state.house.rooms[id].paidPrice = 0; });
    // 旧boolean快照补空，新快照回到同一个私有形状；视觉中转字段不留在合成状态。
    state.house.attic = snapshot.house.attic ? { type: 'observatory', paidPrice: 1000, builtAt: 0, room: own(snapshot.house, 'atticRoom') ? copy(snapshot.house.atticRoom) : G.store.newAtticRoom() } : null;
    delete state.house.atticRoom;
    state.avatar = Object.assign(copy(snapshot.avatar), { owned: G.data.defaultAvatar().owned, outfits: [] });
    ['top', 'bottom', 'dress', 'shoes'].forEach(function (key) { if (state.avatar[key]) state.avatar.owned[state.avatar[key]] = true; });
    state.avatar.acc.forEach(function (id) { state.avatar.owned[id] = true; });
    state.customArts = snapshot.customArts.map(function (art) { return { id: art.id, name: '公开画作', pixels: art.pixels }; });
    state.residents = {};
    snapshot.residents.forEach(function (resident) {
      need(!own(state.residents, resident.id)); state.residents[resident.id] = { movedIn: true, roomId: resident.roomId, affection: 0, happiness: 50, heartBubbles: 0, lastBubbleAt: 0, patsToday: 0 };
    });
    if (own(snapshot, 'building')) state.building = publicBuilding(snapshot.building);
    else delete state.building;
    return G.store.validate(state);
  }
  function readBuilding(snapshot) {
    need(record(snapshot) && JSON.stringify(snapshot).length <= 2500000);
    shape(snapshot, ['version', 'house', 'avatar', 'residents', 'customArts', 'building'], ['building']); need(snapshot.version === 1);
    // 新参观页直接读取空间文档；仅旧版视觉快照需要走兼容迁移。
    return own(snapshot, 'building') ? publicBuilding(snapshot.building) : publicBuilding(materialize(snapshot).building);
  }
  G.publicHouse = { project: project, materialize: materialize, readBuilding: readBuilding };
})(window.Game);
