(function (G) {
  'use strict';
  // 公开快照只有视觉字段；合成状态只供独立参观文档绘图，永不用于主人存档。
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
  function title(value) {
    need(typeof value === 'string' && [...value].length >= 1 && [...value].length <= 24 && !/[\x00-\x1f\x7f]/.test(value));
    var result = ''; [...value].forEach(function (character) { if (result.length + character.length <= 32) result += character; }); return result;
  }
  function visualRoom(room, referenced) {
    var wallpaper = pick(room.wallpaper, ['pattern', 'color', 'color2', 'artId']);
    if (wallpaper.artId) referenced.add(wallpaper.artId);
    return { wallpaper: wallpaper, floor: pick(room.floor, ['pattern', 'color']), light: room.light, items: room.items.map(function (item) { if (item.artId) referenced.add(item.artId); return pick(item, itemKeys); }) };
  }
  function visualRoomShape(room, ordinary) {
    shape(room, ordinary ? ['type', 'wallpaper', 'floor', 'light', 'items'] : ['wallpaper', 'floor', 'light', 'items']);
    shape(room.wallpaper, ['pattern', 'color', 'color2', 'artId'], ['artId']);
    shape(room.floor, ['pattern', 'color']); need(Array.isArray(room.items));
    room.items.forEach(function (item) { shape(item, itemKeys, ['depth', 'artId']); });
  }
  function project(validatedSave, options) {
    var state = G.store.validate(validatedSave), referenced = new Set(), rooms = {};
    Object.keys(state.house.rooms).forEach(function (id) { rooms[id] = Object.assign({ type: state.house.rooms[id].type }, visualRoom(state.house.rooms[id], referenced)); });
    var house = { name: title(options && options.title), exterior: pick(state.house.exterior, exteriorKeys), floors: state.house.floors.map(function (floor) { return { slots: floor.slots.slice() }; }), rooms: rooms, yard: { items: state.house.yard.items.map(function (item) { return pick(item, ['uid', 'defId', 'x', 'y', 'z', 'flip', 'color']); }) }, attic: !!state.house.attic };
    // 仅新增独立视觉字段，不公开建造凭据、观星记录或私人作品名称。
    if (state.house.attic) house.atticRoom = visualRoom(state.house.attic.room, referenced);
    return {
      version: 1,
      house: house,
      avatar: pick(state.avatar, lookKeys),
      residents: Object.keys(state.residents).filter(function (id) { return state.residents[id].movedIn; }).sort().map(function (id) { return { id: id, roomId: state.residents[id].roomId }; }),
      customArts: state.customArts.filter(function (art) { return referenced.has(art.id); }).map(function (art) { return { id: art.id, pixels: art.pixels }; })
    };
  }
  function materialize(snapshot) {
    need(typeof snapshot === 'object' && snapshot !== null && JSON.stringify(snapshot).length <= 2500000);
    shape(snapshot, ['version', 'house', 'avatar', 'residents', 'customArts']); need(snapshot.version === 1);
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
    return G.store.validate(state);
  }
  G.publicHouse = { project: project, materialize: materialize };
})(window.Game);
